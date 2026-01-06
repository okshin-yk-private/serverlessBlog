// Package main provides the UpdatePost Lambda function for updating blog posts.
//
// Requirement 3.5: 記事更新 (PUT /posts/:id)
//   - 認証付きの有効な記事更新リクエストを受信したとき、UpdatePost LambdaはDynamoDBで指定されたフィールドを更新する
//   - contentMarkdownが更新されたとき、UpdatePost LambdaはcontentHtmlを再生成する
//   - publishStatusが"draft"から"published"に変更されたとき、UpdatePost LambdaはpublishedAtタイムスタンプを設定する
//   - 記事IDが存在しない場合、UpdatePost LambdaはHTTP 404を返す
//   - リクエストに有効な認証がない場合、UpdatePost LambdaはHTTP 401を返す
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
	testCreatedAt = "2024-01-15T10:00:00Z"
	testUpdatedAt = "2024-01-15T11:00:00Z"
	testPostID    = "test-post-id"
	testTableName = "test-table"
	testUserID    = "user-123"
)

// MockDynamoDBClient is a mock implementation of DynamoDBClientInterface
type MockDynamoDBClient struct {
	GetItemFunc func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error)
	PutItemFunc func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error)
}

func (m *MockDynamoDBClient) GetItem(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
	if m.GetItemFunc != nil {
		return m.GetItemFunc(ctx, params, optFns...)
	}
	return nil, errors.New("GetItemFunc not set")
}

func (m *MockDynamoDBClient) PutItem(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
	if m.PutItemFunc != nil {
		return m.PutItemFunc(ctx, params, optFns...)
	}
	return nil, errors.New("PutItemFunc not set")
}

func setupTest(t *testing.T) func() {
	t.Helper()
	t.Setenv("TABLE_NAME", testTableName)
	t.Setenv("AWS_REGION", "ap-northeast-1")

	// Store original getters
	originalDynamoGetter := dynamoClientGetter
	originalMarkdownConverter := markdownConverter

	// Restore after test
	return func() {
		dynamoClientGetter = originalDynamoGetter
		markdownConverter = originalMarkdownConverter
	}
}

// createAuthenticatedRequest creates a request with valid authentication
func createAuthenticatedRequest(postID string, body string) events.APIGatewayProxyRequest {
	return events.APIGatewayProxyRequest{
		PathParameters: map[string]string{
			"id": postID,
		},
		Body: body,
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
func createUnauthenticatedRequest(postID string, body string) events.APIGatewayProxyRequest {
	return events.APIGatewayProxyRequest{
		PathParameters: map[string]string{
			"id": postID,
		},
		Body: body,
	}
}

// createTestPost creates a test BlogPost
func createTestPost() domain.BlogPost {
	return domain.BlogPost{
		ID:              testPostID,
		Title:           "Original Title",
		ContentMarkdown: "# Original Content",
		ContentHTML:     "<h1>Original Content</h1>",
		Category:        "technology",
		Tags:            []string{"go", "aws"},
		PublishStatus:   domain.PublishStatusDraft,
		AuthorID:        "author-123",
		CreatedAt:       testCreatedAt,
		UpdatedAt:       testUpdatedAt,
		PublishedAt:     nil,
		ImageURLs:       []string{},
	}
}

// TestHandler_SuccessfulTitleUpdate tests successful title update
// Requirements: 3.5 - 認証付きの有効な記事更新リクエストを受信したとき
func TestHandler_SuccessfulTitleUpdate(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	existingPost := createTestPost()
	av, err := attributevalue.MarshalMap(existingPost)
	if err != nil {
		t.Fatalf("failed to marshal post: %v", err)
	}

	var savedPost domain.BlogPost
	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: av}, nil
		},
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			_ = attributevalue.UnmarshalMap(params.Item, &savedPost)
			return &dynamodb.PutItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	body := `{"title": "Updated Title"}`
	request := createAuthenticatedRequest(testPostID, body)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var responsePost domain.BlogPost
	if err := json.Unmarshal([]byte(resp.Body), &responsePost); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if responsePost.Title != "Updated Title" {
		t.Errorf("expected title %q, got %q", "Updated Title", responsePost.Title)
	}

	// Verify unchanged fields
	if responsePost.ContentMarkdown != existingPost.ContentMarkdown {
		t.Errorf("contentMarkdown should not change")
	}
	if responsePost.Category != existingPost.Category {
		t.Errorf("category should not change")
	}
	if responsePost.ID != existingPost.ID {
		t.Errorf("ID should not change")
	}
	if responsePost.AuthorID != existingPost.AuthorID {
		t.Errorf("authorID should not change")
	}
	if responsePost.CreatedAt != existingPost.CreatedAt {
		t.Errorf("createdAt should not change")
	}
}

