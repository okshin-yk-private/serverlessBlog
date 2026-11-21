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
	"errors"
	"os"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"serverless-blog/go-functions/internal/auth"
	"serverless-blog/go-functions/internal/clients"
	"serverless-blog/go-functions/internal/domain"
	"serverless-blog/go-functions/internal/middleware"
	"serverless-blog/go-functions/internal/poststore"
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
func Handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	return middleware.HandleRequest(ctx, request, handleRequest)
}

//nolint:gocyclo // Handler validates multiple fields which increases complexity
func handleRequest(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Requirement 4.2: Check authentication
	authorID := auth.UserID(request)
	if authorID == "" {
		return middleware.MessageResponse(401, "unauthorized")
	}

	// Categories are site-wide, so being signed in is not enough to change
	// them: the caller has to be in the admin group.
	if !auth.IsAdmin(request) {
		return middleware.MessageResponse(403, "forbidden")
	}

	// Validate category ID from path parameters
	categoryID := request.PathParameters["id"]
	if categoryID == "" {
		return middleware.MessageResponse(400, "category ID is required")
	}

	// Parse request body
	var req domain.UpdateCategoryRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return middleware.MessageResponse(400, "invalid request body")
	}

	// Validate request
	if err := req.Validate(); err != nil {
		return middleware.MessageResponse(400, err.Error())
	}

	// Check for CATEGORIES_TABLE_NAME
	tableName := os.Getenv("CATEGORIES_TABLE_NAME")
	if tableName == "" {
		return middleware.ServerError(ctx, "server configuration error", errors.New("CATEGORIES_TABLE_NAME is not configured"))
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
		return middleware.ServerError(ctx, "server error", err)
	}

	// Requirement 4.3: Get existing category
	existingCategory, err := getExistingCategory(ctx, dynamoClient, tableName, categoryID)
	if err != nil {
		return middleware.ServerError(ctx, "failed to retrieve category", err)
	}
	if existingCategory == nil {
		return middleware.MessageResponse(404, "category not found")
	}

	// Check if slug is being changed
	slugChanged := req.Slug != nil && *req.Slug != existingCategory.Slug

	// Requirement 4.4: Check slug uniqueness if slug is being changed
	if slugChanged {
		slugExists, err := checkSlugExistsForOther(ctx, dynamoClient, tableName, slugIndexName, *req.Slug, categoryID)
		if err != nil {
			return middleware.ServerError(ctx, "failed to check slug uniqueness", err)
		}
		if slugExists {
			return middleware.MessageResponse(409, "category with this slug already exists")
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

	// Save updated category to DynamoDB with existence and unchanged-slug guard
	if err := saveCategory(ctx, dynamoClient, tableName, existingCategory.Slug, updatedCategory); err != nil {
		if poststore.IsConflict(err) {
			return middleware.MessageResponse(409, "category was modified or deleted concurrently")
		}
		return middleware.ServerError(ctx, "failed to update category", err)
	}

	return middleware.JSONResponse(200, updatedCategory)
}

// getExistingCategory retrieves a category by ID
func getExistingCategory(ctx context.Context, client DynamoDBClientInterface, tableName, categoryID string) (*domain.Category, error) {
	if poststore.IsReservedID(categoryID) {
		return nil, nil
	}

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
		ProjectionExpression: aws.String("id"),
		Limit:                aws.Int32(1),
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

// saveCategory saves a category to DynamoDB, rejecting concurrent delete or slug change.
func saveCategory(ctx context.Context, client DynamoDBClientInterface, tableName, expectedSlug string, category *domain.Category) error {
	av, err := attributevalue.MarshalMap(category)
	if err != nil {
		return err
	}

	putInput := &dynamodb.PutItemInput{
		TableName:           aws.String(tableName),
		Item:                av,
		ConditionExpression: aws.String("attribute_exists(id) AND slug = :expectedSlug"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":expectedSlug": &types.AttributeValueMemberS{Value: expectedSlug},
		},
	}

	_, err = client.PutItem(ctx, putInput)
	return err
}

// maxTransactWriteItems is the maximum number of items per TransactWriteItems call.
// DynamoDB limits TransactWriteItems to 100 items per call; reserving 3 slots for
// the category update, old slug reservation delete, and new slug reservation put
// leaves at most 97 associated posts that can be migrated atomically.
const (
	maxTransactWriteItems       = 100
	maxAtomicSlugMigrationPosts = maxTransactWriteItems - 3
)

// updateCategoryWithPosts atomically updates the category, its slug reservation,
// and all BlogPosts referencing the old slug in a single DynamoDB transaction.
// Categories with more than 97 posts are rejected before any write so a partial
// multi-batch failure cannot leave posts stranded on the old slug (tracked in #904).
func updateCategoryWithPosts(ctx context.Context, client DynamoDBClientInterface, tableName, postsTableName, categoryIndexName, oldSlug string, category *domain.Category) (events.APIGatewayProxyResponse, error) {
	// Find the IDs of all posts referencing the old slug
	postIDs, err := getPostsByCategory(ctx, client, postsTableName, categoryIndexName, oldSlug)
	if err != nil {
		return middleware.ServerError(ctx, "failed to query posts", err)
	}

	if len(postIDs) > maxAtomicSlugMigrationPosts {
		return middleware.MessageResponse(409, "cannot atomically rename category slug with more than 97 associated posts")
	}

	// Marshal category for updates
	categoryAV, err := attributevalue.MarshalMap(category)
	if err != nil {
		return middleware.ServerError(ctx, "failed to marshal category", err)
	}

	// Build slug reservation items for transaction
	oldSlugReservationID := "SLUG#" + oldSlug
	newSlugReservationID := "SLUG#" + category.Slug

	transactItems := make([]types.TransactWriteItem, 0, len(postIDs)+3)
	transactItems = append(transactItems,
		types.TransactWriteItem{
			Put: &types.Put{
				TableName:           aws.String(tableName),
				Item:                categoryAV,
				ConditionExpression: aws.String("attribute_exists(id) AND slug = :oldSlug"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":oldSlug": &types.AttributeValueMemberS{Value: oldSlug},
				},
			},
		},
		types.TransactWriteItem{
			// Delete old slug reservation only if absent (legacy) or owned by this category
			Delete: &types.Delete{
				TableName: aws.String(tableName),
				Key: map[string]types.AttributeValue{
					"id": &types.AttributeValueMemberS{Value: oldSlugReservationID},
				},
				ConditionExpression: aws.String("attribute_not_exists(id) OR categoryId = :categoryId"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":categoryId": &types.AttributeValueMemberS{Value: category.ID},
				},
			},
		},
		types.TransactWriteItem{
			// Create new slug reservation (fails if already exists)
			Put: &types.Put{
				TableName: aws.String(tableName),
				Item: map[string]types.AttributeValue{
					"id":         &types.AttributeValueMemberS{Value: newSlugReservationID},
					"slug":       &types.AttributeValueMemberS{Value: category.Slug},
					"categoryId": &types.AttributeValueMemberS{Value: category.ID},
					"itemType":   &types.AttributeValueMemberS{Value: "SLUG_RESERVATION"},
				},
				ConditionExpression: aws.String("attribute_not_exists(id)"),
			},
		},
	)

	// Guard each post update against concurrent deletion or category reassignment
	for i := range postIDs {
		transactItems = append(transactItems, types.TransactWriteItem{
			Update: &types.Update{
				TableName: aws.String(postsTableName),
				Key: map[string]types.AttributeValue{
					"id": &types.AttributeValueMemberS{Value: postIDs[i]},
				},
				ConditionExpression: aws.String("attribute_exists(id) AND category = :oldCategory"),
				UpdateExpression:    aws.String("SET category = :newCategory"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":oldCategory": &types.AttributeValueMemberS{Value: oldSlug},
					":newCategory": &types.AttributeValueMemberS{Value: category.Slug},
				},
			},
		})
	}

	_, err = client.TransactWriteItems(ctx, &dynamodb.TransactWriteItemsInput{
		TransactItems: transactItems,
	})
	if err != nil {
		if poststore.IsConflict(err) {
			return middleware.MessageResponse(409, "category or associated posts were modified concurrently")
		}
		if len(postIDs) == 0 {
			return middleware.ServerError(ctx, "failed to update category", err)
		}
		return middleware.ServerError(ctx, "failed to update category and posts", err)
	}

	return middleware.JSONResponse(200, category)
}

// postIDProjection is the unmarshal target for getPostsByCategory's
// ProjectionExpression: "id" query - it deliberately mirrors only the
// attribute actually requested from DynamoDB, not the full domain.BlogPost
// shape.
type postIDProjection struct {
	ID string `dynamodbav:"id"`
}

// getPostsByCategory retrieves the IDs of all posts with a given category
// slug, using pagination.
//
// Restricted to ProjectionExpression "id" (issue #489, inefficiency 2):
// updateCategoryWithPosts only ever needs each post's ID, to build a
// "SET category = :newCategory" update per post. CategoryIndex projects ALL
// attributes, so without a ProjectionExpression this query pulled every
// post's full content - including contentMarkdown / contentHtml - into the
// Lambda's memory just to discard everything but the ID. For a category
// with many or large posts that unnecessarily pushes a 128MB Lambda toward
// its memory limit.
func getPostsByCategory(ctx context.Context, client DynamoDBClientInterface, tableName, indexName, category string) ([]string, error) {
	var postIDs []string
	var lastEvaluatedKey map[string]types.AttributeValue

	for {
		queryInput := &dynamodb.QueryInput{
			TableName:              aws.String(tableName),
			IndexName:              aws.String(indexName),
			KeyConditionExpression: aws.String("category = :cat"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":cat": &types.AttributeValueMemberS{Value: category},
			},
			ProjectionExpression: aws.String("id"),
			ExclusiveStartKey:    lastEvaluatedKey,
		}

		result, err := client.Query(ctx, queryInput)
		if err != nil {
			return nil, err
		}

		var page []postIDProjection
		if err := attributevalue.UnmarshalListOfMaps(result.Items, &page); err != nil {
			return nil, err
		}

		for _, p := range page {
			postIDs = append(postIDs, p.ID)
		}

		// Check if there are more items to fetch
		if result.LastEvaluatedKey == nil {
			break
		}
		lastEvaluatedKey = result.LastEvaluatedKey
	}

	return postIDs, nil
}

func main() {
	lambda.Start(Handler)
}
