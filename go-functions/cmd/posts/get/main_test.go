// Package main provides the GetPost Lambda function for retrieving posts (authenticated).
//
// Requirement 3.2: 記事取得 (GET /posts/:id - 認証必須)
//   - 認証付きの有効な記事取得リクエストと有効な記事IDを受信したとき、GetPost LambdaはDynamoDBから記事を返す
//   - 記事IDがDynamoDBに存在しない場合、GetPost LambdaはHTTP 404を返す
//   - リクエストに有効な認証がない場合、GetPost LambdaはHTTP 401を返す
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
	testPublishedAt = "2024-01-15T12:00:00Z"
	testCreatedAt   = "2024-01-15T10:00:00Z"
	testUpdatedAt   = "2024-01-15T11:00:00Z"
	testPostID      = "test-post-id"
	testTableName   = "test-table"
	testUserID      = "user-123"
)

// MockDynamoDBClient is a mock implementation of DynamoDBClientInterface
type MockDynamoDBClient struct {
	GetItemFunc func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error)
}

func (m *MockDynamoDBClient) GetItem(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
	if m.GetItemFunc != nil {
		return m.GetItemFunc(ctx, params, optFns...)
	}
	return nil, errors.New("GetItemFunc not set")
}

func setupTest(t *testing.T) func() {
	t.Helper()
	t.Setenv("TABLE_NAME", testTableName)
	t.Setenv("AWS_REGION", "ap-northeast-1")

	// Store original getter
	originalGetter := dynamoClientGetter

	// Restore after test
	return func() {
		dynamoClientGetter = originalGetter
	}
}

// createAuthenticatedRequest creates a request with valid authentication
func createAuthenticatedRequest(postID string) events.APIGatewayProxyRequest {
	return events.APIGatewayProxyRequest{
		PathParameters: map[string]string{
			"id": postID,
		},
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{
					"sub": testUserID,
				},
			},
		},
	}
}

// createUnauthenticatedRequest creates a request without authentication
func createUnauthenticatedRequest(postID string) events.APIGatewayProxyRequest {
	return events.APIGatewayProxyRequest{
		PathParameters: map[string]string{
			"id": postID,
		},
	}
}

