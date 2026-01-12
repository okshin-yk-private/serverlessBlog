// Package main provides tests for the CreateCategory Lambda function.
//
// Requirement 3: Category Creation API
// - 3.1: POST /admin/categories with valid data creates category and returns 201
// - 3.2: Require Cognito authorization
// - 3.3: Return 400 if name is missing or empty
// - 3.4: Return 409 Conflict if slug already exists
// - 3.5: Auto-generate slug from name if not provided
// - 3.6: Set createdAt and updatedAt to current ISO 8601 timestamp
// - 3.7: Assign next available sortOrder if not provided
//
// Requirement 9: Error Handling
// - 9.1: JSON error responses with message field
// - 9.2: Return 400 for invalid JSON
// - 9.3: Return 400 if name exceeds 100 characters
// - 9.4: Return 400 if slug contains invalid characters
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
	testTableName = "test-categories-table"
	testSlugIndex = "SlugIndex"
	testAuthorID  = "test-user-123"
)

// MockDynamoDBClient is a mock implementation of DynamoDBClientInterface
type MockDynamoDBClient struct {
	QueryFunc   func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error)
	PutItemFunc func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error)
	ScanFunc    func(ctx context.Context, params *dynamodb.ScanInput, optFns ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error)
}

func (m *MockDynamoDBClient) Query(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
	if m.QueryFunc != nil {
		return m.QueryFunc(ctx, params, optFns...)
	}
	return nil, errors.New("QueryFunc not set")
}

func (m *MockDynamoDBClient) PutItem(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
	if m.PutItemFunc != nil {
		return m.PutItemFunc(ctx, params, optFns...)
	}
	return nil, errors.New("PutItemFunc not set")
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
	t.Setenv("SLUG_INDEX_NAME", testSlugIndex)
	t.Setenv("AWS_REGION", "ap-northeast-1")

	// Store original getters
	originalDynamoGetter := dynamoClientGetter
	originalUUIDGenerator := uuidGenerator
	originalTimeNow := timeNow

	// Restore after test
	return func() {
		dynamoClientGetter = originalDynamoGetter
		uuidGenerator = originalUUIDGenerator
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

// TestHandler_SuccessfulCreateCategory tests successful category creation
// Requirement 3.1: POST /admin/categories with valid data creates category and returns 201
func TestHandler_SuccessfulCreateCategory(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	testUUID := "test-uuid-123"
	testTime := "2024-01-15T10:00:00Z"

	uuidGenerator = func() string { return testUUID }
	timeNow = func() string { return testTime }

	var savedItem map[string]types.AttributeValue

	mockClient := &MockDynamoDBClient{
		// Query for slug check - returns empty (slug not exists)
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			return &dynamodb.QueryOutput{
				Items: []map[string]types.AttributeValue{},
				Count: 0,
			}, nil
		},
		// Scan for max sortOrder - returns empty
		ScanFunc: func(ctx context.Context, params *dynamodb.ScanInput, optFns ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
			return &dynamodb.ScanOutput{
				Items: []map[string]types.AttributeValue{},
				Count: 0,
			}, nil
		},
		// PutItem saves the category
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			savedItem = params.Item
			return &dynamodb.PutItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	reqBody := `{"name":"テクノロジー","slug":"tech","description":"Technology category"}`
	request := createAuthenticatedRequest(reqBody)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 201 {
		t.Errorf("expected status 201, got %d. Body: %s", resp.StatusCode, resp.Body)
	}

	var category domain.Category
	if err := json.Unmarshal([]byte(resp.Body), &category); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	// Verify category fields
	if category.ID != testUUID {
		t.Errorf("expected ID %q, got %q", testUUID, category.ID)
	}
	if category.Name != "テクノロジー" {
		t.Errorf("expected Name %q, got %q", "テクノロジー", category.Name)
	}
	if category.Slug != "tech" {
		t.Errorf("expected Slug %q, got %q", "tech", category.Slug)
	}
	if category.CreatedAt != testTime {
		t.Errorf("expected CreatedAt %q, got %q", testTime, category.CreatedAt)
	}
	if category.UpdatedAt != testTime {
		t.Errorf("expected UpdatedAt %q, got %q", testTime, category.UpdatedAt)
	}

	// Verify item was saved
	if savedItem == nil {
		t.Fatal("expected item to be saved")
	}
}

// TestHandler_AutoGenerateSlug tests auto-generation of slug from name
// Requirement 3.5: Auto-generate slug from name if not provided
func TestHandler_AutoGenerateSlug(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	testUUID := "test-uuid-456"
	testTime := "2024-01-15T10:00:00Z"

	uuidGenerator = func() string { return testUUID }
	timeNow = func() string { return testTime }

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			return &dynamodb.QueryOutput{Items: []map[string]types.AttributeValue{}, Count: 0}, nil
		},
		ScanFunc: func(ctx context.Context, params *dynamodb.ScanInput, optFns ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
			return &dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{}, Count: 0}, nil
		},
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			return &dynamodb.PutItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	// Request without slug - should auto-generate
	reqBody := `{"name":"Technology News"}`
	request := createAuthenticatedRequest(reqBody)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 201 {
		t.Errorf("expected status 201, got %d. Body: %s", resp.StatusCode, resp.Body)
	}

	var category domain.Category
	if err := json.Unmarshal([]byte(resp.Body), &category); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	// Verify auto-generated slug
	if category.Slug != "technology-news" {
		t.Errorf("expected auto-generated slug %q, got %q", "technology-news", category.Slug)
	}
}

