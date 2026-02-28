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

// TestHandler_SuccessfulGetPublishedPost tests successful retrieval of a published post
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

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{
			"id": testPostID,
		},
	}

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

// TestHandler_PostNotFound tests 404 response when post doesn't exist
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

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{
			"id": "non-existent-id",
		},
	}

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

// TestHandler_DraftPostReturns404 tests 404 response when post is not published
func TestHandler_DraftPostReturns404(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	draftPost := domain.BlogPost{
		ID:              "draft-post-id",
		Title:           "Draft Post",
		ContentMarkdown: "# Draft",
		ContentHTML:     "<h1>Draft</h1>",
		Category:        "technology",
		Tags:            []string{},
		PublishStatus:   domain.PublishStatusDraft, // Draft status
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

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{
			"id": "draft-post-id",
		},
	}

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

// TestHandler_MissingPostID tests 400 response when post ID is missing
func TestHandler_MissingPostID(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{
			// Missing "id" parameter
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

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{
			"id": testPostID,
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

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{
			"id": testPostID,
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

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{
			"id": testPostID,
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

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{
			"id": testPostID,
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

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{
			"id": testPostID,
		},
	}

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

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{
			"id": testPostID,
		},
	}

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

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{
			"id": testPostID,
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

	if errResp.Message != "failed to parse post data" {
		t.Errorf("expected error message %q, got %q", "failed to parse post data", errResp.Message)
	}
}

// TestHandler_TableDriven_SuccessScenarios tests successful post retrieval scenarios using table-driven tests
// Requirements: 7.1, 7.4 - Table-driven tests for comprehensive coverage
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
			name:   "published post with minimal fields",
			postID: "post-minimal",
			post: domain.BlogPost{
				ID:              "post-minimal",
				Title:           "Minimal Post",
				ContentMarkdown: "Short content",
				ContentHTML:     "<p>Short content</p>",
				Category:        "general",
				Tags:            []string{},
				PublishStatus:   domain.PublishStatusPublished,
				AuthorID:        "author-789",
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
				if post.ID != "post-minimal" {
					t.Errorf("expected post ID %q, got %q", "post-minimal", post.ID)
				}
				if len(post.Tags) != 0 {
					t.Errorf("expected 0 tags, got %d", len(post.Tags))
				}
			},
		},
		{
			name:   "published post with special characters in title",
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

			request := events.APIGatewayProxyRequest{
				PathParameters: map[string]string{"id": tt.postID},
			}

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
func TestHandler_TableDriven_ErrorScenarios(t *testing.T) {
	tests := []struct {
		name           string
		postID         string
		setupMock      func() *MockDynamoDBClient
		expectedStatus int
		expectedError  string
		skipTableEnv   bool
		skipClientInit bool
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
			expectedStatus: 404,
			expectedError:  "post not found",
		},
		{
			name:   "draft post returns 404",
			postID: "draft-post-id",
			setupMock: func() *MockDynamoDBClient {
				draftPost := domain.BlogPost{
					ID:            "draft-post-id",
					Title:         "Draft Post",
					PublishStatus: domain.PublishStatusDraft,
					CreatedAt:     testCreatedAt,
					UpdatedAt:     testUpdatedAt,
					Tags:          []string{},
					ImageURLs:     []string{},
				}
				av, _ := attributevalue.MarshalMap(draftPost)
				return &MockDynamoDBClient{
					GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
						return &dynamodb.GetItemOutput{Item: av}, nil
					},
				}
			},
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
			expectedStatus: 500,
			expectedError:  "failed to retrieve post",
		},
		{
			name:           "missing post ID in path",
			postID:         "",
			setupMock:      nil,
			expectedStatus: 400,
			expectedError:  "post ID is required",
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

			request := events.APIGatewayProxyRequest{
				PathParameters: map[string]string{"id": tt.postID},
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
