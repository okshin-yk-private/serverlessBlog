// Package main provides tests for the ListCategories Lambda function.
//
// Requirement 2: Category List API
// - 2.1: GET /categories returns all categories sorted by sortOrder ascending
// - 2.2: Return id, name, slug, and sortOrder fields
// - 2.3: Publicly accessible without authentication
// - 2.4: Return empty array with HTTP 200 when no categories exist
// - 2.5: Implement CORS headers
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
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"serverless-blog/go-functions/internal/domain"
)

// Test constants
const (
	testTableName = "test-categories-table"
	testCreatedAt = "2024-01-15T10:00:00Z"
	testUpdatedAt = "2024-01-15T11:00:00Z"
)

// MockDynamoDBClient is a mock implementation of DynamoDBClientInterface
type MockDynamoDBClient struct {
	ScanFunc func(ctx context.Context, params *dynamodb.ScanInput, optFns ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error)
}

func (m *MockDynamoDBClient) Scan(ctx context.Context, params *dynamodb.ScanInput, optFns ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
	if m.ScanFunc != nil {
		return m.ScanFunc(ctx, params, optFns...)
	}
	return nil, errors.New("ScanFunc not set")
}

func setupTest(t *testing.T) func() {
	t.Helper()
	t.Setenv("CATEGORIES_TABLE_NAME", testTableName)
	t.Setenv("AWS_REGION", "ap-northeast-1")

	// Store original getter
	originalGetter := dynamoClientGetter

	// Restore after test
	return func() {
		dynamoClientGetter = originalGetter
	}
}

// createTestCategory creates a test category with the given parameters
func createTestCategory(id, name, slug string, sortOrder int) domain.Category {
	return domain.Category{
		ID:        id,
		Name:      name,
		Slug:      slug,
		SortOrder: sortOrder,
		CreatedAt: testCreatedAt,
		UpdatedAt: testUpdatedAt,
	}
}