// TestHandler_AutoAssignSortOrder tests auto-assignment of sortOrder
// Requirement 3.7: Assign next available sortOrder if not provided
func TestHandler_AutoAssignSortOrder(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	testUUID := "test-uuid-789"
	testTime := "2024-01-15T10:00:00Z"

	uuidGenerator = func() string { return testUUID }
	timeNow = func() string { return testTime }

	// Existing category with sortOrder 3
	existingCat := domain.Category{ID: "existing-1", SortOrder: 3}
	existingAV, _ := attributevalue.MarshalMap(existingCat)

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			return &dynamodb.QueryOutput{Items: []map[string]types.AttributeValue{}, Count: 0}, nil
		},
		ScanFunc: func(ctx context.Context, params *dynamodb.ScanInput, optFns ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
			return &dynamodb.ScanOutput{
				Items: []map[string]types.AttributeValue{existingAV},
				Count: 1,
			}, nil
		},
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			return &dynamodb.PutItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	// Request without sortOrder - should auto-assign next value (3+1=4)
	reqBody := `{"name":"New Category"}`
	request := createAuthenticatedRequest(reqBody)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 201 {
		t.Errorf("expected status 201, got %d. Body: %s", resp.StatusCode, resp.Body)
	}

	var category domain.Category
	if err := json.Unmarshal([]byte(resp.Body), &category); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	// Verify sortOrder is next available (3+1=4)
	if category.SortOrder != 4 {
		t.Errorf("expected sortOrder 4, got %d", category.SortOrder)
	}
}

// TestHandler_ProvidedSortOrder tests explicit sortOrder in request
func TestHandler_ProvidedSortOrder(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	testUUID := "test-uuid-aaa"
	testTime := "2024-01-15T10:00:00Z"

	uuidGenerator = func() string { return testUUID }
	timeNow = func() string { return testTime }

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			return &dynamodb.QueryOutput{Items: []map[string]types.AttributeValue{}, Count: 0}, nil
		},
		ScanFunc: func(ctx context.Context, params *dynamodb.ScanInput, optFns ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
			return &dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{}, Count: 0}, nil
		},
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			return &dynamodb.PutItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	// Request with explicit sortOrder
	reqBody := `{"name":"Test Category","sortOrder":10}`
	request := createAuthenticatedRequest(reqBody)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 201 {
		t.Errorf("expected status 201, got %d. Body: %s", resp.StatusCode, resp.Body)
	}

	var category domain.Category
	if err := json.Unmarshal([]byte(resp.Body), &category); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	// Verify provided sortOrder is used
	if category.SortOrder != 10 {
		t.Errorf("expected sortOrder 10, got %d", category.SortOrder)
	}
}

