// Package main provides tests for the DeleteCategory Lambda function.
//
// Requirement 5: Category Deletion API
// - 5.1: DELETE /admin/categories/{id} deletes category and returns 204 No Content
// - 5.2: Require Cognito authorization
// - 5.3: Return 404 if category ID does not exist
// - 5.4: Return 409 Conflict if posts are associated with the category
// - 5.5: Check BlogPosts CategoryIndex to determine if any posts reference the category
//
// Requirement 9: Error Handling
// - 9.1: JSON error responses with message field
// - 9.5: Log all errors with appropriate log levels
// - 9.6: X-Ray tracing for performance monitoring
package main

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"serverless-blog/go-functions/internal/domain"
)

// Test constants
const (
	testCategoriesTable = "test-categories-table"
	testPostsTable      = "test-posts-table"
	testCategoryIndex   = "CategoryIndex"
	testAuthorID        = "test-user-123"
	testCategoryID      = "cat-uuid-123"
)

// MockDynamoDBClient is a mock implementation of DynamoDBClientInterface
type MockDynamoDBClient struct {
	GetItemFunc    func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error)
	QueryFunc      func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error)
	DeleteItemFunc func(ctx context.Context, params *dynamodb.DeleteItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.DeleteItemOutput, error)
}

func (m *MockDynamoDBClient) GetItem(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
	if m.GetItemFunc != nil {
		return m.GetItemFunc(ctx, params, optFns...)
	}
	return nil, errors.New("GetItemFunc not set")
}

func (m *MockDynamoDBClient) Query(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
	if m.QueryFunc != nil {
		return m.QueryFunc(ctx, params, optFns...)
	}
	return nil, errors.New("QueryFunc not set")
}

func (m *MockDynamoDBClient) DeleteItem(ctx context.Context, params *dynamodb.DeleteItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.DeleteItemOutput, error) {
	if m.DeleteItemFunc != nil {
		return m.DeleteItemFunc(ctx, params, optFns...)
	}
	return nil, errors.New("DeleteItemFunc not set")
}

func setupTest(t *testing.T) func() {
	t.Helper()
	t.Setenv("CATEGORIES_TABLE_NAME", testCategoriesTable)
	t.Setenv("POSTS_TABLE_NAME", testPostsTable)
	t.Setenv("CATEGORY_INDEX_NAME", testCategoryIndex)
	t.Setenv("AWS_REGION", "ap-northeast-1")

	// Store original getter
	originalDynamoGetter := dynamoClientGetter

	// Restore after test
	return func() {
		dynamoClientGetter = originalDynamoGetter
	}
}

func createAuthenticatedRequest(categoryID string) events.APIGatewayProxyRequest {
	return events.APIGatewayProxyRequest{
		PathParameters: map[string]string{
			"id": categoryID,
		},
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{
					"sub": testAuthorID,
				},
			},
		},
	}
}

func createUnauthenticatedRequest(categoryID string) events.APIGatewayProxyRequest {
	return events.APIGatewayProxyRequest{
		PathParameters: map[string]string{
			"id": categoryID,
		},
	}
}

func createExistingCategory() domain.Category {
	return domain.Category{
		ID:          testCategoryID,
		Name:        "テクノロジー",
		Slug:        "tech",
		Description: aws.String("Technology category"),
		SortOrder:   1,
		CreatedAt:   "2024-01-01T10:00:00Z",
		UpdatedAt:   "2024-01-01T10:00:00Z",
	}
}

