// Package main provides the DeletePost Lambda function for deleting blog posts.
//
// Requirement 3.6: 記事削除 (DELETE /posts/:id)
//   - 認証付きの有効な記事削除リクエストを受信したとき、DeletePost LambdaはDynamoDBから記事を削除する
//   - 記事に関連画像がある場合、DeletePost LambdaはS3から画像を削除する
//   - 記事IDが存在しない場合、DeletePost LambdaはHTTP 404を返す
//   - リクエストに有効な認証がない場合、DeletePost LambdaはHTTP 401を返す
//   - 削除が成功したとき、DeletePost LambdaはHTTP 204 No Contentを返す
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
	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"

	"serverless-blog/go-functions/internal/domain"
)

// Test constants
const (
	testCreatedAt  = "2024-01-15T10:00:00Z"
	testUpdatedAt  = "2024-01-15T11:00:00Z"
	testPostID     = "test-post-id"
	testTableName  = "test-table"
	testBucketName = "test-bucket"
	testUserID     = "user-123"
)

// MockDynamoDBClient is a mock implementation of DynamoDBClientInterface
type MockDynamoDBClient struct {
	GetItemFunc    func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error)
	DeleteItemFunc func(ctx context.Context, params *dynamodb.DeleteItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.DeleteItemOutput, error)
}

func (m *MockDynamoDBClient) GetItem(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
	if m.GetItemFunc != nil {
		return m.GetItemFunc(ctx, params, optFns...)
	}
	return nil, errors.New("GetItemFunc not set")
}

func (m *MockDynamoDBClient) DeleteItem(ctx context.Context, params *dynamodb.DeleteItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.DeleteItemOutput, error) {
	if m.DeleteItemFunc != nil {
		return m.DeleteItemFunc(ctx, params, optFns...)
	}
	return nil, errors.New("DeleteItemFunc not set")
}

// MockS3Client is a mock implementation of S3ClientInterface
type MockS3Client struct {
	DeleteObjectsFunc func(ctx context.Context, params *s3.DeleteObjectsInput, optFns ...func(*s3.Options)) (*s3.DeleteObjectsOutput, error)
}

func (m *MockS3Client) DeleteObjects(ctx context.Context, params *s3.DeleteObjectsInput, optFns ...func(*s3.Options)) (*s3.DeleteObjectsOutput, error) {
	if m.DeleteObjectsFunc != nil {
		return m.DeleteObjectsFunc(ctx, params, optFns...)
	}
	return nil, errors.New("DeleteObjectsFunc not set")
}

func setupTest(t *testing.T) func() {
	t.Helper()
	t.Setenv("TABLE_NAME", testTableName)
	t.Setenv("BUCKET_NAME", testBucketName)
	t.Setenv("AWS_REGION", "ap-northeast-1")

	// Store original getters
	originalDynamoGetter := dynamoClientGetter
	originalS3Getter := s3ClientGetter

	// Restore after test
	return func() {
		dynamoClientGetter = originalDynamoGetter
		s3ClientGetter = originalS3Getter
	}
}