// TestHandler_SuccessfulContentMarkdownUpdate tests contentMarkdown update with HTML regeneration
// Requirements: 3.5 - contentMarkdownが更新されたとき、UpdatePost LambdaはcontentHtmlを再生成する
func TestHandler_SuccessfulContentMarkdownUpdate(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	existingPost := createTestPost()
	av, err := attributevalue.MarshalMap(existingPost)
	if err != nil {
		t.Fatalf("failed to marshal post: %v", err)
	}

	// Set up mock markdown converter
	markdownConverter = func(md string) (string, error) {
		return "<h1>New Content</h1><p>New paragraph</p>", nil
	}

	var savedPost domain.BlogPost
	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: av}, nil
		},
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			_ = attributevalue.UnmarshalMap(params.Item, &savedPost)
			return &dynamodb.PutItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	body := `{"contentMarkdown": "# New Content\n\nNew paragraph"}`
	request := createAuthenticatedRequest(testPostID, body)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var responsePost domain.BlogPost
	if err := json.Unmarshal([]byte(resp.Body), &responsePost); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if responsePost.ContentMarkdown != "# New Content\n\nNew paragraph" {
		t.Errorf("expected contentMarkdown to be updated")
	}

	// ContentHTML should be regenerated
	if responsePost.ContentHTML != "<h1>New Content</h1><p>New paragraph</p>" {
		t.Errorf("expected contentHtml to be regenerated, got %q", responsePost.ContentHTML)
	}
}

// TestHandler_PublishStatusDraftToPublished tests publishStatus transition with publishedAt setting
// Requirements: 3.5 - publishStatusが"draft"から"published"に変更されたとき
func TestHandler_PublishStatusDraftToPublished(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	existingPost := createTestPost()
	existingPost.PublishStatus = domain.PublishStatusDraft
	existingPost.PublishedAt = nil

	av, err := attributevalue.MarshalMap(existingPost)
	if err != nil {
		t.Fatalf("failed to marshal post: %v", err)
	}

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: av}, nil
		},
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			return &dynamodb.PutItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	body := `{"publishStatus": "published"}`
	request := createAuthenticatedRequest(testPostID, body)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var responsePost domain.BlogPost
	if err := json.Unmarshal([]byte(resp.Body), &responsePost); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if responsePost.PublishStatus != domain.PublishStatusPublished {
		t.Errorf("expected publishStatus %q, got %q", domain.PublishStatusPublished, responsePost.PublishStatus)
	}

	// publishedAt should be set when transitioning from draft to published
	if responsePost.PublishedAt == nil {
		t.Error("expected publishedAt to be set")
	}
}

// TestHandler_PublishStatusNoOverwritePublishedAt tests that publishedAt is not overwritten if already set
func TestHandler_PublishStatusNoOverwritePublishedAt(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	existingPublishedAt := "2024-01-10T10:00:00Z"
	existingPost := createTestPost()
	existingPost.PublishStatus = domain.PublishStatusPublished
	existingPost.PublishedAt = &existingPublishedAt

	av, err := attributevalue.MarshalMap(existingPost)
	if err != nil {
		t.Fatalf("failed to marshal post: %v", err)
	}

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: av}, nil
		},
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			return &dynamodb.PutItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	body := `{"title": "New Title"}`
	request := createAuthenticatedRequest(testPostID, body)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var responsePost domain.BlogPost
	if err := json.Unmarshal([]byte(resp.Body), &responsePost); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	// publishedAt should not be overwritten
	if responsePost.PublishedAt == nil || *responsePost.PublishedAt != existingPublishedAt {
		t.Error("publishedAt should not be overwritten")
	}
}

