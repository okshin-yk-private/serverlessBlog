// Package main provides tests for the UpdateCategory Lambda function.
//
// Requirement 4: Category Update API
// - 4.1: PUT /admin/categories/{id} with valid data updates category and returns 200
// - 4.2: Require Cognito authorization
// - 4.3: Return 404 if category ID does not exist
// - 4.4: Return 409 Conflict if updating to a slug that already exists on a different category
// - 4.5: Update updatedAt timestamp upon successful update
// - 4.6: Allow partial updates (only fields provided in request body shall be updated)
// - 4.7: When slug is changed, automatically update the category field of all BlogPosts referencing the old slug
//
// Requirement 9: Error Handling
// - 9.1: JSON error responses with message field
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
	testCategoriesTable = "test-categories-table"
	testPostsTable      = "test-posts-table"
	testSlugIndex       = "SlugIndex"
	testCategoryIndex   = "CategoryIndex"
	testAuthorID        = "test-user-123"
	testCategoryID      = "cat-uuid-123"
)

// MockDynamoDBClient is a mock implementation of DynamoDBClientInterface
type MockDynamoDBClient struct {
	GetItemFunc       func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error)
	QueryFunc         func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error)
	PutItemFunc       func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error)
	TransactWriteFunc func(ctx context.Context, params *dynamodb.TransactWriteItemsInput, optFns ...func(*dynamodb.Options)) (*dynamodb.TransactWriteItemsOutput, error)
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

func (m *MockDynamoDBClient) PutItem(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
	if m.PutItemFunc != nil {
		return m.PutItemFunc(ctx, params, optFns...)
	}
	return nil, errors.New("PutItemFunc not set")
}

func (m *MockDynamoDBClient) TransactWriteItems(ctx context.Context, params *dynamodb.TransactWriteItemsInput, optFns ...func(*dynamodb.Options)) (*dynamodb.TransactWriteItemsOutput, error) {
	if m.TransactWriteFunc != nil {
		return m.TransactWriteFunc(ctx, params, optFns...)
	}
	return nil, errors.New("TransactWriteFunc not set")
}

func setupTest(t *testing.T) func() {
	t.Helper()
	t.Setenv("CATEGORIES_TABLE_NAME", testCategoriesTable)
	t.Setenv("POSTS_TABLE_NAME", testPostsTable)
	t.Setenv("SLUG_INDEX_NAME", testSlugIndex)
	t.Setenv("CATEGORY_INDEX_NAME", testCategoryIndex)
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

func createAuthenticatedRequest(categoryID, body string) events.APIGatewayProxyRequest {
	return events.APIGatewayProxyRequest{
		Body: body,
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

func createUnauthenticatedRequest(categoryID, body string) events.APIGatewayProxyRequest {
	return events.APIGatewayProxyRequest{
		Body: body,
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

// TestHandler_SuccessfulUpdate tests successful category update
// Requirement 4.1: PUT /admin/categories/{id} with valid data updates category and returns 200
func TestHandler_SuccessfulUpdate(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	testTime := "2024-01-15T10:00:00Z"
	timeNow = func() string { return testTime }

	existingCat := createExistingCategory()
	existingAV, _ := attributevalue.MarshalMap(existingCat)

	var savedItem map[string]types.AttributeValue

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: existingAV}, nil
		},
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			savedItem = params.Item
			return &dynamodb.PutItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	reqBody := `{"name":"Updated Technology","description":"Updated description"}`
	request := createAuthenticatedRequest(testCategoryID, reqBody)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d. Body: %s", resp.StatusCode, resp.Body)
	}

	var category domain.Category
	if err := json.Unmarshal([]byte(resp.Body), &category); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	// Verify updated fields
	if category.Name != "Updated Technology" {
		t.Errorf("expected Name %q, got %q", "Updated Technology", category.Name)
	}
	if category.Description == nil || *category.Description != "Updated description" {
		t.Errorf("expected Description %q, got %v", "Updated description", category.Description)
	}
	// Slug should remain unchanged
	if category.Slug != "tech" {
		t.Errorf("expected Slug %q (unchanged), got %q", "tech", category.Slug)
	}

	// Verify item was saved
	if savedItem == nil {
		t.Fatal("expected item to be saved")
	}
}

// TestHandler_PartialUpdate tests partial update (only provided fields updated)
// Requirement 4.6: Allow partial updates
func TestHandler_PartialUpdate(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	testTime := "2024-01-15T10:00:00Z"
	timeNow = func() string { return testTime }

	existingCat := createExistingCategory()
	existingAV, _ := attributevalue.MarshalMap(existingCat)

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: existingAV}, nil
		},
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			return &dynamodb.PutItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	// Only update sortOrder
	reqBody := `{"sortOrder":5}`
	request := createAuthenticatedRequest(testCategoryID, reqBody)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d. Body: %s", resp.StatusCode, resp.Body)
	}

	var category domain.Category
	if err := json.Unmarshal([]byte(resp.Body), &category); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	// Verify only sortOrder was updated
	if category.SortOrder != 5 {
		t.Errorf("expected SortOrder 5, got %d", category.SortOrder)
	}
	// Other fields should remain unchanged
	if category.Name != "テクノロジー" {
		t.Errorf("expected Name %q (unchanged), got %q", "テクノロジー", category.Name)
	}
	if category.Slug != "tech" {
		t.Errorf("expected Slug %q (unchanged), got %q", "tech", category.Slug)
	}
}