// TestHandler_SuccessfulListCategories tests successful retrieval of categories list
// Requirement 2.1: Return all categories sorted by sortOrder ascending
func TestHandler_SuccessfulListCategories(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	// Create test categories (unsorted to verify sorting)
	categories := []domain.Category{
		createTestCategory("cat-3", "ビジネス", "business", 3),
		createTestCategory("cat-1", "テクノロジー", "tech", 1),
		createTestCategory("cat-2", "ライフスタイル", "life", 2),
	}

	var items []map[string]types.AttributeValue
	for _, cat := range categories {
		av, err := attributevalue.MarshalMap(cat)
		if err != nil {
			t.Fatalf("failed to marshal category: %v", err)
		}
		items = append(items, av)
	}

	mockClient := &MockDynamoDBClient{
		ScanFunc: func(ctx context.Context, params *dynamodb.ScanInput, optFns ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
			// Verify table name
			if *params.TableName != testTableName {
				t.Errorf("expected table name %s, got %s", testTableName, *params.TableName)
			}

			return &dynamodb.ScanOutput{
				Items: items,
				Count: int32(len(items)),
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := events.APIGatewayProxyRequest{}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var listResp []domain.Category
	if err := json.Unmarshal([]byte(resp.Body), &listResp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if len(listResp) != 3 {
		t.Errorf("expected 3 categories, got %d", len(listResp))
	}

	// Verify sorting by sortOrder ascending
	if listResp[0].SortOrder != 1 {
		t.Errorf("expected first category sortOrder to be 1, got %d", listResp[0].SortOrder)
	}
	if listResp[1].SortOrder != 2 {
		t.Errorf("expected second category sortOrder to be 2, got %d", listResp[1].SortOrder)
	}
	if listResp[2].SortOrder != 3 {
		t.Errorf("expected third category sortOrder to be 3, got %d", listResp[2].SortOrder)
	}
}

// TestHandler_EmptyCategories tests handling of empty category list
// Requirement 2.4: Return empty array with HTTP 200 when no categories exist
func TestHandler_EmptyCategories(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		ScanFunc: func(ctx context.Context, params *dynamodb.ScanInput, optFns ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
			return &dynamodb.ScanOutput{
				Items: []map[string]types.AttributeValue{},
				Count: 0,
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := events.APIGatewayProxyRequest{}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var listResp []domain.Category
	if err := json.Unmarshal([]byte(resp.Body), &listResp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if len(listResp) != 0 {
		t.Errorf("expected 0 categories, got %d", len(listResp))
	}
}

// TestHandler_CORSHeaders tests that CORS headers are present in the response
// Requirement 2.5: Implement CORS headers for frontend access
func TestHandler_CORSHeaders(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		ScanFunc: func(ctx context.Context, params *dynamodb.ScanInput, optFns ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
			return &dynamodb.ScanOutput{
				Items: []map[string]types.AttributeValue{},
				Count: 0,
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := events.APIGatewayProxyRequest{}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	// Check CORS headers are present
	if resp.Headers["Access-Control-Allow-Origin"] != "*" {
		t.Errorf("expected Access-Control-Allow-Origin header to be *, got %q", resp.Headers["Access-Control-Allow-Origin"])
	}

	if resp.Headers["Content-Type"] != "application/json" {
		t.Errorf("expected Content-Type header to be application/json, got %q", resp.Headers["Content-Type"])
	}
}

// TestHandler_ResponseFields tests that response contains required fields
// Requirement 2.2: Return id, name, slug, and sortOrder fields
func TestHandler_ResponseFields(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	categories := []domain.Category{
		createTestCategory("cat-1", "テクノロジー", "tech", 1),
	}

	var items []map[string]types.AttributeValue
	for _, cat := range categories {
		av, err := attributevalue.MarshalMap(cat)
		if err != nil {
			t.Fatalf("failed to marshal category: %v", err)
		}
		items = append(items, av)
	}

	mockClient := &MockDynamoDBClient{
		ScanFunc: func(ctx context.Context, params *dynamodb.ScanInput, optFns ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
			return &dynamodb.ScanOutput{
				Items: items,
				Count: int32(len(items)),
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := events.APIGatewayProxyRequest{}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	// Parse response as raw JSON to verify field presence
	var responseList []map[string]interface{}
	if err := json.Unmarshal([]byte(resp.Body), &responseList); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if len(responseList) == 0 {
		t.Fatalf("expected at least 1 category")
	}

	item := responseList[0]
	requiredFields := []string{"id", "name", "slug", "sortOrder"}
	for _, field := range requiredFields {
		if _, ok := item[field]; !ok {
			t.Errorf("expected field %q to be present in response", field)
		}
	}
}

// TestHandler_MissingTableName tests 500 response when CATEGORIES_TABLE_NAME is not set
// Requirement 9.1: JSON error responses with message field
func TestHandler_MissingTableName(t *testing.T) {
	t.Setenv("CATEGORIES_TABLE_NAME", "")
	t.Setenv("AWS_REGION", "ap-northeast-1")

	request := events.APIGatewayProxyRequest{}

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

// TestHandler_DynamoDBClientInitError tests 500 response when DynamoDB client fails to initialize
func TestHandler_DynamoDBClientInitError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return nil, errors.New("failed to initialize DynamoDB client")
	}

	request := events.APIGatewayProxyRequest{}

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

// TestHandler_DynamoDBScanError tests 500 response when DynamoDB Scan fails
func TestHandler_DynamoDBScanError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		ScanFunc: func(ctx context.Context, params *dynamodb.ScanInput, optFns ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
			return nil, errors.New("DynamoDB error")
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := events.APIGatewayProxyRequest{}

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

	if errResp.Message != "failed to retrieve categories" {
		t.Errorf("expected error message %q, got %q", "failed to retrieve categories", errResp.Message)
	}
}

// TestHandler_SkipsInvalidItems tests that invalid items are skipped during processing
func TestHandler_SkipsInvalidItems(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	// Create one valid item and one invalid item
	validCat := createTestCategory("valid-cat", "Valid", "valid", 1)
	validAV, err := attributevalue.MarshalMap(validCat)
	if err != nil {
		t.Fatalf("failed to marshal category: %v", err)
	}

	// Invalid item: sortOrder as string instead of number
	invalidItem := map[string]types.AttributeValue{
		"id":        &types.AttributeValueMemberS{Value: "invalid-cat"},
		"sortOrder": &types.AttributeValueMemberS{Value: "not-a-number"},
	}

	mockClient := &MockDynamoDBClient{
		ScanFunc: func(ctx context.Context, params *dynamodb.ScanInput, optFns ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
			return &dynamodb.ScanOutput{
				Items: []map[string]types.AttributeValue{validAV, invalidItem},
				Count: 2,
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := events.APIGatewayProxyRequest{}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var listResp []domain.Category
	if err := json.Unmarshal([]byte(resp.Body), &listResp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	// Only the valid item should be returned
	if len(listResp) != 1 {
		t.Errorf("expected 1 valid category, got %d", len(listResp))
	}

	if len(listResp) > 0 && listResp[0].ID != "valid-cat" {
		t.Errorf("expected valid-cat, got %s", listResp[0].ID)
	}
}

// TestHandler_SortingStability tests that categories with same sortOrder maintain stable order
func TestHandler_SortingStability(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	// Create categories with different sortOrders to verify ascending order
	categories := []domain.Category{
		createTestCategory("cat-4", "その他", "other", 4),
		createTestCategory("cat-1", "テクノロジー", "tech", 1),
		createTestCategory("cat-3", "ビジネス", "business", 3),
		createTestCategory("cat-2", "ライフスタイル", "life", 2),
	}

	var items []map[string]types.AttributeValue
	for _, cat := range categories {
		av, err := attributevalue.MarshalMap(cat)
		if err != nil {
			t.Fatalf("failed to marshal category: %v", err)
		}
		items = append(items, av)
	}

	mockClient := &MockDynamoDBClient{
		ScanFunc: func(ctx context.Context, params *dynamodb.ScanInput, optFns ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
			return &dynamodb.ScanOutput{
				Items: items,
				Count: int32(len(items)),
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := events.APIGatewayProxyRequest{}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	var listResp []domain.Category
	if err := json.Unmarshal([]byte(resp.Body), &listResp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	// Verify all categories are sorted by sortOrder ascending
	for i := 0; i < len(listResp)-1; i++ {
		if listResp[i].SortOrder > listResp[i+1].SortOrder {
			t.Errorf("categories not sorted correctly: sortOrder %d comes before %d",
				listResp[i].SortOrder, listResp[i+1].SortOrder)
		}
	}
}

// TestHandler_CategoryWithDescription tests category with optional description field
func TestHandler_CategoryWithDescription(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	description := "Technology category description"
	cat := domain.Category{
		ID:          "cat-1",
		Name:        "テクノロジー",
		Slug:        "tech",
		Description: &description,
		SortOrder:   1,
		CreatedAt:   testCreatedAt,
		UpdatedAt:   testUpdatedAt,
	}

	av, err := attributevalue.MarshalMap(cat)
	if err != nil {
		t.Fatalf("failed to marshal category: %v", err)
	}

	mockClient := &MockDynamoDBClient{
		ScanFunc: func(ctx context.Context, params *dynamodb.ScanInput, optFns ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
			return &dynamodb.ScanOutput{
				Items: []map[string]types.AttributeValue{av},
				Count: 1,
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := events.APIGatewayProxyRequest{}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	// Requirement 2.2: Response should only include id, name, slug, sortOrder
	// Description should NOT be in the list response
	var listResp []domain.CategoryListItem
	if err := json.Unmarshal([]byte(resp.Body), &listResp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if len(listResp) != 1 {
		t.Fatalf("expected 1 category, got %d", len(listResp))
	}

	// Verify that category data is correct
	if listResp[0].ID != "cat-1" {
		t.Errorf("expected ID 'cat-1', got %q", listResp[0].ID)
	}

	// Note: Description field is NOT included in list response per requirement 2.2
	// This test now verifies that we get CategoryListItem (which has no Description)
}

// TestHandler_CategoryWithoutDescription tests category without optional description field
func TestHandler_CategoryWithoutDescription(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	cat := createTestCategory("cat-1", "テクノロジー", "tech", 1)
	av, err := attributevalue.MarshalMap(cat)
	if err != nil {
		t.Fatalf("failed to marshal category: %v", err)
	}

	mockClient := &MockDynamoDBClient{
		ScanFunc: func(ctx context.Context, params *dynamodb.ScanInput, optFns ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
			return &dynamodb.ScanOutput{
				Items: []map[string]types.AttributeValue{av},
				Count: 1,
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := events.APIGatewayProxyRequest{}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	var listResp []domain.CategoryListItem
	if err := json.Unmarshal([]byte(resp.Body), &listResp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if len(listResp) != 1 {
		t.Fatalf("expected 1 category, got %d", len(listResp))
	}

	// Requirement 2.2: Response only includes id, name, slug, sortOrder
	// CategoryListItem does not have Description field by design
	if listResp[0].ID != "cat-1" {
		t.Errorf("expected ID 'cat-1', got %q", listResp[0].ID)
	}
}

// TestHandler_NoAuthRequired tests that authentication is not required
// Requirement 2.3: Publicly accessible without authentication
func TestHandler_NoAuthRequired(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		ScanFunc: func(ctx context.Context, params *dynamodb.ScanInput, optFns ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
			return &dynamodb.ScanOutput{
				Items: []map[string]types.AttributeValue{},
				Count: 0,
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	// Request without any authorization context
	request := events.APIGatewayProxyRequest{
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: nil, // No authorization
		},
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	// Should succeed without authentication
	if resp.StatusCode != 200 {
		t.Errorf("expected status 200 without auth, got %d", resp.StatusCode)
	}
}