// TestHandler_Unauthorized tests 401 response for unauthenticated requests
// Requirement 3.2: Require Cognito authorization
func TestHandler_Unauthorized(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	reqBody := `{"name":"Test Category"}`
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

// TestHandler_MissingName tests 400 response for missing name
// Requirement 3.3: Return 400 if name is missing or empty
func TestHandler_MissingName(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	reqBody := `{"slug":"test-slug"}`
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

	if errResp.Message != "name is required" {
		t.Errorf("expected error message %q, got %q", "name is required", errResp.Message)
	}
}

// TestHandler_EmptyName tests 400 response for empty name
// Requirement 3.3: Return 400 if name is missing or empty
func TestHandler_EmptyName(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	reqBody := `{"name":""}`
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

	if errResp.Message != "name is required" {
		t.Errorf("expected error message %q, got %q", "name is required", errResp.Message)
	}
}

// TestHandler_NameTooLong tests 400 response for name exceeding 100 characters
// Requirement 9.3: Return 400 if name exceeds 100 characters
func TestHandler_NameTooLong(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	// Create a name with 101 characters
	longName := ""
	for i := 0; i < 101; i++ {
		longName += "a"
	}

	reqBody := `{"name":"` + longName + `"}`
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

	if errResp.Message != "name must be 100 characters or less" {
		t.Errorf("expected error message %q, got %q", "name must be 100 characters or less", errResp.Message)
	}
}

// TestHandler_InvalidSlugCharacters tests 400 response for invalid slug characters
// Requirement 9.4: Return 400 if slug contains invalid characters
func TestHandler_InvalidSlugCharacters(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	reqBody := `{"name":"Test","slug":"invalid_slug!"}`
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

	if errResp.Message != "slug must contain only lowercase alphanumeric characters and hyphens" {
		t.Errorf("expected error message about slug, got %q", errResp.Message)
	}
}

// TestHandler_InvalidJSON tests 400 response for invalid JSON body
// Requirement 9.2: Return 400 for invalid JSON
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

// TestHandler_SlugAlreadyExists tests 409 response for duplicate slug
// Requirement 3.4: Return 409 Conflict if slug already exists
func TestHandler_SlugAlreadyExists(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	// Existing category with same slug
	existingCat := domain.Category{ID: "existing-1", Slug: "tech"}
	existingAV, _ := attributevalue.MarshalMap(existingCat)

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			// Return existing category (slug exists)
			return &dynamodb.QueryOutput{
				Items: []map[string]types.AttributeValue{existingAV},
				Count: 1,
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	reqBody := `{"name":"Technology","slug":"tech"}`
	request := createAuthenticatedRequest(reqBody)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 409 {
		t.Errorf("expected status 409, got %d", resp.StatusCode)
	}

	var errResp domain.ErrorResponse
	if err := json.Unmarshal([]byte(resp.Body), &errResp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if errResp.Message != "category with this slug already exists" {
		t.Errorf("expected error message about slug conflict, got %q", errResp.Message)
	}
}

// TestHandler_MissingTableName tests 500 response when table name is not configured
func TestHandler_MissingTableName(t *testing.T) {
	t.Setenv("CATEGORIES_TABLE_NAME", "")
	t.Setenv("AWS_REGION", "ap-northeast-1")

	reqBody := `{"name":"Test"}`
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

	reqBody := `{"name":"Test"}`
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

// TestHandler_QueryError tests 500 response when slug query fails
func TestHandler_QueryError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			return nil, errors.New("DynamoDB query error")
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	reqBody := `{"name":"Test"}`
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

	if errResp.Message != "failed to check slug uniqueness" {
		t.Errorf("expected error message about slug check, got %q", errResp.Message)
	}
}

// TestHandler_ScanError tests 500 response when sortOrder scan fails
func TestHandler_ScanError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			return &dynamodb.QueryOutput{Items: []map[string]types.AttributeValue{}, Count: 0}, nil
		},
		ScanFunc: func(ctx context.Context, params *dynamodb.ScanInput, optFns ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
			return nil, errors.New("DynamoDB scan error")
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	reqBody := `{"name":"Test"}`
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

	if errResp.Message != "failed to determine sort order" {
		t.Errorf("expected error message about sort order, got %q", errResp.Message)
	}
}

// TestHandler_PutItemError tests 500 response when save fails
func TestHandler_PutItemError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	testUUID := "test-uuid-err"
	testTime := "2024-01-15T10:00:00Z"

	uuidGenerator = func() string { return testUUID }
	timeNow = func() string { return testTime }

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			return &dynamodb.QueryOutput{Items: []map[string]types.AttributeValue{}, Count: 0}, nil
		},
		ScanFunc: func(ctx context.Context, params *dynamodb.ScanInput, optFns ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
			return &dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{}, Count: 0}, nil
		},
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			return nil, errors.New("DynamoDB put error")
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	reqBody := `{"name":"Test"}`
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

	if errResp.Message != "failed to create category" {
		t.Errorf("expected error message %q, got %q", "failed to create category", errResp.Message)
	}
}