// TestHandler_UpdatedAtTimestamp tests that updatedAt is updated
// Requirement 4.5: Update updatedAt timestamp upon successful update
func TestHandler_UpdatedAtTimestamp(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	testTime := "2024-01-15T15:30:00Z"
	timeNow = func() string { return testTime }

	existingCat := createExistingCategory()
	existingAV, _ := attributevalue.MarshalMap(existingCat)

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: existingAV}, nil
		},
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			return &dynamodb.PutItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	reqBody := `{"name":"Updated Name"}`
	request := createAuthenticatedRequest(testCategoryID, reqBody)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var category domain.Category
	if err := json.Unmarshal([]byte(resp.Body), &category); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	// Verify updatedAt is set to current time
	if category.UpdatedAt != testTime {
		t.Errorf("expected UpdatedAt %q, got %q", testTime, category.UpdatedAt)
	}
	// createdAt should remain unchanged
	if category.CreatedAt != "2024-01-01T10:00:00Z" {
		t.Errorf("expected CreatedAt %q (unchanged), got %q", "2024-01-01T10:00:00Z", category.CreatedAt)
	}
}

// TestHandler_Unauthorized tests 401 response for unauthenticated requests
// Requirement 4.2: Require Cognito authorization
func TestHandler_Unauthorized(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	reqBody := `{"name":"Updated Name"}`
	request := createUnauthenticatedRequest(testCategoryID, reqBody)

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
// Requirement 4.3: Return 404 if category ID does not exist
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

	reqBody := `{"name":"Updated Name"}`
	request := createAuthenticatedRequest("non-existent-id", reqBody)

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

// TestHandler_SlugConflict tests 409 response when updating to existing slug
// Requirement 4.4: Return 409 Conflict if updating to a slug that already exists on a different category
func TestHandler_SlugConflict(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	existingCat := createExistingCategory()
	existingAV, _ := attributevalue.MarshalMap(existingCat)

	// Another category with slug "other"
	otherCat := domain.Category{ID: "other-cat-id", Slug: "other"}
	otherAV, _ := attributevalue.MarshalMap(otherCat)

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: existingAV}, nil
		},
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			// Slug "other" already exists on a different category
			return &dynamodb.QueryOutput{
				Items: []map[string]types.AttributeValue{otherAV},
				Count: 1,
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	// Try to update slug to "other" which already exists
	reqBody := `{"slug":"other"}`
	request := createAuthenticatedRequest(testCategoryID, reqBody)

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

	if errResp.Message != "category with this slug already exists" {
		t.Errorf("expected error message about slug conflict, got %q", errResp.Message)
	}
}

// TestHandler_SlugUpdateWithPosts tests slug update with associated posts
// Requirement 4.7: When slug is changed, update category field of all BlogPosts referencing old slug
func TestHandler_SlugUpdateWithPosts(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	testTime := "2024-01-15T10:00:00Z"
	timeNow = func() string { return testTime }

	existingCat := createExistingCategory()
	existingAV, _ := attributevalue.MarshalMap(existingCat)

	// Create test posts that reference the category
	post1 := domain.BlogPost{ID: "post-1", Category: "tech"}
	post2 := domain.BlogPost{ID: "post-2", Category: "tech"}
	post1AV, _ := attributevalue.MarshalMap(post1)
	post2AV, _ := attributevalue.MarshalMap(post2)

	var transactItems []types.TransactWriteItem

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: existingAV}, nil
		},
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			// Check which query this is - slug uniqueness or posts lookup
			if params.IndexName != nil && *params.IndexName == testSlugIndex {
				// Slug uniqueness check - new slug doesn't exist
				return &dynamodb.QueryOutput{Items: []map[string]types.AttributeValue{}, Count: 0}, nil
			}
			if params.IndexName != nil && *params.IndexName == testCategoryIndex {
				// Posts with old category slug
				return &dynamodb.QueryOutput{
					Items: []map[string]types.AttributeValue{post1AV, post2AV},
					Count: 2,
				}, nil
			}
			return &dynamodb.QueryOutput{Items: []map[string]types.AttributeValue{}, Count: 0}, nil
		},
		TransactWriteFunc: func(ctx context.Context, params *dynamodb.TransactWriteItemsInput, optFns ...func(*dynamodb.Options)) (*dynamodb.TransactWriteItemsOutput, error) {
			transactItems = params.TransactItems
			return &dynamodb.TransactWriteItemsOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	// Update slug from "tech" to "technology"
	reqBody := `{"slug":"technology"}`
	request := createAuthenticatedRequest(testCategoryID, reqBody)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d. Body: %s", resp.StatusCode, resp.Body)
	}

	var category domain.Category
	if err := json.Unmarshal([]byte(resp.Body), &category); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	// Verify slug was updated
	if category.Slug != "technology" {
		t.Errorf("expected Slug %q, got %q", "technology", category.Slug)
	}

	// Verify transaction was called with category + posts updates
	// We expect: 1 category update + 2 post updates = 3 items
	if len(transactItems) != 3 {
		t.Errorf("expected 3 transaction items, got %d", len(transactItems))
	}
}

