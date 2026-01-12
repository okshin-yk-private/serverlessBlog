// Package main provides the UpdateCategory Lambda function for updating blog categories.
//
// Requirement 4: Category Update API
// - 4.1: PUT /admin/categories/{id} with valid data updates category and returns 200
// - 4.2: Require Cognito authorization
// - 4.3: Return 404 if category ID does not exist
// - 4.4: Return 409 Conflict if updating to a slug that already exists on a different category
// - 4.5: Update updatedAt timestamp upon successful update
// - 4.6: Allow partial updates (only fields provided in request body shall be updated)
// - 4.7: When slug is changed, automatically update the category field of all BlogPosts referencing the old slug
package main

import (
	"context"
	"encoding/json"
	"os"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"serverless-blog/go-functions/internal/clients"
	"serverless-blog/go-functions/internal/domain"
	"serverless-blog/go-functions/internal/middleware"
)

// DynamoDBClientInterface defines the interface for DynamoDB operations (for testing)
//
//nolint:dupl // Interface needed both in main and test files for mock
type DynamoDBClientInterface interface {
	GetItem(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error)
	Query(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error)
	PutItem(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error)
	TransactWriteItems(ctx context.Context, params *dynamodb.TransactWriteItemsInput, optFns ...func(*dynamodb.Options)) (*dynamodb.TransactWriteItemsOutput, error)
}

// dynamoClientGetter is a function that returns the DynamoDB client
// This can be overridden in tests
var dynamoClientGetter = func() (DynamoDBClientInterface, error) {
	return clients.GetDynamoDB()
}

// timeNow is a function that returns the current time as ISO 8601 string
// This can be overridden in tests
var timeNow = func() string {
	return time.Now().UTC().Format(time.RFC3339)
}

// Handler handles PUT /admin/categories/{id} requests
// Requirement 4.1: Update category and return 200
// Requirement 4.2: Require Cognito authorization
//
//nolint:gocyclo // Handler validates multiple fields which increases complexity
func Handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Requirement 4.2: Check authentication
	authorID := extractAuthorID(request)
	if authorID == "" {
		return errorResponse(401, "unauthorized")
	}

	// Validate category ID from path parameters
	categoryID := request.PathParameters["id"]
	if categoryID == "" {
		return errorResponse(400, "category ID is required")
	}

	// Parse request body
	var req domain.UpdateCategoryRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return errorResponse(400, "invalid request body")
	}

	// Validate request
	if err := req.Validate(); err != nil {
		return errorResponse(400, err.Error())
	}

	// Check for CATEGORIES_TABLE_NAME
	tableName := os.Getenv("CATEGORIES_TABLE_NAME")
	if tableName == "" {
		return errorResponse(500, "server configuration error")
	}

	// Get posts table name
	postsTableName := os.Getenv("POSTS_TABLE_NAME")
	if postsTableName == "" {
		postsTableName = "BlogPosts"
	}

	// Get slug index name
	slugIndexName := os.Getenv("SLUG_INDEX_NAME")
	if slugIndexName == "" {
		slugIndexName = "SlugIndex"
	}

	// Get category index name
	categoryIndexName := os.Getenv("CATEGORY_INDEX_NAME")
	if categoryIndexName == "" {
		categoryIndexName = "CategoryIndex"
	}

	// Get DynamoDB client
	dynamoClient, err := dynamoClientGetter()
	if err != nil {
		return errorResponse(500, "server error")
	}

	// Requirement 4.3: Get existing category
	existingCategory, err := getExistingCategory(ctx, dynamoClient, tableName, categoryID)
	if err != nil {
		return errorResponse(500, "failed to retrieve category")
	}
	if existingCategory == nil {
		return errorResponse(404, "category not found")
	}

	// Check if slug is being changed
	slugChanged := req.Slug != nil && *req.Slug != existingCategory.Slug

	// Requirement 4.4: Check slug uniqueness if slug is being changed
	if slugChanged {
		slugExists, err := checkSlugExistsForOther(ctx, dynamoClient, tableName, slugIndexName, *req.Slug, categoryID)
		if err != nil {
			return errorResponse(500, "failed to check slug uniqueness")
		}
		if slugExists {
			return errorResponse(409, "category with this slug already exists")
		}
	}

	// Requirement 4.6: Apply partial updates
	updatedCategory := applyUpdates(existingCategory, &req)

	// Requirement 4.5: Update updatedAt timestamp
	updatedCategory.UpdatedAt = timeNow()

	// Requirement 4.7: If slug changed, update all posts referencing old slug
	if slugChanged {
		return updateCategoryWithPosts(ctx, dynamoClient, tableName, postsTableName, categoryIndexName, existingCategory.Slug, updatedCategory)
	}

	// Save updated category to DynamoDB
	if err := saveCategory(ctx, dynamoClient, tableName, updatedCategory); err != nil {
		return errorResponse(500, "failed to update category")
	}

	return middleware.JSONResponse(200, updatedCategory)
}

// extractAuthorID extracts the user ID from Cognito authorizer claims
func extractAuthorID(request events.APIGatewayProxyRequest) string {
	if request.RequestContext.Authorizer == nil {
		return ""
	}

	claims, ok := request.RequestContext.Authorizer["claims"]
	if !ok {
		return ""
	}

	claimsMap, ok := claims.(map[string]interface{})
	if !ok {
		return ""
	}

	sub, ok := claimsMap["sub"]
	if !ok {
		return ""
	}

	subStr, ok := sub.(string)
	if !ok {
		return ""
	}

	return subStr
}