// TestHandler_SuccessfulDelete tests successful category deletion
// Requirement 5.1: DELETE /admin/categories/{id} deletes category and returns 204 No Content
func TestHandler_SuccessfulDelete(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	existingCat := createExistingCategory()
	existingAV, _ := attributevalue.MarshalMap(existingCat)

	var deletedID string

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: existingAV}, nil
		},
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			// No posts reference this category
			return &dynamodb.QueryOutput{Items: []map[string]types.AttributeValue{}, Count: 0}, nil
		},
		DeleteItemFunc: func(ctx context.Context, params *dynamodb.DeleteItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.DeleteItemOutput, error) {
			// Capture the deleted ID
			if idAttr, ok := params.Key["id"]; ok {
				if s, ok := idAttr.(*types.AttributeValueMemberS); ok {
					deletedID = s.Value
				}
			}
			return &dynamodb.DeleteItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := createAuthenticatedRequest(testCategoryID)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	// Requirement 5.1: Return 204 No Content
	if resp.StatusCode != 204 {
		t.Errorf("expected status 204, got %d. Body: %s", resp.StatusCode, resp.Body)
	}

	// Body should be empty for 204
	if resp.Body != "" {
		t.Errorf("expected empty body for 204, got %q", resp.Body)
	}

	// Verify the correct category was deleted
	if deletedID != testCategoryID {
		t.Errorf("expected deleted ID %q, got %q", testCategoryID, deletedID)
	}
}

// TestHandler_Unauthorized tests 401 response for unauthenticated requests
// Requirement 5.2: Require Cognito authorization
func TestHandler_Unauthorized(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	request := createUnauthenticatedRequest(testCategoryID)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 401 {
		t.Errorf("expected status 401, got %d", resp.StatusCode)
	}

	var errResp domain.ErrorResponse
	if err := json.Unmarshal([]byte(resp.Body), &errResp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if errResp.Message != "unauthorized" {
		t.Errorf("expected error message %q, got %q", "unauthorized", errResp.Message)
	}
}

// TestHandler_CategoryNotFound tests 404 response when category doesn't exist
// Requirement 5.3: Return 404 if category ID does not exist
func TestHandler_CategoryNotFound(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			// Return empty - category not found
			return &dynamodb.GetItemOutput{Item: nil}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := createAuthenticatedRequest("non-existent-id")

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 404 {
		t.Errorf("expected status 404, got %d", resp.StatusCode)
	}

	var errResp domain.ErrorResponse
	if err := json.Unmarshal([]byte(resp.Body), &errResp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if errResp.Message != "category not found" {
		t.Errorf("expected error message %q, got %q", "category not found", errResp.Message)
	}
}

// TestHandler_CategoryInUse tests 409 response when posts reference the category
// Requirement 5.4: Return 409 Conflict if posts are associated with the category
// Requirement 5.5: Check BlogPosts CategoryIndex to determine if any posts reference the category
func TestHandler_CategoryInUse(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	existingCat := createExistingCategory()
	existingAV, _ := attributevalue.MarshalMap(existingCat)

	// Create a post that references this category
	post := domain.BlogPost{ID: "post-1", Category: "tech"}
	postAV, _ := attributevalue.MarshalMap(post)

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: existingAV}, nil
		},
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			// Posts exist with this category
			return &dynamodb.QueryOutput{
				Items: []map[string]types.AttributeValue{postAV},
				Count: 1,
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := createAuthenticatedRequest(testCategoryID)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 409 {
		t.Errorf("expected status 409, got %d. Body: %s", resp.StatusCode, resp.Body)
	}

	var errResp domain.ErrorResponse
	if err := json.Unmarshal([]byte(resp.Body), &errResp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if errResp.Message != "category is in use by posts" {
		t.Errorf("expected error message %q, got %q", "category is in use by posts", errResp.Message)
	}
}

// TestHandler_MissingCategoryID tests 400 response for missing category ID
func TestHandler_MissingCategoryID(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{},
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{
					"sub": testAuthorID,
				},
			},
		},
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 400 {
		t.Errorf("expected status 400, got %d", resp.StatusCode)
	}

	var errResp domain.ErrorResponse
	if err := json.Unmarshal([]byte(resp.Body), &errResp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if errResp.Message != "category ID is required" {
		t.Errorf("expected error message %q, got %q", "category ID is required", errResp.Message)
	}
}

// TestHandler_EmptyCategoryID tests 400 response for empty category ID
func TestHandler_EmptyCategoryID(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	request := createAuthenticatedRequest("")

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 400 {
		t.Errorf("expected status 400, got %d", resp.StatusCode)
	}

	var errResp domain.ErrorResponse
	if err := json.Unmarshal([]byte(resp.Body), &errResp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if errResp.Message != "category ID is required" {
		t.Errorf("expected error message %q, got %q", "category ID is required", errResp.Message)
	}
}

// TestHandler_MissingTableName tests 500 response when table name is not configured
func TestHandler_MissingTableName(t *testing.T) {
	t.Setenv("CATEGORIES_TABLE_NAME", "")
	t.Setenv("AWS_REGION", "ap-northeast-1")

	request := createAuthenticatedRequest(testCategoryID)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 500 {
		t.Errorf("expected status 500, got %d", resp.StatusCode)
	}

	var errResp domain.ErrorResponse
	if err := json.Unmarshal([]byte(resp.Body), &errResp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if errResp.Message != "server configuration error" {
		t.Errorf("expected error message %q, got %q", "server configuration error", errResp.Message)
	}
}

// TestHandler_DynamoDBClientError tests 500 response when DynamoDB client fails
func TestHandler_DynamoDBClientError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return nil, errors.New("failed to create client")
	}

	request := createAuthenticatedRequest(testCategoryID)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 500 {
		t.Errorf("expected status 500, got %d", resp.StatusCode)
	}

	var errResp domain.ErrorResponse
	if err := json.Unmarshal([]byte(resp.Body), &errResp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if errResp.Message != "server error" {
		t.Errorf("expected error message %q, got %q", "server error", errResp.Message)
	}
}

// TestHandler_GetItemError tests 500 response when GetItem fails
func TestHandler_GetItemError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return nil, errors.New("DynamoDB get error")
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := createAuthenticatedRequest(testCategoryID)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 500 {
		t.Errorf("expected status 500, got %d", resp.StatusCode)
	}

	var errResp domain.ErrorResponse
	if err := json.Unmarshal([]byte(resp.Body), &errResp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if errResp.Message != "failed to retrieve category" {
		t.Errorf("expected error message about retrieval, got %q", errResp.Message)
	}
}

// TestHandler_QueryError tests 500 response when Query fails
func TestHandler_QueryError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	existingCat := createExistingCategory()
	existingAV, _ := attributevalue.MarshalMap(existingCat)

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: existingAV}, nil
		},
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			return nil, errors.New("DynamoDB query error")
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := createAuthenticatedRequest(testCategoryID)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 500 {
		t.Errorf("expected status 500, got %d", resp.StatusCode)
	}

	var errResp domain.ErrorResponse
	if err := json.Unmarshal([]byte(resp.Body), &errResp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if errResp.Message != "failed to check category usage" {
		t.Errorf("expected error message about category check, got %q", errResp.Message)
	}
}