// TestHandler_PostNotFound tests 404 response when post doesn't exist
// Requirements: 3.5 - 記事IDが存在しない場合、UpdatePost LambdaはHTTP 404を返す
func TestHandler_PostNotFound(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: nil}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	body := `{"title": "Updated Title"}`
	request := createAuthenticatedRequest("non-existent-id", body)

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
// Requirements: 3.5 - リクエストに有効な認証がない場合、UpdatePost LambdaはHTTP 401を返す
func TestHandler_UnauthenticatedRequestReturns401(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	body := `{"title": "Updated Title"}`
	request := createUnauthenticatedRequest(testPostID, body)

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

// TestHandler_MissingPostID tests 400 response when post ID is missing
func TestHandler_MissingPostID(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{},
		Body:           `{"title": "Updated Title"}`,
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

	body := `{"title": "Updated Title"}`
	request := createAuthenticatedRequest("", body)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 400 {
		t.Errorf("expected status 400, got %d", resp.StatusCode)
	}
}

// TestHandler_MissingRequestBody tests 400 response when request body is missing
func TestHandler_MissingRequestBody(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	request := createAuthenticatedRequest(testPostID, "")

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

	if errResp.Message != "request body is required" {
		t.Errorf("expected error message %q, got %q", "request body is required", errResp.Message)
	}
}

// TestHandler_InvalidJSONBody tests 400 response when request body is not valid JSON
func TestHandler_InvalidJSONBody(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	request := createAuthenticatedRequest(testPostID, "invalid json")

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

	if errResp.Message != "invalid JSON format" {
		t.Errorf("expected error message %q, got %q", "invalid JSON format", errResp.Message)
	}
}

// TestHandler_EmptyTitleValidation tests 400 response when title is empty string
func TestHandler_EmptyTitleValidation(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	existingPost := createTestPost()
	av, _ := attributevalue.MarshalMap(existingPost)

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: av}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	body := `{"title": ""}`
	request := createAuthenticatedRequest(testPostID, body)

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

	if errResp.Message != "title cannot be empty" {
		t.Errorf("expected error message %q, got %q", "title cannot be empty", errResp.Message)
	}
}

// TestHandler_EmptyContentMarkdownValidation tests 400 response when contentMarkdown is empty
func TestHandler_EmptyContentMarkdownValidation(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	existingPost := createTestPost()
	av, _ := attributevalue.MarshalMap(existingPost)

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: av}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	body := `{"contentMarkdown": ""}`
	request := createAuthenticatedRequest(testPostID, body)

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

	if errResp.Message != "contentMarkdown cannot be empty" {
		t.Errorf("expected error message %q, got %q", "contentMarkdown cannot be empty", errResp.Message)
	}
}

// TestHandler_MissingTableName tests 500 response when TABLE_NAME is not set
func TestHandler_MissingTableName(t *testing.T) {
	t.Setenv("TABLE_NAME", "")
	t.Setenv("AWS_REGION", "ap-northeast-1")

	body := `{"title": "Updated Title"}`
	request := createAuthenticatedRequest(testPostID, body)

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

	body := `{"title": "Updated Title"}`
	request := createAuthenticatedRequest(testPostID, body)

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

	body := `{"title": "Updated Title"}`
	request := createAuthenticatedRequest(testPostID, body)

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

// TestHandler_DynamoDBPutItemError tests 500 response when DynamoDB PutItem fails
func TestHandler_DynamoDBPutItemError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	existingPost := createTestPost()
	av, _ := attributevalue.MarshalMap(existingPost)

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: av}, nil
		},
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			return nil, errors.New("DynamoDB PutItem error")
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	body := `{"title": "Updated Title"}`
	request := createAuthenticatedRequest(testPostID, body)

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

	if errResp.Message != "failed to update post" {
		t.Errorf("expected error message %q, got %q", "failed to update post", errResp.Message)
	}
}