// getExistingCategory retrieves a category by ID
func getExistingCategory(ctx context.Context, client DynamoDBClientInterface, tableName, categoryID string) (*domain.Category, error) {
	getInput := &dynamodb.GetItemInput{
		TableName: aws.String(tableName),
		Key: map[string]types.AttributeValue{
			"id": &types.AttributeValueMemberS{Value: categoryID},
		},
	}

	result, err := client.GetItem(ctx, getInput)
	if err != nil {
		return nil, err
	}

	if len(result.Item) == 0 {
		return nil, nil
	}

	var category domain.Category
	if err := attributevalue.UnmarshalMap(result.Item, &category); err != nil {
		return nil, err
	}

	return &category, nil
}

// checkSlugExistsForOther checks if a slug already exists on a different category
func checkSlugExistsForOther(ctx context.Context, client DynamoDBClientInterface, tableName, indexName, slug, currentCategoryID string) (bool, error) {
	queryInput := &dynamodb.QueryInput{
		TableName:              aws.String(tableName),
		IndexName:              aws.String(indexName),
		KeyConditionExpression: aws.String("slug = :slug"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":slug": &types.AttributeValueMemberS{Value: slug},
		},
		Limit: aws.Int32(1),
	}

	result, err := client.Query(ctx, queryInput)
	if err != nil {
		return false, err
	}

	// If no results, slug doesn't exist
	if result.Count == 0 {
		return false, nil
	}

	// Check if the found category is the same as the one being updated
	for _, item := range result.Items {
		var cat domain.Category
		if err := attributevalue.UnmarshalMap(item, &cat); err != nil {
			continue
		}
		// If the found category is different from current, it's a conflict
		if cat.ID != currentCategoryID {
			return true, nil
		}
	}

	return false, nil
}

// applyUpdates applies the update request fields to the existing category
// Requirement 4.6: Partial update support
func applyUpdates(existing *domain.Category, req *domain.UpdateCategoryRequest) *domain.Category {
	updated := *existing

	if req.Name != nil {
		updated.Name = *req.Name
	}

	if req.Slug != nil {
		updated.Slug = *req.Slug
	}

	if req.Description != nil {
		updated.Description = req.Description
	}

	if req.SortOrder != nil {
		updated.SortOrder = *req.SortOrder
	}

	return &updated
}

// saveCategory saves a category to DynamoDB
func saveCategory(ctx context.Context, client DynamoDBClientInterface, tableName string, category *domain.Category) error {
	av, err := attributevalue.MarshalMap(category)
	if err != nil {
		return err
	}

	putInput := &dynamodb.PutItemInput{
		TableName: aws.String(tableName),
		Item:      av,
	}

	_, err = client.PutItem(ctx, putInput)
	return err
}

// updateCategoryWithPosts updates the category and all posts referencing the old slug
// Requirement 4.7: Atomic update of category and posts
func updateCategoryWithPosts(ctx context.Context, client DynamoDBClientInterface, tableName, postsTableName, categoryIndexName, oldSlug string, category *domain.Category) (events.APIGatewayProxyResponse, error) {
	// Find all posts referencing the old slug
	posts, err := getPostsByCategory(ctx, client, postsTableName, categoryIndexName, oldSlug)
	if err != nil {
		return errorResponse(500, "failed to query posts")
	}

	// Build transaction items
	transactItems := make([]types.TransactWriteItem, 0, len(posts)+1)

	// Add category update
	categoryAV, err := attributevalue.MarshalMap(category)
	if err != nil {
		return errorResponse(500, "failed to marshal category")
	}

	transactItems = append(transactItems, types.TransactWriteItem{
		Put: &types.Put{
			TableName: aws.String(tableName),
			Item:      categoryAV,
		},
	})

	// Add post updates
	for i := range posts {
		transactItems = append(transactItems, types.TransactWriteItem{
			Update: &types.Update{
				TableName: aws.String(postsTableName),
				Key: map[string]types.AttributeValue{
					"id": &types.AttributeValueMemberS{Value: posts[i].ID},
				},
				UpdateExpression: aws.String("SET category = :newCategory"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":newCategory": &types.AttributeValueMemberS{Value: category.Slug},
				},
			},
		})
	}

	// Execute transaction
	transactInput := &dynamodb.TransactWriteItemsInput{
		TransactItems: transactItems,
	}

	_, err = client.TransactWriteItems(ctx, transactInput)
	if err != nil {
		return errorResponse(500, "failed to update category and posts")
	}

	return middleware.JSONResponse(200, category)
}

// getPostsByCategory retrieves all posts with a given category slug
func getPostsByCategory(ctx context.Context, client DynamoDBClientInterface, tableName, indexName, category string) ([]domain.BlogPost, error) {
	queryInput := &dynamodb.QueryInput{
		TableName:              aws.String(tableName),
		IndexName:              aws.String(indexName),
		KeyConditionExpression: aws.String("category = :cat"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":cat": &types.AttributeValueMemberS{Value: category},
		},
	}

	result, err := client.Query(ctx, queryInput)
	if err != nil {
		return nil, err
	}

	var posts []domain.BlogPost
	if err := attributevalue.UnmarshalListOfMaps(result.Items, &posts); err != nil {
		return nil, err
	}

	return posts, nil
}

// errorResponse creates an error response with CORS headers
// Requirement 9.1: JSON error responses with message field
func errorResponse(statusCode int, message string) (events.APIGatewayProxyResponse, error) {
	return middleware.JSONResponse(statusCode, domain.ErrorResponse{Message: message})
}

func main() {
	lambda.Start(Handler)
}
