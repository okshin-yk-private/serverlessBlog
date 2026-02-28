// Package main provides the BulkUpdateSortOrder Lambda function for updating sort orders of multiple categories.
//
// Requirement 4B: Category Sort Order Bulk Update API
// - 4B.1: PATCH /admin/categories/sort with array of category IDs and sortOrder values updates all and returns 200
// - 4B.2: Require Cognito authorization
// - 4B.3: Return 400 Bad Request with list of invalid IDs if any category ID doesn't exist
// - 4B.4: Update updatedAt timestamp for all updated categories
// - 4B.5: Perform bulk update atomically using DynamoDB TransactWriteItems
package main

import (
	"context"
	"encoding/json"
	"os"
	"strconv"
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
	BatchGetItem(ctx context.Context, params *dynamodb.BatchGetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.BatchGetItemOutput, error)
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

// Handler handles PATCH /admin/categories/sort requests
// Requirement 4B.1: Update all categories' sortOrder and return 200
// Requirement 4B.2: Require Cognito authorization
func Handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Requirement 4B.2: Check authentication
	authorID := extractAuthorID(request)
	if authorID == "" {
		return errorResponse(401, "unauthorized")
	}

	// Parse request body
	var req domain.UpdateSortOrderRequest
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

	// Get DynamoDB client
	dynamoClient, err := dynamoClientGetter()
	if err != nil {
		return errorResponse(500, "server error")
	}

	// Requirement 4B.3: Verify all category IDs exist
	existingCategories, invalidIDs, err := verifyCategories(ctx, dynamoClient, tableName, req.Orders)
	if err != nil {
		return errorResponse(500, "failed to verify categories")
	}

	if len(invalidIDs) > 0 {
		return invalidIDsResponse(400, "some category IDs do not exist", invalidIDs)
	}

	// Build updated categories
	now := timeNow()
	updatedCategories := make([]domain.Category, 0, len(req.Orders))
	sortOrderMap := make(map[string]int)

	for _, order := range req.Orders {
		sortOrderMap[order.ID] = order.SortOrder
	}

	for _, cat := range existingCategories {
		if newSortOrder, ok := sortOrderMap[cat.ID]; ok {
			cat.SortOrder = newSortOrder
			cat.UpdatedAt = now
			updatedCategories = append(updatedCategories, cat)
		}
	}

	// Requirement 4B.5: Perform atomic bulk update using TransactWriteItems
	if err := bulkUpdateCategories(ctx, dynamoClient, tableName, updatedCategories); err != nil {
		return errorResponse(500, "failed to update categories")
	}

	return middleware.JSONResponse(200, updatedCategories)
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

// verifyCategories verifies all category IDs exist and returns existing categories and invalid IDs
// Requirement 4B.3: Check all IDs before update
func verifyCategories(ctx context.Context, client DynamoDBClientInterface, tableName string, orders []domain.SortOrderItem) ([]domain.Category, []string, error) {
	// Build keys for BatchGetItem
	keys := make([]map[string]types.AttributeValue, 0, len(orders))
	idSet := make(map[string]bool)

	for _, order := range orders {
		if !idSet[order.ID] {
			keys = append(keys, map[string]types.AttributeValue{
				"id": &types.AttributeValueMemberS{Value: order.ID},
			})
			idSet[order.ID] = true
		}
	}

	// Execute BatchGetItem
	batchInput := &dynamodb.BatchGetItemInput{
		RequestItems: map[string]types.KeysAndAttributes{
			tableName: {
				Keys: keys,
			},
		},
	}

	result, err := client.BatchGetItem(ctx, batchInput)
	if err != nil {
		return nil, nil, err
	}

	// Parse existing categories
	var existingCategories []domain.Category
	foundIDs := make(map[string]bool)

	if items, ok := result.Responses[tableName]; ok {
		for _, item := range items {
			var cat domain.Category
			if err := attributevalue.UnmarshalMap(item, &cat); err != nil {
				continue
			}
			existingCategories = append(existingCategories, cat)
			foundIDs[cat.ID] = true
		}
	}

	// Find invalid IDs
	var invalidIDs []string
	for _, order := range orders {
		if !foundIDs[order.ID] {
			invalidIDs = append(invalidIDs, order.ID)
		}
	}

	return existingCategories, invalidIDs, nil
}

// bulkUpdateCategories performs atomic bulk update using TransactWriteItems
// Requirement 4B.5: Atomic update using TransactWriteItems (max 100 items)
func bulkUpdateCategories(ctx context.Context, client DynamoDBClientInterface, tableName string, categories []domain.Category) error {
	transactItems := make([]types.TransactWriteItem, 0, len(categories))

	for _, cat := range categories {
		transactItems = append(transactItems, types.TransactWriteItem{
			Update: &types.Update{
				TableName: aws.String(tableName),
				Key: map[string]types.AttributeValue{
					"id": &types.AttributeValueMemberS{Value: cat.ID},
				},
				UpdateExpression: aws.String("SET sortOrder = :sortOrder, updatedAt = :updatedAt"),
				ExpressionAttributeValues: map[string]types.AttributeValue{
					":sortOrder": &types.AttributeValueMemberN{Value: intToString(cat.SortOrder)},
					":updatedAt": &types.AttributeValueMemberS{Value: cat.UpdatedAt},
				},
			},
		})
	}

	transactInput := &dynamodb.TransactWriteItemsInput{
		TransactItems: transactItems,
	}

	_, err := client.TransactWriteItems(ctx, transactInput)
	return err
}

// intToString converts an integer to a string for DynamoDB number attribute
func intToString(n int) string {
	return strconv.Itoa(n)
}

// errorResponse creates an error response with CORS headers
// Requirement 9.1: JSON error responses with message field
func errorResponse(statusCode int, message string) (events.APIGatewayProxyResponse, error) {
	return middleware.JSONResponse(statusCode, domain.ErrorResponse{Message: message})
}

// invalidIDsResponse creates an error response with invalid IDs list
// Requirement 4B.3: Return 400 with list of invalid IDs
func invalidIDsResponse(statusCode int, message string, invalidIDs []string) (events.APIGatewayProxyResponse, error) {
	return middleware.JSONResponse(statusCode, domain.InvalidIDsErrorResponse{
		Message:    message,
		InvalidIDs: invalidIDs,
	})
}

func main() {
	lambda.Start(Handler)
}
