package main

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/codebuild"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"serverless-blog/go-functions/internal/domain"
)

// Test constants
const (
	testTableName = "test-table"
	testAuthorID  = "test-author-123"
)

// MockDynamoDBClient is a mock implementation of DynamoDBClientInterface
type MockDynamoDBClient struct {
	PutItemFunc func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error)
}

func (m *MockDynamoDBClient) PutItem(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
	if m.PutItemFunc != nil {
		return m.PutItemFunc(ctx, params, optFns...)
	}
	return nil, errors.New("PutItemFunc not set")
}

// MockMarkdownConverter is a mock implementation of MarkdownConverterFunc
type MockMarkdownConverter struct {
	ConvertFunc func(markdown string) (string, error)
}

func (m *MockMarkdownConverter) Convert(markdown string) (string, error) {
	if m.ConvertFunc != nil {
		return m.ConvertFunc(markdown)
	}
	return "", errors.New("ConvertFunc not set")
}

// MockUUIDGenerator is a mock implementation of UUIDGeneratorFunc
type MockUUIDGenerator struct {
	GenerateFunc func() string
}

func (m *MockUUIDGenerator) Generate() string {
	if m.GenerateFunc != nil {
		return m.GenerateFunc()
	}
	return "mock-uuid"
}

func setupTest(t *testing.T) func() {
	t.Helper()
	t.Setenv("TABLE_NAME", testTableName)
	t.Setenv("AWS_REGION", "ap-northeast-1")

	// Store original getters
	originalDynamoGetter := dynamoClientGetter
	originalMarkdownConverter := markdownConverter
	originalUUIDGenerator := uuidGenerator
	originalCodeBuildGetter := codebuildClientGetter

	// Restore after test
	return func() {
		dynamoClientGetter = originalDynamoGetter
		markdownConverter = originalMarkdownConverter
		uuidGenerator = originalUUIDGenerator
		codebuildClientGetter = originalCodeBuildGetter
	}
}