// marshalPost marshals a BlogPost to DynamoDB attribute values
func marshalPost(t *testing.T, post domain.BlogPost) map[string]types.AttributeValue {
	t.Helper()
	av, err := attributevalue.MarshalMap(post)
	if err != nil {
		t.Fatalf("failed to marshal post: %v", err)
	}
	return av
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

// createTestPost creates a test BlogPost
func createTestPost() domain.BlogPost {
	return domain.BlogPost{
		ID:              testPostID,
		Title:           "Test Title",
		ContentMarkdown: "# Test Content",
		ContentHTML:     "<h1>Test Content</h1>",
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

// createTestPostWithImages creates a test BlogPost with images
func createTestPostWithImages() domain.BlogPost {
	return domain.BlogPost{
		ID:              testPostID,
		Title:           "Test Title",
		ContentMarkdown: "# Test Content",
		ContentHTML:     "<h1>Test Content</h1>",
		Category:        "technology",
		Tags:            []string{"go", "aws"},
		PublishStatus:   domain.PublishStatusPublished,
		AuthorID:        "author-123",
		CreatedAt:       testCreatedAt,
		UpdatedAt:       testUpdatedAt,
		PublishedAt:     nil,
		ImageURLs: []string{
			"https://test-bucket.s3.amazonaws.com/images/user-123/1234567890_photo1.jpg",
			"https://test-bucket.s3.amazonaws.com/images/user-123/1234567891_photo2.png",
		},
	}
}

// TestHandler_SuccessfulDeleteNoImages tests successful deletion without images
// Requirements: 3.6 - 認証付きの有効な記事削除リクエストを受信したとき
func TestHandler_SuccessfulDeleteNoImages(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	existingPost := createTestPost()
	av := marshalPost(t, existingPost)

	var deletedPostID string
	mockDynamoClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: av}, nil
		},
		DeleteItemFunc: func(ctx context.Context, params *dynamodb.DeleteItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.DeleteItemOutput, error) {
			// Capture deleted post ID
			if idAttr, ok := params.Key["id"].(*types.AttributeValueMemberS); ok {
				deletedPostID = idAttr.Value
			}
			return &dynamodb.DeleteItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockDynamoClient, nil
	}

	request := createAuthenticatedRequest(testPostID)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 204 {
		t.Errorf("expected status 204, got %d", resp.StatusCode)
	}

	if resp.Body != "" {
		t.Errorf("expected empty body, got %q", resp.Body)
	}

	if deletedPostID != testPostID {
		t.Errorf("expected deleted post ID %q, got %q", testPostID, deletedPostID)
	}
}

// TestHandler_SuccessfulDeleteWithImages tests successful deletion with associated images
// Requirements: 3.6 - 記事に関連画像がある場合、DeletePost LambdaはS3から画像を削除する
func TestHandler_SuccessfulDeleteWithImages(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	existingPost := createTestPostWithImages()
	av := marshalPost(t, existingPost)

	var s3DeleteCalled bool
	var deletedObjects []s3types.ObjectIdentifier

	mockDynamoClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: av}, nil
		},
		DeleteItemFunc: func(ctx context.Context, params *dynamodb.DeleteItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.DeleteItemOutput, error) {
			return &dynamodb.DeleteItemOutput{}, nil
		},
	}

	mockS3Client := &MockS3Client{
		DeleteObjectsFunc: func(ctx context.Context, params *s3.DeleteObjectsInput, optFns ...func(*s3.Options)) (*s3.DeleteObjectsOutput, error) {
			s3DeleteCalled = true
			if params.Delete != nil {
				deletedObjects = params.Delete.Objects
			}
			return &s3.DeleteObjectsOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockDynamoClient, nil
	}
	s3ClientGetter = func() (S3ClientInterface, error) {
		return mockS3Client, nil
	}

	request := createAuthenticatedRequest(testPostID)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 204 {
		t.Errorf("expected status 204, got %d", resp.StatusCode)
	}

	if !s3DeleteCalled {
		t.Error("expected S3 DeleteObjects to be called")
	}

	// Verify correct number of objects deleted
	if len(deletedObjects) != 2 {
		t.Errorf("expected 2 objects to be deleted, got %d", len(deletedObjects))
	}
}

// TestHandler_PostNotFound tests 404 response when post doesn't exist
// Requirements: 3.6 - 記事IDが存在しない場合、DeletePost LambdaはHTTP 404を返す
func TestHandler_PostNotFound(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockDynamoClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: nil}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockDynamoClient, nil
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
// Requirements: 3.6 - リクエストに有効な認証がない場合、DeletePost LambdaはHTTP 401を返す
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

// TestHandler_MissingPostID tests 400 response when post ID is missing
func TestHandler_MissingPostID(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{},
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

	request := createAuthenticatedRequest("")

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 400 {
		t.Errorf("expected status 400, got %d", resp.StatusCode)
	}
}

