// Package main provides tests for the BulkUpdateSortOrder Lambda function.
//
// Requirement 4B: Category Sort Order Bulk Update API
// - 4B.1: PATCH /admin/categories/sort with array updates all and returns 200
// - 4B.2: Require Cognito authorization
// - 4B.3: Return 400 Bad Request with list of invalid IDs if any ID doesn't exist
// - 4B.4: Update updatedAt timestamp for all updated categories
// - 4B.5: Perform bulk update atomically using TransactWriteItems
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
	testAuthorID        = "test-user-123"
)

// MockDynamoDBClient is a mock implementation of DynamoDBClientInterface
type MockDynamoDBClient struct {
	GetItemFunc            func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error)
	BatchGetItemFunc       func(ctx context.Context, params *dynamodb.BatchGetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.BatchGetItemOutput, error)
	TransactWriteItemsFunc func(ctx context.Context, params *dynamodb.TransactWriteItemsInput, optFns ...func(*dynamodb.Options)) (*dynamodb.TransactWriteItemsOutput, error)
}

func (m *MockDynamoDBClient) GetItem(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
	if m.GetItemFunc != nil {
		return m.GetItemFunc(ctx, params, optFns...)
	}
	return nil, errors.New("GetItemFunc not set")
}

func (m *MockDynamoDBClient) BatchGetItem(ctx context.Context, params *dynamodb.BatchGetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.BatchGetItemOutput, error) {
	if m.BatchGetItemFunc != nil {
		return m.BatchGetItemFunc(ctx, params, optFns...)
	}
	return nil, errors.New("BatchGetItemFunc not set")
}

func (m *MockDynamoDBClient) TransactWriteItems(ctx context.Context, params *dynamodb.TransactWriteItemsInput, optFns ...func(*dynamodb.Options)) (*dynamodb.TransactWriteItemsOutput, error) {
	if m.TransactWriteItemsFunc != nil {
		return m.TransactWriteItemsFunc(ctx, params, optFns...)
	}
	return nil, errors.New("TransactWriteItemsFunc not set")
}

func setupTest(t *testing.T) func() {
	t.Helper()
	t.Setenv("CATEGORIES_TABLE_NAME", testCategoriesTable)
	t.Setenv("AWS_REGION", "ap-northeast-1")

	// Store original getters
	originalDynamoGetter := dynamoClientGetter
	originalTimeNow := timeNow

	// Restore after test
	return func() {
		dynamoClientGetter = originalDynamoGetter
		timeNow = originalTimeNow
	}
}

func createAuthenticatedRequest(body string) events.APIGatewayProxyRequest {
	return events.APIGatewayProxyRequest{
		Body: body,
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{
					"sub": testAuthorID,
				},
			},
		},
	}
}

func createUnauthenticatedRequest(body string) events.APIGatewayProxyRequest {
	return events.APIGatewayProxyRequest{
		Body: body,
	}
}

func createTestCategories() []domain.Category {
	return []domain.Category{
		{
			ID:        "cat-1",
			Name:      "テクノロジー",
			Slug:      "tech",
			SortOrder: 1,
			CreatedAt: "2024-01-01T10:00:00Z",
			UpdatedAt: "2024-01-01T10:00:00Z",
		},
		{
			ID:        "cat-2",
			Name:      "ライフスタイル",
			Slug:      "life",
			SortOrder: 2,
			CreatedAt: "2024-01-01T10:00:00Z",
			UpdatedAt: "2024-01-01T10:00:00Z",
		},
		{
			ID:        "cat-3",
			Name:      "ビジネス",
			Slug:      "business",
			SortOrder: 3,
			CreatedAt: "2024-01-01T10:00:00Z",
			UpdatedAt: "2024-01-01T10:00:00Z",
		},
	}
}

