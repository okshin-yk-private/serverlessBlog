// Package main provides the ListCategories Lambda function for retrieving all categories.
//
// Requirement 2: Category List API
//   - GET /categories returns all categories sorted by sortOrder ascending
//   - Returns id, name, slug, and sortOrder fields
//   - Publicly accessible without authentication
//   - Returns empty array with HTTP 200 when no categories exist
//   - Implements CORS headers for frontend access
package main

import (
	"context"
	"os"
	"sort"
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
type DynamoDBClientInterface interface {
	Scan(ctx context.Context, params *dynamodb.ScanInput, optFns ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error)
}

// dynamoClientGetter is a function that returns the DynamoDB client
// This can be overridden in tests
var dynamoClientGetter = func() (DynamoDBClientInterface, error) {
	return clients.GetDynamoDB()
}

// Handler handles GET /categories requests
// Requirement 2.1: Return all categories sorted by sortOrder ascending
// Requirement 2.3: Publicly accessible without authentication
// Requirement 2.4: Return empty array with HTTP 200 when no categories exist
// Requirement 2.5: Implement CORS headers
func Handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
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

	// Collect all items using pagination
	var allItems []map[string]types.AttributeValue
	var lastEvaluatedKey map[string]types.AttributeValue

	for {
		// Build DynamoDB Scan input to get all categories
		scanInput := &dynamodb.ScanInput{
			TableName:         aws.String(tableName),
			ExclusiveStartKey: lastEvaluatedKey,
		}

		// Execute scan
		result, err := dynamoClient.Scan(ctx, scanInput)
		if err != nil {
			return errorResponse(500, "failed to retrieve categories")
		}

		// Append items from this page
		allItems = append(allItems, result.Items...)

		// Check if there are more items to fetch
		if result.LastEvaluatedKey == nil {
			break
		}
		lastEvaluatedKey = result.LastEvaluatedKey
	}

	// Process results
	categories := processResults(allItems)

	// Sort categories by sortOrder ascending
	// Requirement 2.1: sorted by sortOrder ascending
	sort.Slice(categories, func(i, j int) bool {
		return categories[i].SortOrder < categories[j].SortOrder
	})

	// Convert to list response items (only id, name, slug, sortOrder)
	// Requirement 2.2: Return only specified fields
	response := make([]domain.CategoryListItem, 0, len(categories))
	for i := range categories {
		response = append(response, categories[i].ToCategoryListItem())
	}

	// Return response (empty array if no categories)
	return middleware.JSONResponse(200, response)
}

// processResults converts DynamoDB items to Category structs
// Filters out SLUG_RESERVATION items which are used for slug uniqueness enforcement
func processResults(items []map[string]types.AttributeValue) []domain.Category {
	result := make([]domain.Category, 0, len(items))

	for _, item := range items {
		// Skip SLUG_RESERVATION items (used for atomic slug uniqueness)
		if isSlugReservation(item) {
			continue
		}

		var category domain.Category
		if err := attributevalue.UnmarshalMap(item, &category); err != nil {
			continue // Skip invalid items
		}

		// Skip items with empty name (additional safety check)
		if category.Name == "" {
			continue
		}

		result = append(result, category)
	}

	return result
}

// isSlugReservation checks if the item is a SLUG_RESERVATION item
// SLUG_RESERVATION items are created during category creation to ensure slug uniqueness
func isSlugReservation(item map[string]types.AttributeValue) bool {
	// Check for itemType field (explicit marker)
	if itemType, ok := item["itemType"]; ok {
		if s, ok := itemType.(*types.AttributeValueMemberS); ok {
			return s.Value == "SLUG_RESERVATION"
		}
	}
	// Fallback: check if id starts with "SLUG#"
	if id, ok := item["id"]; ok {
		if s, ok := id.(*types.AttributeValueMemberS); ok {
			return strings.HasPrefix(s.Value, "SLUG#")
		}
	}
	return false
}

// errorResponse creates an error response with CORS headers
// Requirement 9.1: JSON error responses with message field
func errorResponse(statusCode int, message string) (events.APIGatewayProxyResponse, error) {
	return middleware.JSONResponse(statusCode, domain.ErrorResponse{Message: message})
}

func main() {
	lambda.Start(Handler)
}