// TestHandler_MissingTableName tests 500 response when TABLE_NAME is not set
func TestHandler_MissingTableName(t *testing.T) {
	t.Setenv("TABLE_NAME", "")
	t.Setenv("BUCKET_NAME", testBucketName)
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

// TestHandler_MissingBucketName tests 500 response when BUCKET_NAME is not set and images exist
func TestHandler_MissingBucketName(t *testing.T) {
	t.Setenv("TABLE_NAME", testTableName)
	t.Setenv("BUCKET_NAME", "")
	t.Setenv("AWS_REGION", "ap-northeast-1")

	// Store original getters
	originalDynamoGetter := dynamoClientGetter
	defer func() {
		dynamoClientGetter = originalDynamoGetter
	}()

	existingPost := createTestPostWithImages()
	av := marshalPost(t, existingPost)

	mockDynamoClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: av}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockDynamoClient, nil
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

	mockDynamoClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return nil, errors.New("DynamoDB error")
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockDynamoClient, nil
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

// TestHandler_DynamoDBDeleteItemError tests 500 response when DynamoDB DeleteItem fails
func TestHandler_DynamoDBDeleteItemError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	existingPost := createTestPost()
	av := marshalPost(t, existingPost)

	mockDynamoClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: av}, nil
		},
		DeleteItemFunc: func(ctx context.Context, params *dynamodb.DeleteItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.DeleteItemOutput, error) {
			return nil, errors.New("DynamoDB DeleteItem error")
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockDynamoClient, nil
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

	if errResp.Message != "failed to delete post" {
		t.Errorf("expected error message %q, got %q", "failed to delete post", errResp.Message)
	}
}

// TestHandler_S3ClientInitError tests 500 response when S3 client fails to initialize
func TestHandler_S3ClientInitError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	existingPost := createTestPostWithImages()
	av := marshalPost(t, existingPost)

	mockDynamoClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: av}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockDynamoClient, nil
	}
	s3ClientGetter = func() (S3ClientInterface, error) {
		return nil, errors.New("failed to initialize S3 client")
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

// TestHandler_S3DeleteObjectsError tests 500 response when S3 DeleteObjects fails
func TestHandler_S3DeleteObjectsError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	existingPost := createTestPostWithImages()
	av := marshalPost(t, existingPost)

	mockDynamoClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: av}, nil
		},
	}

	mockS3Client := &MockS3Client{
		DeleteObjectsFunc: func(ctx context.Context, params *s3.DeleteObjectsInput, optFns ...func(*s3.Options)) (*s3.DeleteObjectsOutput, error) {
			return nil, errors.New("S3 DeleteObjects error")
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockDynamoClient, nil
	}
	s3ClientGetter = func() (S3ClientInterface, error) {
		return mockS3Client, nil
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

	if errResp.Message != "failed to delete images" {
		t.Errorf("expected error message %q, got %q", "failed to delete images", errResp.Message)
	}
}

// TestHandler_CORSHeaders tests that CORS headers are present in the response
func TestHandler_CORSHeaders(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	existingPost := createTestPost()
	av := marshalPost(t, existingPost)

	mockDynamoClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: av}, nil
		},
		DeleteItemFunc: func(ctx context.Context, params *dynamodb.DeleteItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.DeleteItemOutput, error) {
			return &dynamodb.DeleteItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockDynamoClient, nil
	}

	request := createAuthenticatedRequest(testPostID)

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

