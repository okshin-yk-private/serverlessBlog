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

	// Build DynamoDB Scan input to get all categories
	scanInput := &dynamodb.ScanInput{
		TableName: aws.String(tableName),
	}

	// Execute scan
	result, err := dynamoClient.Scan(ctx, scanInput)
	if err != nil {
		return errorResponse(500, "failed to retrieve categories")
	}

	// Process results
	categories := processResults(result.Items)

	// Sort categories by sortOrder ascending
	// Requirement 2.1: sorted by sortOrder ascending
	sort.Slice(categories, func(i, j int) bool {
		return categories[i].SortOrder < categories[j].SortOrder
	})

	// Return response (empty array if no categories)
	return middleware.JSONResponse(200, categories)
}

// processResults converts DynamoDB items to Category structs
func processResults(items []map[string]types.AttributeValue) []domain.Category {
	result := make([]domain.Category, 0, len(items))

	for _, item := range items {
		var category domain.Category
		if err := attributevalue.UnmarshalMap(item, &category); err != nil {
			continue // Skip invalid items
		}
		result = append(result, category)
	}

	return result
}

// errorResponse creates an error response with CORS headers
// Requirement 9.1: JSON error responses with message field
func errorResponse(statusCode int, message string) (events.APIGatewayProxyResponse, error) {
	return middleware.JSONResponse(statusCode, domain.ErrorResponse{Message: message})
}

func main() {
	lambda.Start(Handler)
}