// TestHandler_SuccessfulBulkUpdate tests successful bulk sort order update
// Requirement 4B.1: PATCH /admin/categories/sort with array updates all and returns 200
func TestHandler_SuccessfulBulkUpdate(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	testTime := "2024-01-15T10:00:00Z"
	timeNow = func() string { return testTime }

	categories := createTestCategories()

	// Build response map for BatchGetItem
	responseItems := make([]map[string]types.AttributeValue, 0, len(categories))
	for _, cat := range categories {
		av, _ := attributevalue.MarshalMap(cat)
		responseItems = append(responseItems, av)
	}

	var transactItems []types.TransactWriteItem

	mockClient := &MockDynamoDBClient{
		BatchGetItemFunc: func(ctx context.Context, params *dynamodb.BatchGetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.BatchGetItemOutput, error) {
			return &dynamodb.BatchGetItemOutput{
				Responses: map[string][]map[string]types.AttributeValue{
					testCategoriesTable: responseItems,
				},
			}, nil
		},
		TransactWriteItemsFunc: func(ctx context.Context, params *dynamodb.TransactWriteItemsInput, optFns ...func(*dynamodb.Options)) (*dynamodb.TransactWriteItemsOutput, error) {
			transactItems = params.TransactItems
			return &dynamodb.TransactWriteItemsOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	// Reorder categories: cat-3 becomes 1, cat-1 becomes 2, cat-2 becomes 3
	reqBody := `{"orders":[{"id":"cat-3","sortOrder":1},{"id":"cat-1","sortOrder":2},{"id":"cat-2","sortOrder":3}]}`
	request := createAuthenticatedRequest(reqBody)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d. Body: %s", resp.StatusCode, resp.Body)
	}

	var updatedCategories []domain.Category
	if err := json.Unmarshal([]byte(resp.Body), &updatedCategories); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	// Verify all categories returned
	if len(updatedCategories) != 3 {
		t.Errorf("expected 3 categories in response, got %d", len(updatedCategories))
	}

	// Verify transaction was called with correct number of items
	if len(transactItems) != 3 {
		t.Errorf("expected 3 transaction items, got %d", len(transactItems))
	}
}

// TestHandler_UpdatedAtTimestamp tests that updatedAt is updated for all categories
// Requirement 4B.4: Update updatedAt timestamp for all updated categories
func TestHandler_UpdatedAtTimestamp(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	testTime := "2024-01-15T15:30:00Z"
	timeNow = func() string { return testTime }

	categories := createTestCategories()

	responseItems := make([]map[string]types.AttributeValue, 0, len(categories))
	for _, cat := range categories {
		av, _ := attributevalue.MarshalMap(cat)
		responseItems = append(responseItems, av)
	}

	mockClient := &MockDynamoDBClient{
		BatchGetItemFunc: func(ctx context.Context, params *dynamodb.BatchGetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.BatchGetItemOutput, error) {
			return &dynamodb.BatchGetItemOutput{
				Responses: map[string][]map[string]types.AttributeValue{
					testCategoriesTable: responseItems,
				},
			}, nil
		},
		TransactWriteItemsFunc: func(ctx context.Context, params *dynamodb.TransactWriteItemsInput, optFns ...func(*dynamodb.Options)) (*dynamodb.TransactWriteItemsOutput, error) {
			return &dynamodb.TransactWriteItemsOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	reqBody := `{"orders":[{"id":"cat-1","sortOrder":2},{"id":"cat-2","sortOrder":1}]}`
	request := createAuthenticatedRequest(reqBody)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var updatedCategories []domain.Category
	if err := json.Unmarshal([]byte(resp.Body), &updatedCategories); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	// Verify updatedAt is set to current time for all categories
	for _, cat := range updatedCategories {
		if cat.UpdatedAt != testTime {
			t.Errorf("expected UpdatedAt %q for category %s, got %q", testTime, cat.ID, cat.UpdatedAt)
		}
	}
}

// TestHandler_Unauthorized tests 401 response for unauthenticated requests
// Requirement 4B.2: Require Cognito authorization
func TestHandler_Unauthorized(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	reqBody := `{"orders":[{"id":"cat-1","sortOrder":1}]}`
	request := createUnauthenticatedRequest(reqBody)

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

// TestHandler_InvalidCategoryID tests 400 response when some category IDs don't exist
// Requirement 4B.3: Return 400 Bad Request with list of invalid IDs if any ID doesn't exist
func TestHandler_InvalidCategoryID(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	categories := createTestCategories()[:2] // Only cat-1 and cat-2 exist

	responseItems := make([]map[string]types.AttributeValue, 0, len(categories))
	for _, cat := range categories {
		av, _ := attributevalue.MarshalMap(cat)
		responseItems = append(responseItems, av)
	}

	mockClient := &MockDynamoDBClient{
		BatchGetItemFunc: func(ctx context.Context, params *dynamodb.BatchGetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.BatchGetItemOutput, error) {
			return &dynamodb.BatchGetItemOutput{
				Responses: map[string][]map[string]types.AttributeValue{
					testCategoriesTable: responseItems,
				},
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	// Request includes "cat-nonexistent" which doesn't exist
	reqBody := `{"orders":[{"id":"cat-1","sortOrder":1},{"id":"cat-nonexistent","sortOrder":2}]}`
	request := createAuthenticatedRequest(reqBody)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 400 {
		t.Errorf("expected status 400, got %d. Body: %s", resp.StatusCode, resp.Body)
	}

	// Response should mention invalid IDs
	var errResp map[string]interface{}
	if err := json.Unmarshal([]byte(resp.Body), &errResp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	// Check for invalidIds field
	invalidIDs, ok := errResp["invalidIds"]
	if !ok {
		t.Error("expected response to contain invalidIds field")
	}

	// Convert to slice and check
	ids, ok := invalidIDs.([]interface{})
	if !ok || len(ids) == 0 {
		t.Error("expected invalidIds to be a non-empty array")
	}
}

// TestHandler_EmptyOrders tests 400 response for empty orders array
func TestHandler_EmptyOrders(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	reqBody := `{"orders":[]}`
	request := createAuthenticatedRequest(reqBody)

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

	if errResp.Message != "orders array is required and cannot be empty" {
		t.Errorf("expected error about empty orders, got %q", errResp.Message)
	}
}

// TestHandler_InvalidJSON tests 400 response for invalid JSON body
func TestHandler_InvalidJSON(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	reqBody := `{invalid json}`
	request := createAuthenticatedRequest(reqBody)

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

	if errResp.Message != "invalid request body" {
		t.Errorf("expected error message %q, got %q", "invalid request body", errResp.Message)
	}
}

// TestHandler_MissingTableName tests 500 response when table name is not configured
func TestHandler_MissingTableName(t *testing.T) {
	t.Setenv("CATEGORIES_TABLE_NAME", "")
	t.Setenv("AWS_REGION", "ap-northeast-1")

	reqBody := `{"orders":[{"id":"cat-1","sortOrder":1}]}`
	request := createAuthenticatedRequest(reqBody)

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

	reqBody := `{"orders":[{"id":"cat-1","sortOrder":1}]}`
	request := createAuthenticatedRequest(reqBody)

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

// TestHandler_BatchGetItemError tests 500 response when BatchGetItem fails
func TestHandler_BatchGetItemError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		BatchGetItemFunc: func(ctx context.Context, params *dynamodb.BatchGetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.BatchGetItemOutput, error) {
			return nil, errors.New("DynamoDB batch get error")
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	reqBody := `{"orders":[{"id":"cat-1","sortOrder":1}]}`
	request := createAuthenticatedRequest(reqBody)

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

	if errResp.Message != "failed to verify categories" {
		t.Errorf("expected error message about verification, got %q", errResp.Message)
	}
}

// TestHandler_TransactWriteError tests 500 response when TransactWriteItems fails
// Requirement 4B.5: Atomic update using TransactWriteItems
func TestHandler_TransactWriteError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	testTime := "2024-01-15T10:00:00Z"
	timeNow = func() string { return testTime }

	categories := createTestCategories()

	responseItems := make([]map[string]types.AttributeValue, 0, len(categories))
	for _, cat := range categories {
		av, _ := attributevalue.MarshalMap(cat)
		responseItems = append(responseItems, av)
	}

	mockClient := &MockDynamoDBClient{
		BatchGetItemFunc: func(ctx context.Context, params *dynamodb.BatchGetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.BatchGetItemOutput, error) {
			return &dynamodb.BatchGetItemOutput{
				Responses: map[string][]map[string]types.AttributeValue{
					testCategoriesTable: responseItems,
				},
			}, nil
		},
		TransactWriteItemsFunc: func(ctx context.Context, params *dynamodb.TransactWriteItemsInput, optFns ...func(*dynamodb.Options)) (*dynamodb.TransactWriteItemsOutput, error) {
			return nil, errors.New("DynamoDB transaction error")
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	reqBody := `{"orders":[{"id":"cat-1","sortOrder":1}]}`
	request := createAuthenticatedRequest(reqBody)

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

	if errResp.Message != "failed to update categories" {
		t.Errorf("expected error message about update, got %q", errResp.Message)
	}
}

// TestHandler_CORSHeaders tests that CORS headers are present in the response
func TestHandler_CORSHeaders(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	testTime := "2024-01-15T10:00:00Z"
	timeNow = func() string { return testTime }

	categories := createTestCategories()

	responseItems := make([]map[string]types.AttributeValue, 0, len(categories))
	for _, cat := range categories {
		av, _ := attributevalue.MarshalMap(cat)
		responseItems = append(responseItems, av)
	}

	mockClient := &MockDynamoDBClient{
		BatchGetItemFunc: func(ctx context.Context, params *dynamodb.BatchGetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.BatchGetItemOutput, error) {
			return &dynamodb.BatchGetItemOutput{
				Responses: map[string][]map[string]types.AttributeValue{
					testCategoriesTable: responseItems,
				},
			}, nil
		},
		TransactWriteItemsFunc: func(ctx context.Context, params *dynamodb.TransactWriteItemsInput, optFns ...func(*dynamodb.Options)) (*dynamodb.TransactWriteItemsOutput, error) {
			return &dynamodb.TransactWriteItemsOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	reqBody := `{"orders":[{"id":"cat-1","sortOrder":1}]}`
	request := createAuthenticatedRequest(reqBody)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.Headers["Access-Control-Allow-Origin"] != "*" {
		t.Errorf("expected Access-Control-Allow-Origin header to be *, got %q", resp.Headers["Access-Control-Allow-Origin"])
	}

	if resp.Headers["Content-Type"] != "application/json" {
		t.Errorf("expected Content-Type header to be application/json, got %q", resp.Headers["Content-Type"])
	}
}

// TestHandler_AtomicUpdate tests that all updates happen atomically
// Requirement 4B.5: Perform bulk update atomically using TransactWriteItems
func TestHandler_AtomicUpdate(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	testTime := "2024-01-15T10:00:00Z"
	timeNow = func() string { return testTime }

	categories := createTestCategories()

	responseItems := make([]map[string]types.AttributeValue, 0, len(categories))
	for _, cat := range categories {
		av, _ := attributevalue.MarshalMap(cat)
		responseItems = append(responseItems, av)
	}

	var capturedTransactItems []types.TransactWriteItem

	mockClient := &MockDynamoDBClient{
		BatchGetItemFunc: func(ctx context.Context, params *dynamodb.BatchGetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.BatchGetItemOutput, error) {
			return &dynamodb.BatchGetItemOutput{
				Responses: map[string][]map[string]types.AttributeValue{
					testCategoriesTable: responseItems,
				},
			}, nil
		},
		TransactWriteItemsFunc: func(ctx context.Context, params *dynamodb.TransactWriteItemsInput, optFns ...func(*dynamodb.Options)) (*dynamodb.TransactWriteItemsOutput, error) {
			capturedTransactItems = params.TransactItems
			return &dynamodb.TransactWriteItemsOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	// Update 3 categories
	reqBody := `{"orders":[{"id":"cat-1","sortOrder":3},{"id":"cat-2","sortOrder":1},{"id":"cat-3","sortOrder":2}]}`
	request := createAuthenticatedRequest(reqBody)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	// Verify all 3 updates are in a single transaction
	if len(capturedTransactItems) != 3 {
		t.Errorf("expected 3 items in transaction for atomic update, got %d", len(capturedTransactItems))
	}

	// Verify each item is an Update operation
	for i, item := range capturedTransactItems {
		if item.Update == nil {
			t.Errorf("transaction item %d should be an Update operation", i)
		}
	}
}

// TestHandler_PreservesOtherFields tests that other fields are preserved during update
func TestHandler_PreservesOtherFields(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	testTime := "2024-01-15T10:00:00Z"
	timeNow = func() string { return testTime }

	desc := "Test description"
	category := domain.Category{
		ID:          "cat-1",
		Name:        "テクノロジー",
		Slug:        "tech",
		Description: &desc,
		SortOrder:   1,
		CreatedAt:   "2024-01-01T10:00:00Z",
		UpdatedAt:   "2024-01-01T10:00:00Z",
	}

	catAV, _ := attributevalue.MarshalMap(category)

	mockClient := &MockDynamoDBClient{
		BatchGetItemFunc: func(ctx context.Context, params *dynamodb.BatchGetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.BatchGetItemOutput, error) {
			return &dynamodb.BatchGetItemOutput{
				Responses: map[string][]map[string]types.AttributeValue{
					testCategoriesTable: {catAV},
				},
			}, nil
		},
		TransactWriteItemsFunc: func(ctx context.Context, params *dynamodb.TransactWriteItemsInput, optFns ...func(*dynamodb.Options)) (*dynamodb.TransactWriteItemsOutput, error) {
			return &dynamodb.TransactWriteItemsOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	reqBody := `{"orders":[{"id":"cat-1","sortOrder":5}]}`
	request := createAuthenticatedRequest(reqBody)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var updatedCategories []domain.Category
	if err := json.Unmarshal([]byte(resp.Body), &updatedCategories); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if len(updatedCategories) != 1 {
		t.Fatalf("expected 1 category, got %d", len(updatedCategories))
	}

	updated := updatedCategories[0]

	// Verify sortOrder was updated
	if updated.SortOrder != 5 {
		t.Errorf("expected SortOrder 5, got %d", updated.SortOrder)
	}

	// Verify other fields are preserved
	if updated.Name != "テクノロジー" {
		t.Errorf("expected Name preserved, got %q", updated.Name)
	}
	if updated.Slug != "tech" {
		t.Errorf("expected Slug preserved, got %q", updated.Slug)
	}
	if updated.Description == nil || *updated.Description != "Test description" {
		t.Errorf("expected Description preserved, got %v", updated.Description)
	}
	if updated.CreatedAt != "2024-01-01T10:00:00Z" {
		t.Errorf("expected CreatedAt preserved, got %q", updated.CreatedAt)
	}
	// updatedAt should be updated
	if updated.UpdatedAt != testTime {
		t.Errorf("expected UpdatedAt to be updated to %q, got %q", testTime, updated.UpdatedAt)
	}
}

// TestHandler_DuplicateIDs tests 400 response when duplicate IDs are provided
func TestHandler_DuplicateIDs(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	reqBody := `{"orders":[{"id":"cat-1","sortOrder":1},{"id":"cat-1","sortOrder":2}]}`
	request := createAuthenticatedRequest(reqBody)

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

	if errResp.Message != "duplicate category IDs in request" {
		t.Errorf("expected error about duplicate IDs, got %q", errResp.Message)
	}
}

// TestHandler_MaxItemsLimit tests handling of max 100 items (TransactWriteItems limit)
func TestHandler_MaxItemsLimit(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	testTime := "2024-01-15T10:00:00Z"
	timeNow = func() string { return testTime }

	// Create 100 categories
	categories := make([]domain.Category, 100)
	responseItems := make([]map[string]types.AttributeValue, 100)
	orders := make([]map[string]interface{}, 100)

	for i := 0; i < 100; i++ {
		id := "cat-" + string(rune('a'+i/26)) + string(rune('a'+i%26))
		categories[i] = domain.Category{
			ID:        id,
			Name:      "Category " + id,
			Slug:      id,
			SortOrder: i + 1,
			CreatedAt: "2024-01-01T10:00:00Z",
			UpdatedAt: "2024-01-01T10:00:00Z",
		}
		av, _ := attributevalue.MarshalMap(categories[i])
		responseItems[i] = av
		orders[i] = map[string]interface{}{"id": id, "sortOrder": 100 - i}
	}

	mockClient := &MockDynamoDBClient{
		BatchGetItemFunc: func(ctx context.Context, params *dynamodb.BatchGetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.BatchGetItemOutput, error) {
			return &dynamodb.BatchGetItemOutput{
				Responses: map[string][]map[string]types.AttributeValue{
					testCategoriesTable: responseItems,
				},
			}, nil
		},
		TransactWriteItemsFunc: func(ctx context.Context, params *dynamodb.TransactWriteItemsInput, optFns ...func(*dynamodb.Options)) (*dynamodb.TransactWriteItemsOutput, error) {
			return &dynamodb.TransactWriteItemsOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	reqBody, _ := json.Marshal(map[string]interface{}{"orders": orders})
	request := createAuthenticatedRequest(string(reqBody))

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200 for 100 items (TransactWriteItems limit), got %d. Body: %s", resp.StatusCode, resp.Body)
	}
}

// TestHandler_ExceedsMaxItemsLimit tests 400 response when more than 100 items
func TestHandler_ExceedsMaxItemsLimit(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	// Create request with 101 items
	orders := make([]map[string]interface{}, 101)
	for i := 0; i < 101; i++ {
		orders[i] = map[string]interface{}{"id": "cat-" + string(rune('a'+i)), "sortOrder": i}
	}

	reqBody, _ := json.Marshal(map[string]interface{}{"orders": orders})
	request := createAuthenticatedRequest(string(reqBody))

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

	if errResp.Message != "maximum 100 categories can be updated at once" {
		t.Errorf("expected error about max items, got %q", errResp.Message)
	}
}

// Ensure unused import warning is silenced
var _ = aws.String
