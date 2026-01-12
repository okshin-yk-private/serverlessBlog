// Package main provides the CreateCategory Lambda function for creating blog categories.
//
// Requirement 3: Category Creation API
// - 3.1: POST /admin/categories with valid data creates category and returns 201
// - 3.2: Require Cognito authorization
// - 3.3: Return 400 if name is missing or empty
// - 3.4: Return 409 Conflict if slug already exists
// - 3.5: Auto-generate slug from name if not provided
// - 3.6: Set createdAt and updatedAt to current ISO 8601 timestamp
// - 3.7: Assign next available sortOrder if not provided
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
	"github.com/google/uuid"

	"serverless-blog/go-functions/internal/clients"
	"serverless-blog/go-functions/internal/domain"
	"serverless-blog/go-functions/internal/middleware"
)

// DynamoDBClientInterface defines the interface for DynamoDB operations (for testing)
//
//nolint:dupl // Interface needed both in main and test files for mock
type DynamoDBClientInterface interface {
	Query(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error)
	PutItem(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error)
	Scan(ctx context.Context, params *dynamodb.ScanInput, optFns ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error)
}

// dynamoClientGetter is a function that returns the DynamoDB client
// This can be overridden in tests
var dynamoClientGetter = func() (DynamoDBClientInterface, error) {
	return clients.GetDynamoDB()
}

// uuidGenerator is a function that generates a new UUID
// This can be overridden in tests
var uuidGenerator = func() string {
	return uuid.New().String()
}

// timeNow is a function that returns the current time as ISO 8601 string
// This can be overridden in tests
var timeNow = func() string {
	return time.Now().UTC().Format(time.RFC3339)
}

// Handler handles POST /admin/categories requests
// Requirement 3.1: Create category and return 201
// Requirement 3.2: Require Cognito authorization
func Handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Requirement 3.2: Check authentication
	authorID := extractAuthorID(request)
	if authorID == "" {
		return errorResponse(401, "unauthorized")
	}

	// Parse request body
	// Requirement 9.2: Return 400 for invalid JSON
	var req domain.CreateCategoryRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return errorResponse(400, "invalid request body")
	}

	// Validate request
	// Requirement 3.3, 9.3, 9.4: Validate name and slug
	if err := req.Validate(); err != nil {
		return errorResponse(400, err.Error())
	}

	// Check for CATEGORIES_TABLE_NAME
	tableName := os.Getenv("CATEGORIES_TABLE_NAME")
	if tableName == "" {
		return errorResponse(500, "server configuration error")
	}

	// Get slug index name
	slugIndexName := os.Getenv("SLUG_INDEX_NAME")
	if slugIndexName == "" {
		slugIndexName = "SlugIndex"
	}

	// Get DynamoDB client
	dynamoClient, err := dynamoClientGetter()
	if err != nil {
		return errorResponse(500, "server error")
	}

	// Determine slug (auto-generate if not provided)
	// Requirement 3.5: Auto-generate slug from name
	var slug string
	if req.Slug != nil && *req.Slug != "" {
		slug = *req.Slug
	} else {
		slug = domain.GenerateSlug(req.Name)
	}

	// Check slug uniqueness
	// Requirement 3.4: Return 409 if slug exists
	slugExists, err := checkSlugExists(ctx, dynamoClient, tableName, slugIndexName, slug)
	if err != nil {
		return errorResponse(500, "failed to check slug uniqueness")
	}
	if slugExists {
		return errorResponse(409, "category with this slug already exists")
	}

	// Determine sortOrder
	// Requirement 3.7: Auto-assign sortOrder if not provided
	var sortOrder int
	if req.SortOrder != nil {
		sortOrder = *req.SortOrder
	} else {
		var maxSortOrder int
		maxSortOrder, err = getMaxSortOrder(ctx, dynamoClient, tableName)
		if err != nil {
			return errorResponse(500, "failed to determine sort order")
		}
		sortOrder = maxSortOrder + 1
	}

	// Generate UUID and timestamps
	// Requirement 3.6: Set createdAt and updatedAt
	categoryID := uuidGenerator()
	now := timeNow()

	// Create category entity
	category := domain.Category{
		ID:          categoryID,
		Name:        req.Name,
		Slug:        slug,
		Description: req.Description,
		SortOrder:   sortOrder,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	// Marshal to DynamoDB attribute value
	av, err := attributevalue.MarshalMap(category)
	if err != nil {
		return errorResponse(500, "failed to marshal category")
	}

	// Save to DynamoDB
	putInput := &dynamodb.PutItemInput{
		TableName: &tableName,
		Item:      av,
	}

	_, err = dynamoClient.PutItem(ctx, putInput)
	if err != nil {
		return errorResponse(500, "failed to create category")
	}

	// Return created category with 201 status
	return middleware.JSONResponse(201, category)
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

// checkSlugExists checks if a category with the given slug already exists
// Uses SlugIndex GSI for efficient lookup
func checkSlugExists(ctx context.Context, client DynamoDBClientInterface, tableName, indexName, slug string) (bool, error) {
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

	return result.Count > 0, nil
}

// getMaxSortOrder finds the maximum sortOrder value among existing categories
func getMaxSortOrder(ctx context.Context, client DynamoDBClientInterface, tableName string) (int, error) {
	scanInput := &dynamodb.ScanInput{
		TableName:            aws.String(tableName),
		ProjectionExpression: aws.String("sortOrder"),
	}

	result, err := client.Scan(ctx, scanInput)
	if err != nil {
		return 0, err
	}

	maxSortOrder := 0
	for _, item := range result.Items {
		var category struct {
			SortOrder int `dynamodbav:"sortOrder"`
		}
		if err := attributevalue.UnmarshalMap(item, &category); err != nil {
			continue
		}
		if category.SortOrder > maxSortOrder {
			maxSortOrder = category.SortOrder
		}
	}

	return maxSortOrder, nil
}

// errorResponse creates an error response with CORS headers
// Requirement 9.1: JSON error responses with message field
func errorResponse(statusCode int, message string) (events.APIGatewayProxyResponse, error) {
	return middleware.JSONResponse(statusCode, domain.ErrorResponse{Message: message})
}

func main() {
	lambda.Start(Handler)
}