// TestHandler_CORSHeaders tests that CORS headers are present in the response
func TestHandler_CORSHeaders(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	testUUID := "test-uuid-cors"
	testTime := "2024-01-15T10:00:00Z"

	uuidGenerator = func() string { return testUUID }
	timeNow = func() string { return testTime }

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			return &dynamodb.QueryOutput{Items: []map[string]types.AttributeValue{}, Count: 0}, nil
		},
		ScanFunc: func(ctx context.Context, params *dynamodb.ScanInput, optFns ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
			return &dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{}, Count: 0}, nil
		},
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			return &dynamodb.PutItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	reqBody := `{"name":"Test"}`
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

// TestHandler_CategoryWithDescription tests category creation with description
func TestHandler_CategoryWithDescription(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	testUUID := "test-uuid-desc"
	testTime := "2024-01-15T10:00:00Z"

	uuidGenerator = func() string { return testUUID }
	timeNow = func() string { return testTime }

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			return &dynamodb.QueryOutput{Items: []map[string]types.AttributeValue{}, Count: 0}, nil
		},
		ScanFunc: func(ctx context.Context, params *dynamodb.ScanInput, optFns ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
			return &dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{}, Count: 0}, nil
		},
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			return &dynamodb.PutItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	reqBody := `{"name":"Tech","description":"Technology related posts"}`
	request := createAuthenticatedRequest(reqBody)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 201 {
		t.Errorf("expected status 201, got %d", resp.StatusCode)
	}

	var category domain.Category
	if err := json.Unmarshal([]byte(resp.Body), &category); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if category.Description == nil || *category.Description != "Technology related posts" {
		t.Errorf("expected description %q, got %v", "Technology related posts", category.Description)
	}
}

// TestHandler_UppercaseSlug tests that uppercase slug triggers validation error
func TestHandler_UppercaseSlug(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	reqBody := `{"name":"Test","slug":"UPPERCASE"}`
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

	if errResp.Message != "slug must contain only lowercase alphanumeric characters and hyphens" {
		t.Errorf("expected error message about slug, got %q", errResp.Message)
	}
}

// TestHandler_Timestamps tests that createdAt and updatedAt are set correctly
// Requirement 3.6: Set createdAt and updatedAt to current ISO 8601 timestamp
func TestHandler_Timestamps(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	testUUID := "test-uuid-time"
	testTime := "2024-01-15T10:30:00Z"

	uuidGenerator = func() string { return testUUID }
	timeNow = func() string { return testTime }

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			return &dynamodb.QueryOutput{Items: []map[string]types.AttributeValue{}, Count: 0}, nil
		},
		ScanFunc: func(ctx context.Context, params *dynamodb.ScanInput, optFns ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
			return &dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{}, Count: 0}, nil
		},
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			return &dynamodb.PutItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	reqBody := `{"name":"Test Category"}`
	request := createAuthenticatedRequest(reqBody)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 201 {
		t.Errorf("expected status 201, got %d", resp.StatusCode)
	}

	var category domain.Category
	if err := json.Unmarshal([]byte(resp.Body), &category); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	// Verify timestamps are set correctly
	if category.CreatedAt != testTime {
		t.Errorf("expected createdAt %q, got %q", testTime, category.CreatedAt)
	}
	if category.UpdatedAt != testTime {
		t.Errorf("expected updatedAt %q, got %q", testTime, category.UpdatedAt)
	}
}