// TestHandler_SuccessfulGetPublishedPost tests successful retrieval of a published post
// Requirements: 3.2 - 認証付きの有効な記事取得リクエストと有効な記事IDを受信したとき
func TestHandler_SuccessfulGetPublishedPost(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	publishedAt := testPublishedAt
	expectedPost := domain.BlogPost{
		ID:              testPostID,
		Title:           "Test Post",
		ContentMarkdown: "# Hello World",
		ContentHTML:     "<h1>Hello World</h1>",
		Category:        "technology",
		Tags:            []string{"go", "aws"},
		PublishStatus:   domain.PublishStatusPublished,
		AuthorID:        "author-123",
		CreatedAt:       testCreatedAt,
		UpdatedAt:       testUpdatedAt,
		PublishedAt:     &publishedAt,
		ImageURLs:       []string{},
	}

	// Convert post to DynamoDB attribute value
	av, err := attributevalue.MarshalMap(expectedPost)
	if err != nil {
		t.Fatalf("failed to marshal post: %v", err)
	}

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			// Verify table name
			if *params.TableName != testTableName {
				t.Errorf("expected table name %s, got %s", testTableName, *params.TableName)
			}

			// Verify key - type assertion is safe in test context
			keyAttr, ok := params.Key["id"].(*types.AttributeValueMemberS)
			if !ok || keyAttr.Value != testPostID {
				t.Errorf("expected post ID %s", testPostID)
			}

			return &dynamodb.GetItemOutput{
				Item: av,
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := createAuthenticatedRequest(testPostID)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var post domain.BlogPost
	if err := json.Unmarshal([]byte(resp.Body), &post); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if post.ID != expectedPost.ID {
		t.Errorf("expected post ID %q, got %q", expectedPost.ID, post.ID)
	}

	if post.Title != expectedPost.Title {
		t.Errorf("expected title %q, got %q", expectedPost.Title, post.Title)
	}

	if post.PublishStatus != domain.PublishStatusPublished {
		t.Errorf("expected publishStatus %q, got %q", domain.PublishStatusPublished, post.PublishStatus)
	}
}

// TestHandler_SuccessfulGetDraftPost tests successful retrieval of a draft post (authenticated users can access drafts)
// Requirements: 3.2 - 認証付きの場合は下書きも取得可能
func TestHandler_SuccessfulGetDraftPost(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	draftPost := domain.BlogPost{
		ID:              "draft-post-id",
		Title:           "Draft Post",
		ContentMarkdown: "# Draft",
		ContentHTML:     "<h1>Draft</h1>",
		Category:        "technology",
		Tags:            []string{},
		PublishStatus:   domain.PublishStatusDraft,
		AuthorID:        "author-123",
		CreatedAt:       testCreatedAt,
		UpdatedAt:       testUpdatedAt,
		PublishedAt:     nil,
		ImageURLs:       []string{},
	}

	av, err := attributevalue.MarshalMap(draftPost)
	if err != nil {
		t.Fatalf("failed to marshal post: %v", err)
	}

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{
				Item: av,
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := createAuthenticatedRequest("draft-post-id")

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	// Authenticated users CAN access draft posts
	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var post domain.BlogPost
	if err := json.Unmarshal([]byte(resp.Body), &post); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if post.PublishStatus != domain.PublishStatusDraft {
		t.Errorf("expected publishStatus %q, got %q", domain.PublishStatusDraft, post.PublishStatus)
	}
}

// TestHandler_PostNotFound tests 404 response when post doesn't exist
// Requirements: 3.2 - 記事IDがDynamoDBに存在しない場合、GetPost LambdaはHTTP 404を返す
func TestHandler_PostNotFound(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			// Return empty item to simulate not found
			return &dynamodb.GetItemOutput{
				Item: nil,
			}, nil
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

	if errResp.Message != "post not found" {
		t.Errorf("expected error message %q, got %q", "post not found", errResp.Message)
	}
}

// TestHandler_UnauthenticatedRequestReturns401 tests 401 response when request is not authenticated
// Requirements: 3.2 - リクエストに有効な認証がない場合、GetPost LambdaはHTTP 401を返す
func TestHandler_UnauthenticatedRequestReturns401(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	request := createUnauthenticatedRequest(testPostID)

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

// TestHandler_NilAuthorizerReturns401 tests 401 when authorizer is nil
func TestHandler_NilAuthorizerReturns401(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{
			"id": testPostID,
		},
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: nil,
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

// TestHandler_EmptyClaimsReturns401 tests 401 when claims are empty
func TestHandler_EmptyClaimsReturns401(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{
			"id": testPostID,
		},
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{},
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

// TestHandler_MissingSubClaimReturns401 tests 401 when sub claim is missing
func TestHandler_MissingSubClaimReturns401(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{
			"id": testPostID,
		},
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{
					"email": "test@example.com",
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

// TestHandler_MissingPostID tests 400 response when post ID is missing
func TestHandler_MissingPostID(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{
			// Missing "id" parameter
		},
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{
					"sub": testUserID,
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

	if errResp.Message != "post ID is required" {
		t.Errorf("expected error message %q, got %q", "post ID is required", errResp.Message)
	}
}

// TestHandler_EmptyPostID tests 400 response when post ID is empty
func TestHandler_EmptyPostID(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{
			"id": "",
		},
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{
					"sub": testUserID,
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

	if errResp.Message != "post ID is required" {
		t.Errorf("expected error message %q, got %q", "post ID is required", errResp.Message)
	}
}

// TestHandler_MissingTableName tests 500 response when TABLE_NAME is not set
func TestHandler_MissingTableName(t *testing.T) {
	t.Setenv("TABLE_NAME", "")
	t.Setenv("AWS_REGION", "ap-northeast-1")

	request := createAuthenticatedRequest(testPostID)

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

	request := createAuthenticatedRequest(testPostID)

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

// TestHandler_DynamoDBGetItemError tests 500 response when DynamoDB GetItem fails
func TestHandler_DynamoDBGetItemError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return nil, errors.New("DynamoDB error")
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := createAuthenticatedRequest(testPostID)

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

	if errResp.Message != "failed to retrieve post" {
		t.Errorf("expected error message %q, got %q", "failed to retrieve post", errResp.Message)
	}
}

// TestHandler_CORSHeaders tests that CORS headers are present in the response
func TestHandler_CORSHeaders(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	publishedAt := testPublishedAt
	post := domain.BlogPost{
		ID:              testPostID,
		Title:           "Test Post",
		ContentMarkdown: "# Hello World",
		ContentHTML:     "<h1>Hello World</h1>",
		Category:        "technology",
		Tags:            []string{},
		PublishStatus:   domain.PublishStatusPublished,
		AuthorID:        "author-123",
		CreatedAt:       testCreatedAt,
		UpdatedAt:       testUpdatedAt,
		PublishedAt:     &publishedAt,
		ImageURLs:       []string{},
	}

	av, err := attributevalue.MarshalMap(post)
	if err != nil {
		t.Fatalf("failed to marshal post: %v", err)
	}

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{
				Item: av,
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := createAuthenticatedRequest(testPostID)

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

// TestHandler_ResponseStructure tests that the response has the correct structure
func TestHandler_ResponseStructure(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	publishedAt := testPublishedAt
	post := domain.BlogPost{
		ID:              testPostID,
		Title:           "Test Post",
		ContentMarkdown: "# Hello World",
		ContentHTML:     "<h1>Hello World</h1>",
		Category:        "technology",
		Tags:            []string{"go", "aws"},
		PublishStatus:   domain.PublishStatusPublished,
		AuthorID:        "author-123",
		CreatedAt:       testCreatedAt,
		UpdatedAt:       testUpdatedAt,
		PublishedAt:     &publishedAt,
		ImageURLs:       []string{"https://example.com/image.jpg"},
	}

	av, err := attributevalue.MarshalMap(post)
	if err != nil {
		t.Fatalf("failed to marshal post: %v", err)
	}

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{
				Item: av,
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := createAuthenticatedRequest(testPostID)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	// Verify response structure
	var responseMap map[string]interface{}
	if err := json.Unmarshal([]byte(resp.Body), &responseMap); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	// Check all expected fields are present
	expectedFields := []string{"id", "title", "contentMarkdown", "contentHtml", "category", "tags", "publishStatus", "authorId", "createdAt", "updatedAt", "publishedAt", "imageUrls"}
	for _, field := range expectedFields {
		if _, ok := responseMap[field]; !ok {
			t.Errorf("expected field %q to be present in response", field)
		}
	}
}

// TestHandler_EmptyItemResponse tests handling of empty DynamoDB item response
func TestHandler_EmptyItemResponse(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			// Return empty map instead of nil
			return &dynamodb.GetItemOutput{
				Item: map[string]types.AttributeValue{},
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := createAuthenticatedRequest(testPostID)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 404 {
		t.Errorf("expected status 404, got %d", resp.StatusCode)
	}
}

// TestHandler_UnmarshalError tests 500 response when post data cannot be parsed
func TestHandler_UnmarshalError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			// Return invalid data that will fail to unmarshal
			return &dynamodb.GetItemOutput{
				Item: map[string]types.AttributeValue{
					"id": &types.AttributeValueMemberS{Value: "test-id"},
					// Add tags as string instead of list to cause unmarshal error
					"tags": &types.AttributeValueMemberS{Value: "invalid-tags"},
				},
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := createAuthenticatedRequest(testPostID)

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

	if errResp.Message != "failed to parse post data" {
		t.Errorf("expected error message %q, got %q", "failed to parse post data", errResp.Message)
	}
}

// TestHandler_TableDriven_SuccessScenarios tests successful post retrieval scenarios using table-driven tests
// Requirements: 7.1, 7.4 - Table-driven tests for comprehensive coverage
//
//nolint:funlen // Table-driven tests are inherently long
func TestHandler_TableDriven_SuccessScenarios(t *testing.T) {
	publishedAt := testPublishedAt

	tests := []struct {
		name           string
		postID         string
		post           domain.BlogPost
		expectedStatus int
		checkResponse  func(t *testing.T, resp events.APIGatewayProxyResponse)
	}{
		{
			name:   "published post with all fields",
			postID: "post-123",
			post: domain.BlogPost{
				ID:              "post-123",
				Title:           "Complete Post",
				ContentMarkdown: "# Complete\n\nThis is a complete post with all fields.",
				ContentHTML:     "<h1>Complete</h1><p>This is a complete post with all fields.</p>",
				Category:        "technology",
				Tags:            []string{"go", "aws", "serverless"},
				PublishStatus:   domain.PublishStatusPublished,
				AuthorID:        "author-456",
				CreatedAt:       testCreatedAt,
				UpdatedAt:       testUpdatedAt,
				PublishedAt:     &publishedAt,
				ImageURLs:       []string{"https://example.com/img1.jpg", "https://example.com/img2.jpg"},
			},
			expectedStatus: 200,
			checkResponse: func(t *testing.T, resp events.APIGatewayProxyResponse) {
				var post domain.BlogPost
				if err := json.Unmarshal([]byte(resp.Body), &post); err != nil {
					t.Fatalf("failed to unmarshal response: %v", err)
				}
				if post.ID != "post-123" {
					t.Errorf("expected post ID %q, got %q", "post-123", post.ID)
				}
				if len(post.Tags) != 3 {
					t.Errorf("expected 3 tags, got %d", len(post.Tags))
				}
				if len(post.ImageURLs) != 2 {
					t.Errorf("expected 2 image URLs, got %d", len(post.ImageURLs))
				}
			},
		},
		{
			name:   "draft post with minimal fields (authenticated users can access)",
			postID: "draft-minimal",
			post: domain.BlogPost{
				ID:              "draft-minimal",
				Title:           "Draft Minimal Post",
				ContentMarkdown: "Short draft content",
				ContentHTML:     "<p>Short draft content</p>",
				Category:        "general",
				Tags:            []string{},
				PublishStatus:   domain.PublishStatusDraft, // Draft is accessible for authenticated users
				AuthorID:        "author-789",
				CreatedAt:       testCreatedAt,
				UpdatedAt:       testUpdatedAt,
				PublishedAt:     nil,
				ImageURLs:       []string{},
			},
			expectedStatus: 200,
			checkResponse: func(t *testing.T, resp events.APIGatewayProxyResponse) {
				var post domain.BlogPost
				if err := json.Unmarshal([]byte(resp.Body), &post); err != nil {
					t.Fatalf("failed to unmarshal response: %v", err)
				}
				if post.ID != "draft-minimal" {
					t.Errorf("expected post ID %q, got %q", "draft-minimal", post.ID)
				}
				if post.PublishStatus != domain.PublishStatusDraft {
					t.Errorf("expected draft status, got %q", post.PublishStatus)
				}
			},
		},
		{
			name:   "post with special characters in title",
			postID: "post-special",
			post: domain.BlogPost{
				ID:              "post-special",
				Title:           "Post with 日本語 and émojis 🎉",
				ContentMarkdown: "# Special Characters\n\n日本語のコンテンツ",
				ContentHTML:     "<h1>Special Characters</h1><p>日本語のコンテンツ</p>",
				Category:        "international",
				Tags:            []string{"日本語", "unicode"},
				PublishStatus:   domain.PublishStatusPublished,
				AuthorID:        "author-intl",
				CreatedAt:       testCreatedAt,
				UpdatedAt:       testUpdatedAt,
				PublishedAt:     &publishedAt,
				ImageURLs:       []string{},
			},
			expectedStatus: 200,
			checkResponse: func(t *testing.T, resp events.APIGatewayProxyResponse) {
				var post domain.BlogPost
				if err := json.Unmarshal([]byte(resp.Body), &post); err != nil {
					t.Fatalf("failed to unmarshal response: %v", err)
				}
				if post.Title != "Post with 日本語 and émojis 🎉" {
					t.Errorf("expected title to include special characters")
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cleanup := setupTest(t)
			defer cleanup()

			av, err := attributevalue.MarshalMap(tt.post)
			if err != nil {
				t.Fatalf("failed to marshal post: %v", err)
			}

			mockClient := &MockDynamoDBClient{
				GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
					return &dynamodb.GetItemOutput{Item: av}, nil
				},
			}

			dynamoClientGetter = func() (DynamoDBClientInterface, error) {
				return mockClient, nil
			}

			request := createAuthenticatedRequest(tt.postID)

			resp, err := Handler(context.Background(), request)
			if err != nil {
				t.Fatalf("Handler returned unexpected error: %v", err)
			}

			if resp.StatusCode != tt.expectedStatus {
				t.Errorf("expected status %d, got %d", tt.expectedStatus, resp.StatusCode)
			}

			if tt.checkResponse != nil {
				tt.checkResponse(t, resp)
			}
		})
	}
}

// TestHandler_TableDriven_ErrorScenarios tests error scenarios using table-driven tests
// Requirements: 7.1, 7.4 - Table-driven tests for comprehensive coverage
//
//nolint:funlen // Table-driven tests are inherently long
func TestHandler_TableDriven_ErrorScenarios(t *testing.T) {
	tests := []struct {
		name           string
		postID         string
		setupMock      func() *MockDynamoDBClient
		authenticated  bool
		expectedStatus int
		expectedError  string
	}{
		{
			name:   "post not found - nil item",
			postID: "non-existent-id",
			setupMock: func() *MockDynamoDBClient {
				return &MockDynamoDBClient{
					GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
						return &dynamodb.GetItemOutput{Item: nil}, nil
					},
				}
			},
			authenticated:  true,
			expectedStatus: 404,
			expectedError:  "post not found",
		},
		{
			name:   "post not found - empty item",
			postID: "empty-item-id",
			setupMock: func() *MockDynamoDBClient {
				return &MockDynamoDBClient{
					GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
						return &dynamodb.GetItemOutput{Item: map[string]types.AttributeValue{}}, nil
					},
				}
			},
			authenticated:  true,
			expectedStatus: 404,
			expectedError:  "post not found",
		},
		{
			name:   "DynamoDB error",
			postID: "error-post-id",
			setupMock: func() *MockDynamoDBClient {
				return &MockDynamoDBClient{
					GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
						return nil, errors.New("DynamoDB service unavailable")
					},
				}
			},
			authenticated:  true,
			expectedStatus: 500,
			expectedError:  "failed to retrieve post",
		},
		{
			name:           "missing post ID in path",
			postID:         "",
			setupMock:      nil,
			authenticated:  true,
			expectedStatus: 400,
			expectedError:  "post ID is required",
		},
		{
			name:           "unauthenticated request",
			postID:         testPostID,
			setupMock:      nil,
			authenticated:  false,
			expectedStatus: 401,
			expectedError:  "unauthorized",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cleanup := setupTest(t)
			defer cleanup()

			if tt.setupMock != nil {
				mockClient := tt.setupMock()
				dynamoClientGetter = func() (DynamoDBClientInterface, error) {
					return mockClient, nil
				}
			}

			var request events.APIGatewayProxyRequest
			if tt.authenticated {
				request = createAuthenticatedRequest(tt.postID)
			} else {
				request = createUnauthenticatedRequest(tt.postID)
			}

			resp, err := Handler(context.Background(), request)
			if err != nil {
				t.Fatalf("Handler returned unexpected error: %v", err)
			}

			if resp.StatusCode != tt.expectedStatus {
				t.Errorf("expected status %d, got %d", tt.expectedStatus, resp.StatusCode)
			}

			var errResp domain.ErrorResponse
			if err := json.Unmarshal([]byte(resp.Body), &errResp); err != nil {
				t.Fatalf("failed to unmarshal response: %v", err)
			}

			if errResp.Message != tt.expectedError {
				t.Errorf("expected error message %q, got %q", tt.expectedError, errResp.Message)
			}
		})
	}
}

// TestHandler_TableDriven_AuthenticationScenarios tests authentication scenarios using table-driven tests
// Requirements: 3.2, 7.1, 7.4 - Authentication validation with table-driven tests
func TestHandler_TableDriven_AuthenticationScenarios(t *testing.T) {
	tests := []struct {
		name           string
		authorizer     map[string]interface{}
		expectedStatus int
		expectedError  string
	}{
		{
			name:           "nil authorizer",
			authorizer:     nil,
			expectedStatus: 401,
			expectedError:  "unauthorized",
		},
		{
			name:           "empty authorizer",
			authorizer:     map[string]interface{}{},
			expectedStatus: 401,
			expectedError:  "unauthorized",
		},
		{
			name: "nil claims",
			authorizer: map[string]interface{}{
				"claims": nil,
			},
			expectedStatus: 401,
			expectedError:  "unauthorized",
		},
		{
			name: "empty claims",
			authorizer: map[string]interface{}{
				"claims": map[string]interface{}{},
			},
			expectedStatus: 401,
			expectedError:  "unauthorized",
		},
		{
			name: "claims without sub",
			authorizer: map[string]interface{}{
				"claims": map[string]interface{}{
					"email": "test@example.com",
				},
			},
			expectedStatus: 401,
			expectedError:  "unauthorized",
		},
		{
			name: "empty sub claim",
			authorizer: map[string]interface{}{
				"claims": map[string]interface{}{
					"sub": "",
				},
			},
			expectedStatus: 401,
			expectedError:  "unauthorized",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cleanup := setupTest(t)
			defer cleanup()

			request := events.APIGatewayProxyRequest{
				PathParameters: map[string]string{
					"id": testPostID,
				},
				RequestContext: events.APIGatewayProxyRequestContext{
					Authorizer: tt.authorizer,
				},
			}

			resp, err := Handler(context.Background(), request)
			if err != nil {
				t.Fatalf("Handler returned unexpected error: %v", err)
			}

			if resp.StatusCode != tt.expectedStatus {
				t.Errorf("expected status %d, got %d", tt.expectedStatus, resp.StatusCode)
			}

			var errResp domain.ErrorResponse
			if err := json.Unmarshal([]byte(resp.Body), &errResp); err != nil {
				t.Fatalf("failed to unmarshal response: %v", err)
			}

			if errResp.Message != tt.expectedError {
				t.Errorf("expected error message %q, got %q", tt.expectedError, errResp.Message)
			}
		})
	}
}

// TestHandler_ClaimsNotMapReturns401 tests 401 when claims is not a map
func TestHandler_ClaimsNotMapReturns401(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{
			"id": testPostID,
		},
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": "not-a-map", // Claims is a string, not a map
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

// TestHandler_SubNotStringReturns401 tests 401 when sub is not a string
func TestHandler_SubNotStringReturns401(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{
			"id": testPostID,
		},
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{
					"sub": 12345, // Sub is a number, not a string
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

// TestHandler_TableDriven_ValidationScenarios tests input validation scenarios using table-driven tests
// Requirements: 7.1, 7.4 - Table-driven tests for comprehensive coverage
func TestHandler_TableDriven_ValidationScenarios(t *testing.T) {
	tests := []struct {
		name           string
		pathParams     map[string]string
		expectedStatus int
		expectedError  string
	}{
		{
			name:           "missing id parameter",
			pathParams:     map[string]string{},
			expectedStatus: 400,
			expectedError:  "post ID is required",
		},
		{
			name:           "empty id parameter",
			pathParams:     map[string]string{"id": ""},
			expectedStatus: 400,
			expectedError:  "post ID is required",
		},
		{
			name:           "nil path parameters",
			pathParams:     nil,
			expectedStatus: 400,
			expectedError:  "post ID is required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cleanup := setupTest(t)
			defer cleanup()

			request := events.APIGatewayProxyRequest{
				PathParameters: tt.pathParams,
				RequestContext: events.APIGatewayProxyRequestContext{
					Authorizer: map[string]interface{}{
						"claims": map[string]interface{}{
							"sub": testUserID,
						},
					},
				},
			}

			resp, err := Handler(context.Background(), request)
			if err != nil {
				t.Fatalf("Handler returned unexpected error: %v", err)
			}

			if resp.StatusCode != tt.expectedStatus {
				t.Errorf("expected status %d, got %d", tt.expectedStatus, resp.StatusCode)
			}

			var errResp domain.ErrorResponse
			if err := json.Unmarshal([]byte(resp.Body), &errResp); err != nil {
				t.Fatalf("failed to unmarshal response: %v", err)
			}

			if errResp.Message != tt.expectedError {
				t.Errorf("expected error message %q, got %q", tt.expectedError, errResp.Message)
			}
		})
	}
}