// TestHandler_DeleteItemError tests 500 response when DeleteItem fails
func TestHandler_DeleteItemError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	existingCat := createExistingCategory()
	existingAV, _ := attributevalue.MarshalMap(existingCat)

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: existingAV}, nil
		},
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			// No posts reference this category
			return &dynamodb.QueryOutput{Items: []map[string]types.AttributeValue{}, Count: 0}, nil
		},
		DeleteItemFunc: func(ctx context.Context, params *dynamodb.DeleteItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.DeleteItemOutput, error) {
			return nil, errors.New("DynamoDB delete error")
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := createAuthenticatedRequest(testCategoryID)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 500 {
		t.Errorf("expected status 500, got %d", resp.StatusCode)
	}

	var errResp domain.ErrorResponse
	if err := json.Unmarshal([]byte(resp.Body), &errResp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if errResp.Message != "failed to delete category" {
		t.Errorf("expected error message %q, got %q", "failed to delete category", errResp.Message)
	}
}

// TestHandler_CORSHeaders tests that CORS headers are present in the response
func TestHandler_CORSHeaders(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	existingCat := createExistingCategory()
	existingAV, _ := attributevalue.MarshalMap(existingCat)

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: existingAV}, nil
		},
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			return &dynamodb.QueryOutput{Items: []map[string]types.AttributeValue{}, Count: 0}, nil
		},
		DeleteItemFunc: func(ctx context.Context, params *dynamodb.DeleteItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.DeleteItemOutput, error) {
			return &dynamodb.DeleteItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := createAuthenticatedRequest(testCategoryID)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.Headers["Access-Control-Allow-Origin"] != "*" {
		t.Errorf("expected Access-Control-Allow-Origin header to be *, got %q", resp.Headers["Access-Control-Allow-Origin"])
	}
}