// TestHandler_SlugIndexQueryParams tests that the correct index is used for slug lookup
func TestHandler_SlugIndexQueryParams(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	testUUID := "test-uuid-idx"
	testTime := "2024-01-15T10:00:00Z"

	uuidGenerator = func() string { return testUUID }
	timeNow = func() string { return testTime }

	var capturedQueryInput *dynamodb.QueryInput

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			capturedQueryInput = params
			return &dynamodb.QueryOutput{Items: []map[string]types.AttributeValue{}, Count: 0}, nil
		},
		ScanFunc: func(ctx context.Context, params *dynamodb.ScanInput, optFns ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
			return &dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{}, Count: 0}, nil
		},
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			return &dynamodb.PutItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	reqBody := `{"name":"Test","slug":"my-slug"}`
	request := createAuthenticatedRequest(reqBody)

	_, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	// Verify correct index is used
	if capturedQueryInput == nil {
		t.Fatal("expected query to be executed")
	}

	if capturedQueryInput.IndexName == nil || *capturedQueryInput.IndexName != testSlugIndex {
		t.Errorf("expected index name %q, got %v", testSlugIndex, capturedQueryInput.IndexName)
	}

	// Verify table name
	if capturedQueryInput.TableName == nil || *capturedQueryInput.TableName != testTableName {
		t.Errorf("expected table name %q, got %v", testTableName, capturedQueryInput.TableName)
	}

	// Verify key condition
	if capturedQueryInput.KeyConditionExpression == nil || *capturedQueryInput.KeyConditionExpression != "slug = :slug" {
		t.Errorf("expected key condition %q, got %v", "slug = :slug", capturedQueryInput.KeyConditionExpression)
	}

	// Verify slug value in expression attribute values
	if capturedQueryInput.ExpressionAttributeValues == nil {
		t.Fatal("expected expression attribute values")
	}
	slugVal, ok := capturedQueryInput.ExpressionAttributeValues[":slug"]
	if !ok {
		t.Fatal("expected :slug in expression attribute values")
	}
	slugStr, ok := slugVal.(*types.AttributeValueMemberS)
	if !ok || slugStr.Value != "my-slug" {
		t.Errorf("expected slug value %q, got %v", "my-slug", slugVal)
	}
}

// TestHandler_FirstCategorySortOrder tests that first category gets sortOrder 1
func TestHandler_FirstCategorySortOrder(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	testUUID := "test-uuid-first"
	testTime := "2024-01-15T10:00:00Z"

	uuidGenerator = func() string { return testUUID }
	timeNow = func() string { return testTime }

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			return &dynamodb.QueryOutput{Items: []map[string]types.AttributeValue{}, Count: 0}, nil
		},
		ScanFunc: func(ctx context.Context, params *dynamodb.ScanInput, optFns ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
			// Return empty - no existing categories
			return &dynamodb.ScanOutput{Items: []map[string]types.AttributeValue{}, Count: 0}, nil
		},
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			return &dynamodb.PutItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	reqBody := `{"name":"First Category"}`
	request := createAuthenticatedRequest(reqBody)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 201 {
		t.Errorf("expected status 201, got %d. Body: %s", resp.StatusCode, resp.Body)
	}

	var category domain.Category
	if err := json.Unmarshal([]byte(resp.Body), &category); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	// First category should get sortOrder 1
	if category.SortOrder != 1 {
		t.Errorf("expected sortOrder 1 for first category, got %d", category.SortOrder)
	}
}

// Ensure unused import warning is silenced
var _ = aws.String