// TestHandler_MarkdownConversionError tests 500 response when Markdown conversion fails
func TestHandler_MarkdownConversionError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	existingPost := createTestPost()
	av, _ := attributevalue.MarshalMap(existingPost)

	markdownConverter = func(md string) (string, error) {
		return "", errors.New("markdown conversion failed")
	}

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: av}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	body := `{"contentMarkdown": "# New Content"}`
	request := createAuthenticatedRequest(testPostID, body)

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

	if errResp.Message != "failed to convert markdown" {
		t.Errorf("expected error message %q, got %q", "failed to convert markdown", errResp.Message)
	}
}

// TestHandler_CORSHeaders tests that CORS headers are present in the response
func TestHandler_CORSHeaders(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	existingPost := createTestPost()
	av, _ := attributevalue.MarshalMap(existingPost)

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: av}, nil
		},
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			return &dynamodb.PutItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	body := `{"title": "Updated Title"}`
	request := createAuthenticatedRequest(testPostID, body)

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

// TestHandler_MultipleFieldsUpdate tests updating multiple fields at once
func TestHandler_MultipleFieldsUpdate(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	existingPost := createTestPost()
	av, _ := attributevalue.MarshalMap(existingPost)

	markdownConverter = func(md string) (string, error) {
		return "<h1>Updated Content</h1>", nil
	}

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: av}, nil
		},
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			return &dynamodb.PutItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	body := `{
		"title": "Updated Title",
		"contentMarkdown": "# Updated Content",
		"category": "new-category",
		"tags": ["updated", "tags"],
		"imageUrls": ["https://example.com/new-image.jpg"]
	}`
	request := createAuthenticatedRequest(testPostID, body)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var responsePost domain.BlogPost
	if err := json.Unmarshal([]byte(resp.Body), &responsePost); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if responsePost.Title != "Updated Title" {
		t.Errorf("expected title %q, got %q", "Updated Title", responsePost.Title)
	}
	if responsePost.Category != "new-category" {
		t.Errorf("expected category %q, got %q", "new-category", responsePost.Category)
	}
	if len(responsePost.Tags) != 2 {
		t.Errorf("expected 2 tags, got %d", len(responsePost.Tags))
	}
	if len(responsePost.ImageURLs) != 1 {
		t.Errorf("expected 1 imageUrl, got %d", len(responsePost.ImageURLs))
	}
}

// TestHandler_UpdatedAtIsUpdated tests that updatedAt is always updated
func TestHandler_UpdatedAtIsUpdated(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	existingPost := createTestPost()
	existingPost.UpdatedAt = "2020-01-01T00:00:00Z"
	av, _ := attributevalue.MarshalMap(existingPost)

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: av}, nil
		},
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			return &dynamodb.PutItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	body := `{"title": "Updated Title"}`
	request := createAuthenticatedRequest(testPostID, body)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var responsePost domain.BlogPost
	if err := json.Unmarshal([]byte(resp.Body), &responsePost); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	// updatedAt should be different from the original
	if responsePost.UpdatedAt == "2020-01-01T00:00:00Z" {
		t.Error("updatedAt should be updated")
	}
}