// TestHandler_SlugUpdateSameSlug tests that same slug doesn't trigger posts update
func TestHandler_SlugUpdateSameSlug(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	testTime := "2024-01-15T10:00:00Z"
	timeNow = func() string { return testTime }

	existingCat := createExistingCategory() // has slug "tech"
	existingAV, _ := attributevalue.MarshalMap(existingCat)

	var transactCalled bool

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: existingAV}, nil
		},
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			return &dynamodb.PutItemOutput{}, nil
		},
		TransactWriteFunc: func(ctx context.Context, params *dynamodb.TransactWriteItemsInput, optFns ...func(*dynamodb.Options)) (*dynamodb.TransactWriteItemsOutput, error) {
			transactCalled = true
			return &dynamodb.TransactWriteItemsOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	// Update with same slug - should not trigger posts update
	reqBody := `{"slug":"tech"}`
	request := createAuthenticatedRequest(testCategoryID, reqBody)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	// TransactWriteItems should NOT be called for same slug
	if transactCalled {
		t.Error("TransactWriteItems should not be called when slug is unchanged")
	}
}

// TestHandler_NameTooLong tests 400 response for name exceeding 100 characters
// Requirement 9.3: Return 400 if name exceeds 100 characters
func TestHandler_NameTooLong(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	existingCat := createExistingCategory()
	existingAV, _ := attributevalue.MarshalMap(existingCat)

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: existingAV}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	// Create a name with 101 characters
	longName := ""
	for i := 0; i < 101; i++ {
		longName += "a"
	}

	reqBody := `{"name":"` + longName + `"}`
	request := createAuthenticatedRequest(testCategoryID, reqBody)

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

// TestHandler_EmptyName tests 400 response for empty name
func TestHandler_EmptyName(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	existingCat := createExistingCategory()
	existingAV, _ := attributevalue.MarshalMap(existingCat)

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: existingAV}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	reqBody := `{"name":""}`
	request := createAuthenticatedRequest(testCategoryID, reqBody)

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

	if errResp.Message != "name cannot be empty" {
		t.Errorf("expected error message %q, got %q", "name cannot be empty", errResp.Message)
	}
}

// TestHandler_InvalidSlugCharacters tests 400 response for invalid slug characters
// Requirement 9.4: Return 400 if slug contains invalid characters
func TestHandler_InvalidSlugCharacters(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	existingCat := createExistingCategory()
	existingAV, _ := attributevalue.MarshalMap(existingCat)

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: existingAV}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	reqBody := `{"slug":"invalid_slug!"}`
	request := createAuthenticatedRequest(testCategoryID, reqBody)

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