// TestHandler_TableDriven_AuthenticationScenarios tests authentication scenarios using table-driven tests
// Requirements: 3.6, 7.1, 7.4 - Authentication validation with table-driven tests
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
		{
			name: "claims not a map",
			authorizer: map[string]interface{}{
				"claims": "not-a-map",
			},
			expectedStatus: 401,
			expectedError:  "unauthorized",
		},
		{
			name: "sub not a string",
			authorizer: map[string]interface{}{
				"claims": map[string]interface{}{
					"sub": 12345,
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

// TestHandler_EmptyItemResponse tests handling of empty DynamoDB item response
func TestHandler_EmptyItemResponse(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockDynamoClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{
				Item: map[string]types.AttributeValue{},
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockDynamoClient, nil
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

// TestHandler_ExtractS3KeyFromUrl tests correct S3 key extraction from URLs
func TestHandler_ExtractS3KeyFromUrl(t *testing.T) {
	tests := []struct {
		name     string
		imageURL string
		expected string
	}{
		{
			name:     "standard S3 URL",
			imageURL: "https://test-bucket.s3.amazonaws.com/images/user-123/photo.jpg",
			expected: "images/user-123/photo.jpg",
		},
		{
			name:     "S3 URL with path-style",
			imageURL: "https://s3.amazonaws.com/test-bucket/images/photo.png",
			expected: "test-bucket/images/photo.png",
		},
		{
			name:     "already a key (not a URL)",
			imageURL: "images/user-123/photo.jpg",
			expected: "images/user-123/photo.jpg",
		},
		{
			name:     "regional S3 URL",
			imageURL: "https://test-bucket.s3.ap-northeast-1.amazonaws.com/images/photo.webp",
			expected: "images/photo.webp",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := extractS3KeyFromURL(tt.imageURL)
			if result != tt.expected {
				t.Errorf("expected %q, got %q", tt.expected, result)
			}
		})
	}
}

// TestHandler_DeleteWithMultipleImages tests deletion with multiple images
func TestHandler_DeleteWithMultipleImages(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	existingPost := domain.BlogPost{
		ID:    testPostID,
		Title: "Test Post",
		ImageURLs: []string{
			"https://bucket.s3.amazonaws.com/images/1.jpg",
			"https://bucket.s3.amazonaws.com/images/2.jpg",
			"https://bucket.s3.amazonaws.com/images/3.jpg",
		},
	}
	av := marshalPost(t, existingPost)

	var deletedKeys []string

	mockDynamoClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: av}, nil
		},
		DeleteItemFunc: func(ctx context.Context, params *dynamodb.DeleteItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.DeleteItemOutput, error) {
			return &dynamodb.DeleteItemOutput{}, nil
		},
	}

	mockS3Client := &MockS3Client{
		DeleteObjectsFunc: func(ctx context.Context, params *s3.DeleteObjectsInput, optFns ...func(*s3.Options)) (*s3.DeleteObjectsOutput, error) {
			for _, obj := range params.Delete.Objects {
				deletedKeys = append(deletedKeys, *obj.Key)
			}
			return &s3.DeleteObjectsOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockDynamoClient, nil
	}
	s3ClientGetter = func() (S3ClientInterface, error) {
		return mockS3Client, nil
	}

	request := createAuthenticatedRequest(testPostID)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 204 {
		t.Errorf("expected status 204, got %d", resp.StatusCode)
	}

	if len(deletedKeys) != 3 {
		t.Errorf("expected 3 keys to be deleted, got %d", len(deletedKeys))
	}
}

// TestHandler_NilImageURLsArray tests handling of nil imageUrls array
func TestHandler_NilImageURLsArray(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	existingPost := domain.BlogPost{
		ID:        testPostID,
		Title:     "Test Post",
		ImageURLs: nil,
	}
	av := marshalPost(t, existingPost)

	mockDynamoClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: av}, nil
		},
		DeleteItemFunc: func(ctx context.Context, params *dynamodb.DeleteItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.DeleteItemOutput, error) {
			return &dynamodb.DeleteItemOutput{}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockDynamoClient, nil
	}

	request := createAuthenticatedRequest(testPostID)

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 204 {
		t.Errorf("expected status 204, got %d", resp.StatusCode)
	}
}

// TestHandler_UnmarshalError tests 500 response when DynamoDB item cannot be unmarshaled
func TestHandler_UnmarshalError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	// Create an invalid item that cannot be unmarshaled to BlogPost
	// By providing an invalid type for a required field
	invalidItem := map[string]types.AttributeValue{
		"id":        &types.AttributeValueMemberS{Value: testPostID},
		"imageUrls": &types.AttributeValueMemberS{Value: "not-a-list"}, // Should be a list
	}

	mockDynamoClient := &MockDynamoDBClient{
		GetItemFunc: func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: invalidItem}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockDynamoClient, nil
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