// TestHandler_TableDriven_ValidationScenarios tests validation scenarios using table-driven tests
// Requirements: 7.1, 7.4 - Table-driven tests for comprehensive coverage
//
//nolint:funlen // Table-driven tests are inherently long
func TestHandler_TableDriven_ValidationScenarios(t *testing.T) {
	tests := []struct {
		name           string
		body           string
		expectedStatus int
		expectedError  string
	}{
		{
			name:           "whitespace only title",
			body:           `{"title": "   "}`,
			expectedStatus: 400,
			expectedError:  "title cannot be empty",
		},
		{
			name:           "whitespace only contentMarkdown",
			body:           `{"contentMarkdown": "   "}`,
			expectedStatus: 400,
			expectedError:  "contentMarkdown cannot be empty",
		},
		{
			name:           "whitespace only category",
			body:           `{"category": "   "}`,
			expectedStatus: 400,
			expectedError:  "category cannot be empty",
		},
		{
			name:           "invalid publishStatus",
			body:           `{"publishStatus": "invalid"}`,
			expectedStatus: 400,
			expectedError:  "publishStatus must be 'draft' or 'published'",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cleanup := setupTest(t)
			defer cleanup()

			existingPost := createTestPost()
			av, _ := attributevalue.MarshalMap(existingPost)

			mockClient := &MockDynamoDBClient{
				GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
					return &dynamodb.GetItemOutput{Item: av}, nil
				},
			}

			dynamoClientGetter = func() (DynamoDBClientInterface, error) {
				return mockClient, nil
			}

			request := createAuthenticatedRequest(testPostID, tt.body)

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
// Requirements: 3.5, 7.1, 7.4 - Authentication validation with table-driven tests
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
				Body: `{"title": "Updated Title"}`,
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

// TestHandler_EmptyUpdateRequest tests that empty update request is valid (no fields to update)
func TestHandler_EmptyUpdateRequest(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	existingPost := createTestPost()
	av, _ := attributevalue.MarshalMap(existingPost)

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: av}, nil
		},
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			return &dynamodb.PutItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	body := `{}`
	request := createAuthenticatedRequest(testPostID, body)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	// Empty update request should still succeed (just updates updatedAt)
	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}
}

// TestHandler_PublishStatusPublishedToDraft tests transition from published to draft
func TestHandler_PublishStatusPublishedToDraft(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	existingPublishedAt := "2024-01-10T10:00:00Z"
	existingPost := createTestPost()
	existingPost.PublishStatus = domain.PublishStatusPublished
	existingPost.PublishedAt = &existingPublishedAt

	av, _ := attributevalue.MarshalMap(existingPost)

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: av}, nil
		},
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			return &dynamodb.PutItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	body := `{"publishStatus": "draft"}`
	request := createAuthenticatedRequest(testPostID, body)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var responsePost domain.BlogPost
	if err := json.Unmarshal([]byte(resp.Body), &responsePost); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if responsePost.PublishStatus != domain.PublishStatusDraft {
		t.Errorf("expected publishStatus %q, got %q", domain.PublishStatusDraft, responsePost.PublishStatus)
	}

	// publishedAt should be preserved when going back to draft
	if responsePost.PublishedAt == nil || *responsePost.PublishedAt != existingPublishedAt {
		t.Error("publishedAt should be preserved when going back to draft")
	}
}

// TestHandler_ResponseStructure tests that the response has the correct structure
func TestHandler_ResponseStructure(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	existingPost := createTestPost()
	av, _ := attributevalue.MarshalMap(existingPost)

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: av}, nil
		},
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			return &dynamodb.PutItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	body := `{"title": "Updated Title"}`
	request := createAuthenticatedRequest(testPostID, body)

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
	expectedFields := []string{"id", "title", "contentMarkdown", "contentHtml", "category", "tags", "publishStatus", "authorId", "createdAt", "updatedAt", "imageUrls"}
	for _, field := range expectedFields {
		if _, ok := responseMap[field]; !ok {
			t.Errorf("expected field %q to be present in response", field)
		}
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
		Body: `{"title": "Updated Title"}`,
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": "not-a-map",
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
		Body: `{"title": "Updated Title"}`,
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{
					"sub": 12345,
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

// TestHandler_EmptyItemResponse tests handling of empty DynamoDB item response
func TestHandler_EmptyItemResponse(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{
				Item: map[string]types.AttributeValue{},
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	body := `{"title": "Updated Title"}`
	request := createAuthenticatedRequest(testPostID, body)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 404 {
		t.Errorf("expected status 404, got %d", resp.StatusCode)
	}
}
