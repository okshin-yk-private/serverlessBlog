// Package main provides the DeleteCategory Lambda function for deleting blog categories.
//
// Requirement 5: Category Deletion API
// - 5.1: DELETE /admin/categories/{id} deletes category and returns 204 No Content
// - 5.2: Require Cognito authorization
// - 5.3: Return 404 if category ID does not exist
// - 5.4: Return 409 Conflict if posts are associated with the category
// - 5.5: Check BlogPosts CategoryIndex to determine if any posts reference the category
package main

import (
	"context"
	"os"
	"strings"

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
	DeleteItem(ctx context.Context, params *dynamodb.DeleteItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.DeleteItemOutput, error)
	TransactWriteItems(ctx context.Context, params *dynamodb.TransactWriteItemsInput, optFns ...func(*dynamodb.Options)) (*dynamodb.TransactWriteItemsOutput, error)
}

// dynamoClientGetter is a function that returns the DynamoDB client
// This can be overridden in tests
var dynamoClientGetter = func() (DynamoDBClientInterface, error) {
	return clients.GetDynamoDB()
}

// Handler handles DELETE /admin/categories/{id} requests
// Requirement 5.1: Delete category and return 204 No Content
// Requirement 5.2: Require Cognito authorization
func Handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Requirement 5.2: Check authentication
	authorID := extractAuthorID(request)
	if authorID == "" {
		return errorResponse(401, "unauthorized")
	}

	// Validate category ID from path parameters
	categoryID := request.PathParameters["id"]
	if categoryID == "" {
		return errorResponse(400, "category ID is required")
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

	// Requirement 5.3: Get existing category
	existingCategory, err := getExistingCategory(ctx, dynamoClient, tableName, categoryID)
	if err != nil {
		return errorResponse(500, "failed to retrieve category")
	}
	if existingCategory == nil {
		return errorResponse(404, "category not found")
	}

	// Requirement 5.4, 5.5: Check if category is in use by posts
	inUse, err := isCategoryInUse(ctx, dynamoClient, postsTableName, categoryIndexName, existingCategory.Slug)
	if err != nil {
		return errorResponse(500, "failed to check category usage")
	}
	if inUse {
		return errorResponse(409, "category is in use by posts")
	}

	// Requirement 5.1: Delete the category and its SLUG_RESERVATION
	if err := deleteCategory(ctx, dynamoClient, tableName, categoryID, existingCategory.Slug); err != nil {
		return errorResponse(500, "failed to delete category")
	}

	// Return 204 No Content
	return noContentResponse()
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
// Returns nil if the ID is a SLUG_RESERVATION ID (starts with "SLUG#")
func getExistingCategory(ctx context.Context, client DynamoDBClientInterface, tableName, categoryID string) (*domain.Category, error) {
	// Reject SLUG_RESERVATION IDs - treat as not found
	if strings.HasPrefix(categoryID, "SLUG#") {
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

// isCategoryInUse checks if any posts reference the category slug
// Requirement 5.5: Query CategoryIndex (KeyConditionExpression: category = :slug, Limit: 1)
func isCategoryInUse(ctx context.Context, client DynamoDBClientInterface, tableName, indexName, slug string) (bool, error) {
	queryInput := &dynamodb.QueryInput{
		TableName:              aws.String(tableName),
		IndexName:              aws.String(indexName),
		KeyConditionExpression: aws.String("category = :slug"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":slug": &types.AttributeValueMemberS{Value: slug},
		},
		Limit: aws.Int32(1), // We only need to know if at least one post exists
	}

	result, err := client.Query(ctx, queryInput)
	if err != nil {
		return false, err
	}

	return result.Count > 0, nil
}

// deleteCategory deletes a category and its SLUG_RESERVATION item from DynamoDB
// Uses TransactWriteItems to delete both items atomically
func deleteCategory(ctx context.Context, client DynamoDBClientInterface, tableName, categoryID, slug string) error {
	slugReservationID := "SLUG#" + slug

	transactInput := &dynamodb.TransactWriteItemsInput{
		TransactItems: []types.TransactWriteItem{
			{
				Delete: &types.Delete{
					TableName: aws.String(tableName),
					Key: map[string]types.AttributeValue{
						"id": &types.AttributeValueMemberS{Value: categoryID},
					},
				},
			},
			{
				Delete: &types.Delete{
					TableName: aws.String(tableName),
					Key: map[string]types.AttributeValue{
						"id": &types.AttributeValueMemberS{Value: slugReservationID},
					},
				},
			},
		},
	}

	_, err := client.TransactWriteItems(ctx, transactInput)
	return err
}

// errorResponse creates an error response with CORS headers
// Requirement 9.1: JSON error responses with message field
func errorResponse(statusCode int, message string) (events.APIGatewayProxyResponse, error) {
	return middleware.JSONResponse(statusCode, domain.ErrorResponse{Message: message})
}

// noContentResponse creates a 204 No Content response with CORS headers
func noContentResponse() (events.APIGatewayProxyResponse, error) {
	return events.APIGatewayProxyResponse{
		StatusCode: 204,
		Headers: map[string]string{
			"Access-Control-Allow-Origin":  "*",
			"Access-Control-Allow-Headers": "Content-Type,Authorization",
			"Access-Control-Allow-Methods": "DELETE,OPTIONS",
		},
		Body: "",
	}, nil
}

func main() {
	lambda.Start(Handler)
}