// TestHandler_UppercaseSlug tests that uppercase slug triggers validation error
func TestHandler_UppercaseSlug(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	existingCat := createExistingCategory()
	existingAV, _ := attributevalue.MarshalMap(existingCat)

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: existingAV}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	reqBody := `{"slug":"UPPERCASE"}`
	request := createAuthenticatedRequest(testCategoryID, reqBody)

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
func TestHandler_InvalidJSON(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	reqBody := `{invalid json}`
	request := createAuthenticatedRequest(testCategoryID, reqBody)

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

// TestHandler_MissingCategoryID tests 400 response for missing category ID
func TestHandler_MissingCategoryID(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	request := events.APIGatewayProxyRequest{
		Body:           `{"name":"Test"}`,
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

// TestHandler_MissingTableName tests 500 response when table name is not configured
func TestHandler_MissingTableName(t *testing.T) {
	t.Setenv("CATEGORIES_TABLE_NAME", "")
	t.Setenv("AWS_REGION", "ap-northeast-1")

	reqBody := `{"name":"Test"}`
	request := createAuthenticatedRequest(testCategoryID, reqBody)

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
	request := createAuthenticatedRequest(testCategoryID, reqBody)

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

	reqBody := `{"name":"Test"}`
	request := createAuthenticatedRequest(testCategoryID, reqBody)

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

// TestHandler_PutItemError tests 500 response when save fails
func TestHandler_PutItemError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	testTime := "2024-01-15T10:00:00Z"
	timeNow = func() string { return testTime }

	existingCat := createExistingCategory()
	existingAV, _ := attributevalue.MarshalMap(existingCat)

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: existingAV}, nil
		},
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			return nil, errors.New("DynamoDB put error")
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	reqBody := `{"name":"Test"}`
	request := createAuthenticatedRequest(testCategoryID, reqBody)

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

	if errResp.Message != "failed to update category" {
		t.Errorf("expected error message %q, got %q", "failed to update category", errResp.Message)
	}
}

// TestHandler_CORSHeaders tests that CORS headers are present in the response
func TestHandler_CORSHeaders(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	testTime := "2024-01-15T10:00:00Z"
	timeNow = func() string { return testTime }

	existingCat := createExistingCategory()
	existingAV, _ := attributevalue.MarshalMap(existingCat)

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: existingAV}, nil
		},
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			return &dynamodb.PutItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	reqBody := `{"name":"Test"}`
	request := createAuthenticatedRequest(testCategoryID, reqBody)

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

// TestHandler_PreserveImmutableFields tests that ID, createdAt are preserved
func TestHandler_PreserveImmutableFields(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	testTime := "2024-01-15T10:00:00Z"
	timeNow = func() string { return testTime }

	existingCat := createExistingCategory()
	existingAV, _ := attributevalue.MarshalMap(existingCat)

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: existingAV}, nil
		},
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			return &dynamodb.PutItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	reqBody := `{"name":"Updated Name"}`
	request := createAuthenticatedRequest(testCategoryID, reqBody)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var category domain.Category
	if err := json.Unmarshal([]byte(resp.Body), &category); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	// Verify immutable fields are preserved
	if category.ID != testCategoryID {
		t.Errorf("expected ID %q (unchanged), got %q", testCategoryID, category.ID)
	}
	if category.CreatedAt != "2024-01-01T10:00:00Z" {
		t.Errorf("expected CreatedAt %q (unchanged), got %q", "2024-01-01T10:00:00Z", category.CreatedAt)
	}
}

// TestHandler_SlugQueryError tests 500 response when slug query fails
func TestHandler_SlugQueryError(t *testing.T) {
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

	// Update slug to trigger slug uniqueness check
	reqBody := `{"slug":"new-slug"}`
	request := createAuthenticatedRequest(testCategoryID, reqBody)

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

// TestHandler_TransactWriteError tests 500 response when transaction fails
func TestHandler_TransactWriteError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	testTime := "2024-01-15T10:00:00Z"
	timeNow = func() string { return testTime }

	existingCat := createExistingCategory()
	existingAV, _ := attributevalue.MarshalMap(existingCat)

	// Posts that reference this category
	post1 := domain.BlogPost{ID: "post-1", Category: "tech"}
	post1AV, _ := attributevalue.MarshalMap(post1)

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: existingAV}, nil
		},
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			if params.IndexName != nil && *params.IndexName == testSlugIndex {
				return &dynamodb.QueryOutput{Items: []map[string]types.AttributeValue{}, Count: 0}, nil
			}
			if params.IndexName != nil && *params.IndexName == testCategoryIndex {
				return &dynamodb.QueryOutput{
					Items: []map[string]types.AttributeValue{post1AV},
					Count: 1,
				}, nil
			}
			return &dynamodb.QueryOutput{Items: []map[string]types.AttributeValue{}, Count: 0}, nil
		},
		TransactWriteFunc: func(ctx context.Context, params *dynamodb.TransactWriteItemsInput, optFns ...func(*dynamodb.Options)) (*dynamodb.TransactWriteItemsOutput, error) {
			return nil, errors.New("DynamoDB transaction error")
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	// Update slug to trigger posts update
	reqBody := `{"slug":"new-slug"}`
	request := createAuthenticatedRequest(testCategoryID, reqBody)

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

	if errResp.Message != "failed to update category and posts" {
		t.Errorf("expected error message about transaction, got %q", errResp.Message)
	}
}

// Ensure unused import warning is silenced
var _ = aws.String
