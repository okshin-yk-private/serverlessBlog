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
	"errors"
	"os"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/google/uuid"

	"serverless-blog/go-functions/internal/auth"
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
	TransactWriteItems(ctx context.Context, params *dynamodb.TransactWriteItemsInput, optFns ...func(*dynamodb.Options)) (*dynamodb.TransactWriteItemsOutput, error)
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
	authorID := auth.UserID(request)
	if authorID == "" {
		return errorResponse(401, "unauthorized")
	}

	// Categories are site-wide, so being signed in is not enough to change
	// them: the caller has to be in the admin group.
	if !auth.IsAdmin(request) {
		return errorResponse(403, "forbidden")
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

	// Use TransactWriteItems for atomic slug uniqueness check
	// Requirement 3.4: Return 409 if slug exists (enforced atomically)
	// This creates both the category item and a slug reservation item in a single transaction
	slugReservationID := "SLUG#" + slug
	transactInput := &dynamodb.TransactWriteItemsInput{
		TransactItems: []types.TransactWriteItem{
			{
				// Put the category item
				Put: &types.Put{
					TableName:           &tableName,
					Item:                av,
					ConditionExpression: aws.String("attribute_not_exists(id)"),
				},
			},
			{
				// Put slug reservation item to ensure uniqueness atomically
				Put: &types.Put{
					TableName: &tableName,
					Item: map[string]types.AttributeValue{
						"id":         &types.AttributeValueMemberS{Value: slugReservationID},
						"slug":       &types.AttributeValueMemberS{Value: slug},
						"categoryId": &types.AttributeValueMemberS{Value: categoryID},
						"itemType":   &types.AttributeValueMemberS{Value: "SLUG_RESERVATION"},
					},
					ConditionExpression: aws.String("attribute_not_exists(id)"),
				},
			},
		},
	}

	_, err = dynamoClient.TransactWriteItems(ctx, transactInput)
	if err != nil {
		// Check if it's a transaction canceled error (slug already exists)
		if isTransactionCanceledError(err) {
			return errorResponse(409, "category with this slug already exists")
		}
		return errorResponse(500, "failed to create category")
	}

	// Return created category with 201 status
	return middleware.JSONResponse(201, category)
}

// isTransactionCanceledError checks if the error is a DynamoDB TransactionCanceledException
// This typically happens when a condition expression fails (e.g., slug already exists)
func isTransactionCanceledError(err error) bool {
	var tcErr *types.TransactionCanceledException
	return errors.As(err, &tcErr)
}

// getMaxSortOrder finds the maximum sortOrder value among existing categories.
//
// Scans the full table across all pages (issue #489). A DynamoDB Scan returns
// at most ~1MB per call; the previous implementation only inspected the
// first page and ignored LastEvaluatedKey, so once the Categories table grew
// past that size, the computed max could be smaller than the true max and a
// newly created category could collide with (or be inserted before) an
// existing sortOrder that only appeared on a later page.
func getMaxSortOrder(ctx context.Context, client DynamoDBClientInterface, tableName string) (int, error) {
	maxSortOrder := 0
	var exclusiveStartKey map[string]types.AttributeValue

	for {
		scanInput := &dynamodb.ScanInput{
			TableName:            aws.String(tableName),
			ProjectionExpression: aws.String("sortOrder"),
			ExclusiveStartKey:    exclusiveStartKey,
		}

		result, err := client.Scan(ctx, scanInput)
		if err != nil {
			return 0, err
		}

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

		if result.LastEvaluatedKey == nil {
			break
		}
		exclusiveStartKey = result.LastEvaluatedKey
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