// TestHandler_UsesCorrectCategoryIndexQuery tests that the query uses CategoryIndex with slug
// Requirement 5.5: Query CategoryIndex (KeyConditionExpression: category = :slug, Limit: 1)
func TestHandler_UsesCorrectCategoryIndexQuery(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	existingCat := createExistingCategory()
	existingAV, _ := attributevalue.MarshalMap(existingCat)

	var queryParams *dynamodb.QueryInput

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: existingAV}, nil
		},
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			queryParams = params
			return &dynamodb.QueryOutput{Items: []map[string]types.AttributeValue{}, Count: 0}, nil
		},
		DeleteItemFunc: func(ctx context.Context, params *dynamodb.DeleteItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.DeleteItemOutput, error) {
			return &dynamodb.DeleteItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := createAuthenticatedRequest(testCategoryID)

	_, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	// Verify query used correct index
	if queryParams == nil {
		t.Fatal("expected Query to be called")
	}

	if queryParams.IndexName == nil || *queryParams.IndexName != testCategoryIndex {
		t.Errorf("expected IndexName %q, got %v", testCategoryIndex, queryParams.IndexName)
	}

	// Verify query used slug (category) as key condition
	if queryParams.KeyConditionExpression == nil || *queryParams.KeyConditionExpression != "category = :slug" {
		t.Errorf("expected KeyConditionExpression 'category = :slug', got %v", queryParams.KeyConditionExpression)
	}

	// Verify Limit is set to 1 for efficiency
	if queryParams.Limit == nil || *queryParams.Limit != 1 {
		t.Errorf("expected Limit 1, got %v", queryParams.Limit)
	}

	// Verify the slug value is correctly used
	if slugVal, ok := queryParams.ExpressionAttributeValues[":slug"]; ok {
		if s, ok := slugVal.(*types.AttributeValueMemberS); ok {
			if s.Value != existingCat.Slug {
				t.Errorf("expected slug value %q, got %q", existingCat.Slug, s.Value)
			}
		} else {
			t.Error("expected slug to be a string value")
		}
	} else {
		t.Error("expected :slug in ExpressionAttributeValues")
	}
}

// TestHandler_UsesCorrectTable tests that delete uses the correct table
func TestHandler_UsesCorrectTable(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	existingCat := createExistingCategory()
	existingAV, _ := attributevalue.MarshalMap(existingCat)

	var deleteTableName string

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: existingAV}, nil
		},
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			return &dynamodb.QueryOutput{Items: []map[string]types.AttributeValue{}, Count: 0}, nil
		},
		DeleteItemFunc: func(ctx context.Context, params *dynamodb.DeleteItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.DeleteItemOutput, error) {
			if params.TableName != nil {
				deleteTableName = *params.TableName
			}
			return &dynamodb.DeleteItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := createAuthenticatedRequest(testCategoryID)

	_, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if deleteTableName != testCategoriesTable {
		t.Errorf("expected delete table name %q, got %q", testCategoriesTable, deleteTableName)
	}
}

// TestHandler_AuthorizerMissing tests 401 when authorizer is nil
func TestHandler_AuthorizerMissing(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{
			"id": testCategoryID,
		},
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: nil, // Missing authorizer
		},
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 401 {
		t.Errorf("expected status 401, got %d", resp.StatusCode)
	}
}

// TestHandler_ClaimsMissing tests 401 when claims are missing
func TestHandler_ClaimsMissing(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{
			"id": testCategoryID,
		},
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				// No claims
			},
		},
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 401 {
		t.Errorf("expected status 401, got %d", resp.StatusCode)
	}
}

// TestHandler_SubMissing tests 401 when sub claim is missing
func TestHandler_SubMissing(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{
			"id": testCategoryID,
		},
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{
					// No sub claim
				},
			},
		},
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 401 {
		t.Errorf("expected status 401, got %d", resp.StatusCode)
	}
}

// Ensure unused import warning is silenced
var _ = aws.String