// TestHandler_SuccessfulCreatePost tests successful creation of a post
// Requirements: 3.1 - 投稿作成機能
func TestHandler_SuccessfulCreatePost(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	testPostID := "generated-uuid-123"
	expectedHTML := "<h1>Hello World</h1>\n"

	var savedItem map[string]types.AttributeValue

	mockClient := &MockDynamoDBClient{
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			// Verify table name
			if *params.TableName != testTableName {
				t.Errorf("expected table name %s, got %s", testTableName, *params.TableName)
			}

			// Save the item for verification
			savedItem = params.Item

			return &dynamodb.PutItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	markdownConverter = func(markdown string) (string, error) {
		return expectedHTML, nil
	}

	uuidGenerator = func() string {
		return testPostID
	}

	requestBody := domain.CreatePostRequest{
		Title:           "Test Post",
		ContentMarkdown: "# Hello World",
		Category:        "technology",
		Tags:            []string{"go", "aws"},
	}

	body, _ := json.Marshal(requestBody)
	request := events.APIGatewayProxyRequest{
		Body: string(body),
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

	if resp.StatusCode != 201 {
		t.Errorf("expected status 201, got %d. Body: %s", resp.StatusCode, resp.Body)
	}

	var post domain.BlogPost
	if err := json.Unmarshal([]byte(resp.Body), &post); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if post.ID != testPostID {
		t.Errorf("expected post ID %q, got %q", testPostID, post.ID)
	}

	if post.Title != "Test Post" {
		t.Errorf("expected title %q, got %q", "Test Post", post.Title)
	}

	if post.ContentHTML != expectedHTML {
		t.Errorf("expected contentHtml %q, got %q", expectedHTML, post.ContentHTML)
	}

	if post.AuthorID != testAuthorID {
		t.Errorf("expected authorId %q, got %q", testAuthorID, post.AuthorID)
	}

	if post.PublishStatus != domain.PublishStatusDraft {
		t.Errorf("expected publishStatus %q, got %q", domain.PublishStatusDraft, post.PublishStatus)
	}

	// Verify DynamoDB item was saved
	if savedItem == nil {
		t.Fatal("expected item to be saved to DynamoDB")
	}
}

// TestHandler_MissingTitle tests 400 response when title is missing
// Requirements: 3.1 - 必須フィールドバリデーション
func TestHandler_MissingTitle(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	requestBody := map[string]interface{}{
		"contentMarkdown": "# Hello World",
		"category":        "technology",
	}

	body, _ := json.Marshal(requestBody)
	request := events.APIGatewayProxyRequest{
		Body: string(body),
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

	if errResp.Message != "title is required" {
		t.Errorf("expected error message %q, got %q", "title is required", errResp.Message)
	}
}

// TestHandler_MissingContentMarkdown tests 400 response when contentMarkdown is missing
// Requirements: 3.1 - 必須フィールドバリデーション
func TestHandler_MissingContentMarkdown(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	requestBody := map[string]interface{}{
		"title":    "Test Post",
		"category": "technology",
	}

	body, _ := json.Marshal(requestBody)
	request := events.APIGatewayProxyRequest{
		Body: string(body),
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

	if errResp.Message != "contentMarkdown is required" {
		t.Errorf("expected error message %q, got %q", "contentMarkdown is required", errResp.Message)
	}
}

// TestHandler_MissingCategory tests 400 response when category is missing
// Requirements: 3.1 - 必須フィールドバリデーション
func TestHandler_MissingCategory(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	requestBody := map[string]interface{}{
		"title":           "Test Post",
		"contentMarkdown": "# Hello World",
	}

	body, _ := json.Marshal(requestBody)
	request := events.APIGatewayProxyRequest{
		Body: string(body),
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

	if errResp.Message != "category is required" {
		t.Errorf("expected error message %q, got %q", "category is required", errResp.Message)
	}
}

// TestHandler_Unauthorized tests 401 response when authentication is missing
// Requirements: 3.1 - 認証検証とHTTP 401レスポンス
func TestHandler_Unauthorized(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	requestBody := domain.CreatePostRequest{
		Title:           "Test Post",
		ContentMarkdown: "# Hello World",
		Category:        "technology",
	}

	body, _ := json.Marshal(requestBody)
	request := events.APIGatewayProxyRequest{
		Body: string(body),
		// No authorization context
		RequestContext: events.APIGatewayProxyRequestContext{},
	}

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

// TestHandler_InvalidJSON tests 400 response when request body is invalid JSON
func TestHandler_InvalidJSON(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	request := events.APIGatewayProxyRequest{
		Body: "invalid json",
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

	if errResp.Message != "invalid request body" {
		t.Errorf("expected error message %q, got %q", "invalid request body", errResp.Message)
	}
}

// TestHandler_MissingTableName tests 500 response when TABLE_NAME is not set
func TestHandler_MissingTableName(t *testing.T) {
	t.Setenv("TABLE_NAME", "")
	t.Setenv("AWS_REGION", "ap-northeast-1")

	requestBody := domain.CreatePostRequest{
		Title:           "Test Post",
		ContentMarkdown: "# Hello World",
		Category:        "technology",
	}

	body, _ := json.Marshal(requestBody)
	request := events.APIGatewayProxyRequest{
		Body: string(body),
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

	markdownConverter = func(markdown string) (string, error) {
		return "<p>test</p>", nil
	}

	requestBody := domain.CreatePostRequest{
		Title:           "Test Post",
		ContentMarkdown: "# Hello World",
		Category:        "technology",
	}

	body, _ := json.Marshal(requestBody)
	request := events.APIGatewayProxyRequest{
		Body: string(body),
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

// TestHandler_DynamoDBPutItemError tests 500 response when DynamoDB PutItem fails
func TestHandler_DynamoDBPutItemError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			return nil, errors.New("DynamoDB error")
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	markdownConverter = func(markdown string) (string, error) {
		return "<p>test</p>", nil
	}

	uuidGenerator = func() string {
		return "test-uuid"
	}

	requestBody := domain.CreatePostRequest{
		Title:           "Test Post",
		ContentMarkdown: "# Hello World",
		Category:        "technology",
	}

	body, _ := json.Marshal(requestBody)
	request := events.APIGatewayProxyRequest{
		Body: string(body),
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

	if resp.StatusCode != 500 {
		t.Errorf("expected status 500, got %d", resp.StatusCode)
	}

	var errResp domain.ErrorResponse
	if err := json.Unmarshal([]byte(resp.Body), &errResp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if errResp.Message != "failed to create post" {
		t.Errorf("expected error message %q, got %q", "failed to create post", errResp.Message)
	}
}

// TestHandler_MarkdownConversionError tests 500 response when Markdown conversion fails
func TestHandler_MarkdownConversionError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	markdownConverter = func(markdown string) (string, error) {
		return "", errors.New("markdown conversion error")
	}

	requestBody := domain.CreatePostRequest{
		Title:           "Test Post",
		ContentMarkdown: "# Hello World",
		Category:        "technology",
	}

	body, _ := json.Marshal(requestBody)
	request := events.APIGatewayProxyRequest{
		Body: string(body),
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

	mockClient := &MockDynamoDBClient{
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			return &dynamodb.PutItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	markdownConverter = func(markdown string) (string, error) {
		return "<p>test</p>", nil
	}

	uuidGenerator = func() string {
		return "test-uuid"
	}

	requestBody := domain.CreatePostRequest{
		Title:           "Test Post",
		ContentMarkdown: "# Hello World",
		Category:        "technology",
	}

	body, _ := json.Marshal(requestBody)
	request := events.APIGatewayProxyRequest{
		Body: string(body),
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

	// Check CORS headers are present
	if resp.Headers["Access-Control-Allow-Origin"] != "*" {
		t.Errorf("expected Access-Control-Allow-Origin header to be *, got %q", resp.Headers["Access-Control-Allow-Origin"])
	}

	if resp.Headers["Content-Type"] != "application/json" {
		t.Errorf("expected Content-Type header to be application/json, got %q", resp.Headers["Content-Type"])
	}
}

// TestHandler_WithOptionalPublishStatus tests setting publish status from request
// Requirements: 3.1 - 投稿作成機能
func TestHandler_WithOptionalPublishStatus(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	testPostID := "generated-uuid-456"

	mockClient := &MockDynamoDBClient{
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			return &dynamodb.PutItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	markdownConverter = func(markdown string) (string, error) {
		return "<p>test</p>", nil
	}

	uuidGenerator = func() string {
		return testPostID
	}

	publishStatus := domain.PublishStatusPublished
	requestBody := domain.CreatePostRequest{
		Title:           "Published Post",
		ContentMarkdown: "# Hello World",
		Category:        "technology",
		PublishStatus:   &publishStatus,
	}

	body, _ := json.Marshal(requestBody)
	request := events.APIGatewayProxyRequest{
		Body: string(body),
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

	if resp.StatusCode != 201 {
		t.Errorf("expected status 201, got %d", resp.StatusCode)
	}

	var post domain.BlogPost
	if err := json.Unmarshal([]byte(resp.Body), &post); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if post.PublishStatus != domain.PublishStatusPublished {
		t.Errorf("expected publishStatus %q, got %q", domain.PublishStatusPublished, post.PublishStatus)
	}

	// PublishedAt should be set when status is "published"
	if post.PublishedAt == nil {
		t.Error("expected publishedAt to be set for published post")
	}
}

// TestHandler_WithTags tests creating a post with tags
func TestHandler_WithTags(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			return &dynamodb.PutItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	markdownConverter = func(markdown string) (string, error) {
		return "<p>test</p>", nil
	}

	uuidGenerator = func() string {
		return "test-uuid"
	}

	requestBody := domain.CreatePostRequest{
		Title:           "Post with Tags",
		ContentMarkdown: "# Hello World",
		Category:        "technology",
		Tags:            []string{"go", "aws", "serverless"},
	}

	body, _ := json.Marshal(requestBody)
	request := events.APIGatewayProxyRequest{
		Body: string(body),
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

	if resp.StatusCode != 201 {
		t.Errorf("expected status 201, got %d", resp.StatusCode)
	}

	var post domain.BlogPost
	if err := json.Unmarshal([]byte(resp.Body), &post); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if len(post.Tags) != 3 {
		t.Errorf("expected 3 tags, got %d", len(post.Tags))
	}
}

// TestHandler_WithImageURLs tests creating a post with image URLs
func TestHandler_WithImageURLs(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			return &dynamodb.PutItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	markdownConverter = func(markdown string) (string, error) {
		return "<p>test</p>", nil
	}

	uuidGenerator = func() string {
		return "test-uuid"
	}

	requestBody := domain.CreatePostRequest{
		Title:           "Post with Images",
		ContentMarkdown: "# Hello World",
		Category:        "technology",
		ImageURLs:       []string{"https://example.com/image1.jpg", "https://example.com/image2.jpg"},
	}

	body, _ := json.Marshal(requestBody)
	request := events.APIGatewayProxyRequest{
		Body: string(body),
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

	if resp.StatusCode != 201 {
		t.Errorf("expected status 201, got %d", resp.StatusCode)
	}

	var post domain.BlogPost
	if err := json.Unmarshal([]byte(resp.Body), &post); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if len(post.ImageURLs) != 2 {
		t.Errorf("expected 2 image URLs, got %d", len(post.ImageURLs))
	}
}

// TestHandler_ResponseStructure tests that the response has the correct structure
func TestHandler_ResponseStructure(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			return &dynamodb.PutItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	markdownConverter = func(markdown string) (string, error) {
		return "<p>test</p>", nil
	}

	uuidGenerator = func() string {
		return "test-uuid"
	}

	requestBody := domain.CreatePostRequest{
		Title:           "Test Post",
		ContentMarkdown: "# Hello World",
		Category:        "technology",
		Tags:            []string{"go"},
		ImageURLs:       []string{"https://example.com/img.jpg"},
	}

	body, _ := json.Marshal(requestBody)
	request := events.APIGatewayProxyRequest{
		Body: string(body),
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

	if resp.StatusCode != 201 {
		t.Errorf("expected status 201, got %d", resp.StatusCode)
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

// TestHandler_TableDriven_ValidationScenarios tests input validation scenarios using table-driven tests
// Requirements: 7.1, 7.4 - Table-driven tests for comprehensive coverage
func TestHandler_TableDriven_ValidationScenarios(t *testing.T) {
	tests := []struct {
		name           string
		requestBody    map[string]interface{}
		expectedStatus int
		expectedError  string
	}{
		{
			name: "missing title",
			requestBody: map[string]interface{}{
				"contentMarkdown": "# Hello",
				"category":        "tech",
			},
			expectedStatus: 400,
			expectedError:  "title is required",
		},
		{
			name: "empty title",
			requestBody: map[string]interface{}{
				"title":           "",
				"contentMarkdown": "# Hello",
				"category":        "tech",
			},
			expectedStatus: 400,
			expectedError:  "title is required",
		},
		{
			name: "missing contentMarkdown",
			requestBody: map[string]interface{}{
				"title":    "Test Post",
				"category": "tech",
			},
			expectedStatus: 400,
			expectedError:  "contentMarkdown is required",
		},
		{
			name: "empty contentMarkdown",
			requestBody: map[string]interface{}{
				"title":           "Test Post",
				"contentMarkdown": "",
				"category":        "tech",
			},
			expectedStatus: 400,
			expectedError:  "contentMarkdown is required",
		},
		{
			name: "missing category",
			requestBody: map[string]interface{}{
				"title":           "Test Post",
				"contentMarkdown": "# Hello",
			},
			expectedStatus: 400,
			expectedError:  "category is required",
		},
		{
			name: "empty category",
			requestBody: map[string]interface{}{
				"title":           "Test Post",
				"contentMarkdown": "# Hello",
				"category":        "",
			},
			expectedStatus: 400,
			expectedError:  "category is required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cleanup := setupTest(t)
			defer cleanup()

			body, _ := json.Marshal(tt.requestBody)
			request := events.APIGatewayProxyRequest{
				Body: string(body),
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

// TestHandler_TableDriven_SuccessScenarios tests successful post creation scenarios using table-driven tests
// Requirements: 7.1, 7.4 - Table-driven tests for comprehensive coverage
func TestHandler_TableDriven_SuccessScenarios(t *testing.T) {
	tests := []struct {
		name          string
		request       domain.CreatePostRequest
		expectedTitle string
		checkResponse func(t *testing.T, post domain.BlogPost)
	}{
		{
			name: "minimal post",
			request: domain.CreatePostRequest{
				Title:           "Minimal Post",
				ContentMarkdown: "Short content",
				Category:        "general",
			},
			expectedTitle: "Minimal Post",
			checkResponse: func(t *testing.T, post domain.BlogPost) {
				if post.PublishStatus != domain.PublishStatusDraft {
					t.Errorf("expected publishStatus to be draft")
				}
				if len(post.Tags) != 0 {
					t.Errorf("expected 0 tags, got %d", len(post.Tags))
				}
			},
		},
		{
			name: "post with all optional fields",
			request: domain.CreatePostRequest{
				Title:           "Full Post",
				ContentMarkdown: "# Full content\n\nWith paragraphs",
				Category:        "technology",
				Tags:            []string{"go", "aws"},
				ImageURLs:       []string{"https://example.com/img.jpg"},
			},
			expectedTitle: "Full Post",
			checkResponse: func(t *testing.T, post domain.BlogPost) {
				if len(post.Tags) != 2 {
					t.Errorf("expected 2 tags, got %d", len(post.Tags))
				}
				if len(post.ImageURLs) != 1 {
					t.Errorf("expected 1 image URL, got %d", len(post.ImageURLs))
				}
			},
		},
		{
			name: "post with special characters",
			request: domain.CreatePostRequest{
				Title:           "Post with 日本語 and émojis 🎉",
				ContentMarkdown: "# 日本語コンテンツ\n\nSpecial chars: <>&\"'",
				Category:        "international",
			},
			expectedTitle: "Post with 日本語 and émojis 🎉",
			checkResponse: func(t *testing.T, post domain.BlogPost) {
				if post.Title != "Post with 日本語 and émojis 🎉" {
					t.Error("title with special characters not preserved")
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cleanup := setupTest(t)
			defer cleanup()

			mockClient := &MockDynamoDBClient{
				PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
					return &dynamodb.PutItemOutput{}, nil
				},
			}

			dynamoClientGetter = func() (DynamoDBClientInterface, error) {
				return mockClient, nil
			}

			markdownConverter = func(markdown string) (string, error) {
				return "<p>" + markdown + "</p>", nil
			}

			uuidGenerator = func() string {
				return "test-uuid-" + tt.name
			}

			body, _ := json.Marshal(tt.request)
			request := events.APIGatewayProxyRequest{
				Body: string(body),
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

			if resp.StatusCode != 201 {
				t.Errorf("expected status 201, got %d", resp.StatusCode)
			}

			var post domain.BlogPost
			if err := json.Unmarshal([]byte(resp.Body), &post); err != nil {
				t.Fatalf("failed to unmarshal response: %v", err)
			}

			if post.Title != tt.expectedTitle {
				t.Errorf("expected title %q, got %q", tt.expectedTitle, post.Title)
			}

			if tt.checkResponse != nil {
				tt.checkResponse(t, post)
			}
		})
	}
}

// TestHandler_EmptyBody tests 400 response when request body is empty
func TestHandler_EmptyBody(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	request := events.APIGatewayProxyRequest{
		Body: "",
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
}

// TestHandler_ClaimsNotMap tests 401 response when claims is not a map
func TestHandler_ClaimsNotMap(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	requestBody := domain.CreatePostRequest{
		Title:           "Test Post",
		ContentMarkdown: "# Hello World",
		Category:        "technology",
	}

	body, _ := json.Marshal(requestBody)
	request := events.APIGatewayProxyRequest{
		Body: string(body),
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

// TestHandler_SubNotString tests 401 response when sub claim is not a string
func TestHandler_SubNotString(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	requestBody := domain.CreatePostRequest{
		Title:           "Test Post",
		ContentMarkdown: "# Hello World",
		Category:        "technology",
	}

	body, _ := json.Marshal(requestBody)
	request := events.APIGatewayProxyRequest{
		Body: string(body),
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{
					"sub": 12345, // number instead of string
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

// TestHandler_MissingSub tests 401 response when sub claim is missing
func TestHandler_MissingSub(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	requestBody := domain.CreatePostRequest{
		Title:           "Test Post",
		ContentMarkdown: "# Hello World",
		Category:        "technology",
	}

	body, _ := json.Marshal(requestBody)
	request := events.APIGatewayProxyRequest{
		Body: string(body),
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{
					// no "sub" key
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

// TestHandler_NilClaims tests 401 response when claims key is missing
func TestHandler_NilClaims(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	requestBody := domain.CreatePostRequest{
		Title:           "Test Post",
		ContentMarkdown: "# Hello World",
		Category:        "technology",
	}

	body, _ := json.Marshal(requestBody)
	request := events.APIGatewayProxyRequest{
		Body: string(body),
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				// no "claims" key
				"principalId": "user123",
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

// TestHandler_MarkdownConversion_Verification tests that markdown is correctly converted to HTML
// Requirements: 3.1 - contentMarkdownをcontentHtmlに変換
func TestHandler_MarkdownConversion_Verification(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	testPostID := "markdown-test-uuid"
	inputMarkdown := "# Hello World\n\n**Bold** and *italic*"
	expectedHTML := "<h1>Hello World</h1>\n<p><strong>Bold</strong> and <em>italic</em></p>\n"

	var capturedPost domain.BlogPost

	mockClient := &MockDynamoDBClient{
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			attributevalue.UnmarshalMap(params.Item, &capturedPost)
			return &dynamodb.PutItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	// Use a mock that returns specific HTML to verify transformation pipeline
	markdownConverter = func(markdown string) (string, error) {
		if markdown == inputMarkdown {
			return expectedHTML, nil
		}
		return "<p>" + markdown + "</p>", nil
	}

	uuidGenerator = func() string {
		return testPostID
	}

	requestBody := domain.CreatePostRequest{
		Title:           "Markdown Test",
		ContentMarkdown: inputMarkdown,
		Category:        "technology",
	}

	body, _ := json.Marshal(requestBody)
	request := events.APIGatewayProxyRequest{
		Body: string(body),
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

	if resp.StatusCode != 201 {
		t.Errorf("expected status 201, got %d", resp.StatusCode)
	}

	// Verify the response contains correct HTML
	var post domain.BlogPost
	if err := json.Unmarshal([]byte(resp.Body), &post); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if post.ContentHTML != expectedHTML {
		t.Errorf("expected contentHtml %q, got %q", expectedHTML, post.ContentHTML)
	}

	// Verify the contentMarkdown is preserved
	if post.ContentMarkdown != inputMarkdown {
		t.Errorf("expected contentMarkdown %q, got %q", inputMarkdown, post.ContentMarkdown)
	}

	// Verify DynamoDB received correct data
	if capturedPost.ContentHTML != expectedHTML {
		t.Errorf("DynamoDB received wrong contentHtml: expected %q, got %q", expectedHTML, capturedPost.ContentHTML)
	}
}

// TestHandler_Authentication_NilAuthorizer tests 401 response when authorizer is nil
// Requirements: 3.1 - 認証検証とHTTP 401レスポンス
func TestHandler_Authentication_NilAuthorizer(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	requestBody := domain.CreatePostRequest{
		Title:           "Test Post",
		ContentMarkdown: "# Hello World",
		Category:        "technology",
	}

	body, _ := json.Marshal(requestBody)
	request := events.APIGatewayProxyRequest{
		Body: string(body),
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: nil, // explicitly nil
		},
	}

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

// TestHandler_PublishStatus_Draft tests that default publish status is draft
// Requirements: 3.1 - 投稿作成機能
func TestHandler_PublishStatus_Draft(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			return &dynamodb.PutItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	markdownConverter = func(markdown string) (string, error) {
		return "<p>test</p>", nil
	}

	uuidGenerator = func() string {
		return "test-uuid"
	}

	// Request without publishStatus - should default to draft
	requestBody := domain.CreatePostRequest{
		Title:           "Draft Post",
		ContentMarkdown: "# Hello World",
		Category:        "technology",
	}

	body, _ := json.Marshal(requestBody)
	request := events.APIGatewayProxyRequest{
		Body: string(body),
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

	if resp.StatusCode != 201 {
		t.Errorf("expected status 201, got %d", resp.StatusCode)
	}

	var post domain.BlogPost
	if err := json.Unmarshal([]byte(resp.Body), &post); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if post.PublishStatus != domain.PublishStatusDraft {
		t.Errorf("expected publishStatus %q, got %q", domain.PublishStatusDraft, post.PublishStatus)
	}

	// publishedAt should be nil for draft
	if post.PublishedAt != nil {
		t.Errorf("expected publishedAt to be nil for draft post, got %v", *post.PublishedAt)
	}
}

// TestHandler_DynamoDBItemStructure tests that the item saved to DynamoDB has correct structure
func TestHandler_DynamoDBItemStructure(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	testPostID := "test-uuid-structure"
	var capturedItem map[string]types.AttributeValue

	mockClient := &MockDynamoDBClient{
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			capturedItem = params.Item
			return &dynamodb.PutItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	markdownConverter = func(markdown string) (string, error) {
		return "<h1>Test</h1>", nil
	}

	uuidGenerator = func() string {
		return testPostID
	}

	requestBody := domain.CreatePostRequest{
		Title:           "Structure Test",
		ContentMarkdown: "# Test",
		Category:        "technology",
		Tags:            []string{"test"},
	}

	body, _ := json.Marshal(requestBody)
	request := events.APIGatewayProxyRequest{
		Body: string(body),
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

	if resp.StatusCode != 201 {
		t.Errorf("expected status 201, got %d", resp.StatusCode)
	}

	// Verify captured DynamoDB item
	if capturedItem == nil {
		t.Fatal("expected item to be captured")
	}

	// Unmarshal to verify structure
	var savedPost domain.BlogPost
	if err := attributevalue.UnmarshalMap(capturedItem, &savedPost); err != nil {
		t.Fatalf("failed to unmarshal captured item: %v", err)
	}

	if savedPost.ID != testPostID {
		t.Errorf("expected ID %q, got %q", testPostID, savedPost.ID)
	}

	if savedPost.Title != "Structure Test" {
		t.Errorf("expected title %q, got %q", "Structure Test", savedPost.Title)
	}

	if savedPost.ContentHTML != "<h1>Test</h1>" {
		t.Errorf("expected contentHtml %q, got %q", "<h1>Test</h1>", savedPost.ContentHTML)
	}

	if savedPost.AuthorID != testAuthorID {
		t.Errorf("expected authorId %q, got %q", testAuthorID, savedPost.AuthorID)
	}

	if savedPost.CreatedAt == "" {
		t.Error("expected createdAt to be set")
	}

	if savedPost.UpdatedAt == "" {
		t.Error("expected updatedAt to be set")
	}
}

// =============================================================================
// CodeBuild Trigger Tests
// Requirement 10.1: Trigger CodeBuild when post is published
// =============================================================================

// TestHandler_CreatePublishedPost_TriggersCodeBuild tests that CodeBuild is triggered when creating a published post
// Requirement 10.1: Trigger CodeBuild when post is published
func TestHandler_CreatePublishedPost_TriggersCodeBuild(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	t.Setenv("CODEBUILD_PROJECT_NAME", "test-project")

	mockClient := &MockDynamoDBClient{
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			return &dynamodb.PutItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	markdownConverter = func(markdown string) (string, error) {
		return "<p>test</p>", nil
	}

	uuidGenerator = func() string {
		return "test-uuid"
	}

	// Track if CodeBuild getter was called
	codeBuildGetterCalled := false
	codebuildClientGetter = func() (*codebuild.Client, error) {
		codeBuildGetterCalled = true
		return nil, errors.New("mock client not available")
	}

	publishStatus := domain.PublishStatusPublished
	requestBody := domain.CreatePostRequest{
		Title:           "Published Post",
		ContentMarkdown: "# Hello World",
		Category:        "technology",
		PublishStatus:   &publishStatus,
	}

	body, _ := json.Marshal(requestBody)
	request := events.APIGatewayProxyRequest{
		Body: string(body),
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

	// Post creation should succeed despite CodeBuild client error
	if resp.StatusCode != 201 {
		t.Errorf("expected status 201, got %d", resp.StatusCode)
	}

	// CodeBuild getter SHOULD be called when creating a published post
	if !codeBuildGetterCalled {
		t.Error("CodeBuild getter should be called when creating a published post")
	}

	var post domain.BlogPost
	if err := json.Unmarshal([]byte(resp.Body), &post); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if post.PublishStatus != domain.PublishStatusPublished {
		t.Errorf("expected publishStatus %q, got %q", domain.PublishStatusPublished, post.PublishStatus)
	}
}

// TestHandler_CreateDraftPost_DoesNotTriggerCodeBuild tests that CodeBuild is NOT triggered when creating a draft post
// Requirement 10.1: CodeBuild should only be triggered for published posts
func TestHandler_CreateDraftPost_DoesNotTriggerCodeBuild(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	t.Setenv("CODEBUILD_PROJECT_NAME", "test-project")

	mockClient := &MockDynamoDBClient{
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			return &dynamodb.PutItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	markdownConverter = func(markdown string) (string, error) {
		return "<p>test</p>", nil
	}

	uuidGenerator = func() string {
		return "test-uuid"
	}

	// Track if CodeBuild getter was called
	codeBuildGetterCalled := false
	codebuildClientGetter = func() (*codebuild.Client, error) {
		codeBuildGetterCalled = true
		return nil, errors.New("should not be called")
	}

	// Create draft post (default behavior when publishStatus is not specified)
	requestBody := domain.CreatePostRequest{
		Title:           "Draft Post",
		ContentMarkdown: "# Hello World",
		Category:        "technology",
	}

	body, _ := json.Marshal(requestBody)
	request := events.APIGatewayProxyRequest{
		Body: string(body),
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

	if resp.StatusCode != 201 {
		t.Errorf("expected status 201, got %d", resp.StatusCode)
	}

	// CodeBuild getter should NOT be called for draft posts
	if codeBuildGetterCalled {
		t.Error("CodeBuild getter should not be called when creating a draft post")
	}
}

// TestHandler_CodeBuildError_DoesNotAffectCreate tests that CodeBuild errors don't affect post creation
// Requirement 10.10: Lambda shall handle CodeBuild API errors gracefully without affecting post creation response
func TestHandler_CodeBuildError_DoesNotAffectCreate(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	t.Setenv("CODEBUILD_PROJECT_NAME", "test-project")

	mockClient := &MockDynamoDBClient{
		PutItemFunc: func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			return &dynamodb.PutItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	markdownConverter = func(markdown string) (string, error) {
		return "<p>test</p>", nil
	}

	uuidGenerator = func() string {
		return "test-uuid"
	}

	// Mock CodeBuild client to return error
	codebuildClientGetter = func() (*codebuild.Client, error) {
		return nil, errors.New("CodeBuild service unavailable")
	}

	publishStatus := domain.PublishStatusPublished
	requestBody := domain.CreatePostRequest{
		Title:           "Published Post",
		ContentMarkdown: "# Hello World",
		Category:        "technology",
		PublishStatus:   &publishStatus,
	}

	body, _ := json.Marshal(requestBody)
	request := events.APIGatewayProxyRequest{
		Body: string(body),
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

	// Post creation should succeed despite CodeBuild error
	if resp.StatusCode != 201 {
		t.Errorf("expected status 201, got %d (CodeBuild error should not affect response)", resp.StatusCode)
	}

	var post domain.BlogPost
	if err := json.Unmarshal([]byte(resp.Body), &post); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if post.PublishStatus != domain.PublishStatusPublished {
		t.Errorf("expected publishStatus %q, got %q", domain.PublishStatusPublished, post.PublishStatus)
	}
}

// TestTriggerSiteBuild_MissingProjectName tests that build is skipped when CODEBUILD_PROJECT_NAME is not set
// Requirement 10.10: Handle missing configuration gracefully
func TestTriggerSiteBuild_MissingProjectName(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	// Ensure CODEBUILD_PROJECT_NAME is not set
	t.Setenv("CODEBUILD_PROJECT_NAME", "")

	// triggerSiteBuild should not panic and should return silently
	triggerSiteBuild(context.Background())
	// No error expected - just a warning log
}

// TestTriggerSiteBuild_CodeBuildClientInitError tests graceful handling when CodeBuild client fails to initialize
// Requirement 10.10: Handle CodeBuild API errors gracefully
func TestTriggerSiteBuild_CodeBuildClientInitError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	t.Setenv("CODEBUILD_PROJECT_NAME", "test-project")

	// Mock CodeBuild client to return error
	codebuildClientGetter = func() (*codebuild.Client, error) {
		return nil, errors.New("failed to initialize CodeBuild client")
	}

	// triggerSiteBuild should not panic and should handle error gracefully
	triggerSiteBuild(context.Background())
	// No error expected - just an error log
}
