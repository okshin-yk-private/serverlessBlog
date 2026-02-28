// Package main provides tests for the ListPosts Lambda function.
//
// Requirement 3.4: 記事一覧取得 (GET /posts)
// Requirement 7.1, 7.4: テーブル駆動テストによる包括的テストカバレッジ
package main

import (
	"context"
	"encoding/base64"
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
	testTableName   = "test-table"
)

// MockDynamoDBClient is a mock implementation of DynamoDBClientInterface
type MockDynamoDBClient struct {
	QueryFunc func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error)
}

func (m *MockDynamoDBClient) Query(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
	if m.QueryFunc != nil {
		return m.QueryFunc(ctx, params, optFns...)
	}
	return nil, errors.New("QueryFunc not set")
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

// createTestPost creates a test post with the given ID and publish status
func createTestPost(id, status, category, createdAt string) domain.BlogPost {
	publishedAt := testPublishedAt
	var publishedAtPtr *string
	if status == domain.PublishStatusPublished {
		publishedAtPtr = &publishedAt
	}

	return domain.BlogPost{
		ID:              id,
		Title:           "Test Post " + id,
		ContentMarkdown: "# Content " + id,
		ContentHTML:     "<h1>Content " + id + "</h1>",
		Category:        category,
		Tags:            []string{"test"},
		PublishStatus:   status,
		AuthorID:        "author-123",
		CreatedAt:       createdAt,
		UpdatedAt:       testUpdatedAt,
		PublishedAt:     publishedAtPtr,
		ImageURLs:       []string{},
	}
}

// TestHandler_SuccessfulListPosts tests successful retrieval of posts list
func TestHandler_SuccessfulListPosts(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	posts := []domain.BlogPost{
		createTestPost("post-1", domain.PublishStatusPublished, "technology", "2024-01-15T12:00:00Z"),
		createTestPost("post-2", domain.PublishStatusPublished, "technology", "2024-01-14T12:00:00Z"),
	}

	var items []map[string]types.AttributeValue
	for _, post := range posts {
		av, err := attributevalue.MarshalMap(post)
		if err != nil {
			t.Fatalf("failed to marshal post: %v", err)
		}
		items = append(items, av)
	}

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			// Verify table name
			if *params.TableName != testTableName {
				t.Errorf("expected table name %s, got %s", testTableName, *params.TableName)
			}
			// Verify index name
			if params.IndexName == nil || *params.IndexName != "PublishStatusIndex" {
				t.Errorf("expected index name PublishStatusIndex")
			}
			// Verify ScanIndexForward is false (descending order)
			if params.ScanIndexForward == nil || *params.ScanIndexForward != false {
				t.Errorf("expected ScanIndexForward to be false")
			}

			return &dynamodb.QueryOutput{
				Items: items,
				Count: int32(len(items)),
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{},
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var listResp domain.ListPostsResponse
	if err := json.Unmarshal([]byte(resp.Body), &listResp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if len(listResp.Items) != 2 {
		t.Errorf("expected 2 items, got %d", len(listResp.Items))
	}

	// Verify contentMarkdown is excluded
	for _, item := range listResp.Items {
		if item.ContentMarkdown != "" {
			t.Errorf("expected contentMarkdown to be excluded from response")
		}
	}
}

// TestHandler_ListPostsWithCategoryFilter tests category filtering
func TestHandler_ListPostsWithCategoryFilter(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	posts := []domain.BlogPost{
		createTestPost("post-1", domain.PublishStatusPublished, "technology", "2024-01-15T12:00:00Z"),
	}

	var items []map[string]types.AttributeValue
	for _, post := range posts {
		av, err := attributevalue.MarshalMap(post)
		if err != nil {
			t.Fatalf("failed to marshal post: %v", err)
		}
		items = append(items, av)
	}

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			// Verify CategoryIndex is used
			if params.IndexName == nil || *params.IndexName != "CategoryIndex" {
				t.Errorf("expected index name CategoryIndex, got %v", params.IndexName)
			}
			// Verify FilterExpression for publishStatus
			if params.FilterExpression == nil || *params.FilterExpression != "publishStatus = :publishStatus" {
				t.Errorf("expected FilterExpression for publishStatus")
			}

			return &dynamodb.QueryOutput{
				Items: items,
				Count: int32(len(items)),
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{
			"category": "technology",
		},
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}
}

// TestHandler_ListPostsWithLimit tests limit parameter
func TestHandler_ListPostsWithLimit(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			// Verify limit
			if params.Limit == nil || *params.Limit != 5 {
				t.Errorf("expected limit 5, got %v", params.Limit)
			}

			return &dynamodb.QueryOutput{
				Items: []map[string]types.AttributeValue{},
				Count: 0,
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{
			"limit": "5",
		},
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}
}

// TestHandler_ListPostsWithPagination tests pagination with nextToken
func TestHandler_ListPostsWithPagination(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	// Create a valid ExclusiveStartKey
	lastKey := map[string]interface{}{
		"id":            "last-post-id",
		"publishStatus": "published",
		"createdAt":     "2024-01-14T12:00:00Z",
	}
	lastKeyJSON, _ := json.Marshal(lastKey)
	nextToken := base64.StdEncoding.EncodeToString(lastKeyJSON)

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			// Verify ExclusiveStartKey is set
			if params.ExclusiveStartKey == nil {
				t.Errorf("expected ExclusiveStartKey to be set")
			}

			return &dynamodb.QueryOutput{
				Items: []map[string]types.AttributeValue{},
				Count: 0,
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{
			"nextToken": nextToken,
		},
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}
}

// TestHandler_ListPostsReturnsNextToken tests that nextToken is returned when there are more results
func TestHandler_ListPostsReturnsNextToken(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	lastKey := map[string]types.AttributeValue{
		"id":            &types.AttributeValueMemberS{Value: "last-post-id"},
		"publishStatus": &types.AttributeValueMemberS{Value: "published"},
		"createdAt":     &types.AttributeValueMemberS{Value: "2024-01-14T12:00:00Z"},
	}

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			return &dynamodb.QueryOutput{
				Items:            []map[string]types.AttributeValue{},
				Count:            0,
				LastEvaluatedKey: lastKey,
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{},
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var listResp domain.ListPostsResponse
	if err := json.Unmarshal([]byte(resp.Body), &listResp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if listResp.NextToken == nil {
		t.Errorf("expected nextToken to be set")
	}
}

// TestHandler_MissingTableName tests 500 response when TABLE_NAME is not set
func TestHandler_MissingTableName(t *testing.T) {
	t.Setenv("TABLE_NAME", "")
	t.Setenv("AWS_REGION", "ap-northeast-1")

	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{},
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
		QueryStringParameters: map[string]string{},
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

// TestHandler_DynamoDBQueryError tests 500 response when DynamoDB Query fails
func TestHandler_DynamoDBQueryError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			return nil, errors.New("DynamoDB error")
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{},
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

	if errResp.Message != "failed to retrieve posts" {
		t.Errorf("expected error message %q, got %q", "failed to retrieve posts", errResp.Message)
	}
}

// TestHandler_TableDriven_LimitValidation tests limit validation using table-driven tests
func TestHandler_TableDriven_LimitValidation(t *testing.T) {
	tests := []struct {
		name          string
		limitParam    string
		expectedLimit int32
	}{
		{
			name:          "default limit when not provided",
			limitParam:    "",
			expectedLimit: 10,
		},
		{
			name:          "valid limit within range",
			limitParam:    "20",
			expectedLimit: 20,
		},
		{
			name:          "limit at minimum",
			limitParam:    "1",
			expectedLimit: 1,
		},
		{
			name:          "limit at maximum",
			limitParam:    "100",
			expectedLimit: 100,
		},
		{
			name:          "limit below minimum - use default",
			limitParam:    "0",
			expectedLimit: 10,
		},
		{
			name:          "limit above maximum - use default",
			limitParam:    "101",
			expectedLimit: 10,
		},
		{
			name:          "negative limit - use default",
			limitParam:    "-5",
			expectedLimit: 10,
		},
		{
			name:          "non-numeric limit - use default",
			limitParam:    "invalid",
			expectedLimit: 10,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cleanup := setupTest(t)
			defer cleanup()

			mockClient := &MockDynamoDBClient{
				QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
					if params.Limit == nil || *params.Limit != tt.expectedLimit {
						t.Errorf("expected limit %d, got %v", tt.expectedLimit, params.Limit)
					}

					return &dynamodb.QueryOutput{
						Items: []map[string]types.AttributeValue{},
						Count: 0,
					}, nil
				},
			}

			dynamoClientGetter = func() (DynamoDBClientInterface, error) {
				return mockClient, nil
			}

			queryParams := map[string]string{}
			if tt.limitParam != "" {
				queryParams["limit"] = tt.limitParam
			}

			request := events.APIGatewayProxyRequest{
				QueryStringParameters: queryParams,
			}

			resp, err := Handler(context.Background(), request)
			if err != nil {
				t.Fatalf("Handler returned unexpected error: %v", err)
			}

			if resp.StatusCode != 200 {
				t.Errorf("expected status 200, got %d", resp.StatusCode)
			}
		})
	}
}

// TestHandler_TableDriven_QueryParameters tests various query parameter combinations
func TestHandler_TableDriven_QueryParameters(t *testing.T) {
	tests := []struct {
		name                   string
		queryParams            map[string]string
		expectedIndexName      string
		expectFilterExpression bool
	}{
		{
			name:                   "no category - use PublishStatusIndex",
			queryParams:            map[string]string{},
			expectedIndexName:      "PublishStatusIndex",
			expectFilterExpression: false,
		},
		{
			name:                   "with category - use CategoryIndex",
			queryParams:            map[string]string{"category": "technology"},
			expectedIndexName:      "CategoryIndex",
			expectFilterExpression: true,
		},
		{
			name:                   "with category and limit",
			queryParams:            map[string]string{"category": "lifestyle", "limit": "5"},
			expectedIndexName:      "CategoryIndex",
			expectFilterExpression: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cleanup := setupTest(t)
			defer cleanup()

			mockClient := &MockDynamoDBClient{
				QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
					if params.IndexName == nil || *params.IndexName != tt.expectedIndexName {
						t.Errorf("expected index name %q, got %v", tt.expectedIndexName, params.IndexName)
					}

					if tt.expectFilterExpression && params.FilterExpression == nil {
						t.Errorf("expected FilterExpression to be set")
					}
					if !tt.expectFilterExpression && params.FilterExpression != nil {
						t.Errorf("expected FilterExpression to be nil")
					}

					return &dynamodb.QueryOutput{
						Items: []map[string]types.AttributeValue{},
						Count: 0,
					}, nil
				},
			}

			dynamoClientGetter = func() (DynamoDBClientInterface, error) {
				return mockClient, nil
			}

			request := events.APIGatewayProxyRequest{
				QueryStringParameters: tt.queryParams,
			}

			resp, err := Handler(context.Background(), request)
			if err != nil {
				t.Fatalf("Handler returned unexpected error: %v", err)
			}

			if resp.StatusCode != 200 {
				t.Errorf("expected status 200, got %d", resp.StatusCode)
			}
		})
	}
}

// TestHandler_InvalidNextToken tests that invalid nextToken is ignored
func TestHandler_InvalidNextToken(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			// Invalid nextToken should be ignored, so ExclusiveStartKey should be nil
			if params.ExclusiveStartKey != nil {
				t.Errorf("expected ExclusiveStartKey to be nil for invalid nextToken")
			}

			return &dynamodb.QueryOutput{
				Items: []map[string]types.AttributeValue{},
				Count: 0,
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{
			"nextToken": "invalid-base64-token!!!",
		},
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	// Should still return 200 - invalid token is ignored
	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}
}

// TestHandler_CORSHeaders tests that CORS headers are present in the response
func TestHandler_CORSHeaders(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			return &dynamodb.QueryOutput{
				Items: []map[string]types.AttributeValue{},
				Count: 0,
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{},
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

// TestHandler_EmptyResult tests handling of empty result set
func TestHandler_EmptyResult(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			return &dynamodb.QueryOutput{
				Items: []map[string]types.AttributeValue{},
				Count: 0,
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{},
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var listResp domain.ListPostsResponse
	if err := json.Unmarshal([]byte(resp.Body), &listResp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if len(listResp.Items) != 0 {
		t.Errorf("expected 0 items, got %d", len(listResp.Items))
	}

	if listResp.NextToken != nil {
		t.Errorf("expected nextToken to be nil for empty result")
	}
}

// TestHandler_SortOrder tests that posts are returned in descending createdAt order
func TestHandler_SortOrder(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			// Verify ScanIndexForward is false (descending order)
			if params.ScanIndexForward == nil || *params.ScanIndexForward != false {
				t.Errorf("expected ScanIndexForward to be false for descending order")
			}

			return &dynamodb.QueryOutput{
				Items: []map[string]types.AttributeValue{},
				Count: 0,
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{},
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}
}

// TestHandler_NilQueryStringParameters tests handling of nil query string parameters
func TestHandler_NilQueryStringParameters(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			// Should use default limit
			if params.Limit == nil || *params.Limit != 10 {
				t.Errorf("expected default limit 10, got %v", params.Limit)
			}

			return &dynamodb.QueryOutput{
				Items: []map[string]types.AttributeValue{},
				Count: 0,
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := events.APIGatewayProxyRequest{
		QueryStringParameters: nil,
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}
}

// TestHandler_ResponseStructure tests that the response has the correct structure
func TestHandler_ResponseStructure(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	posts := []domain.BlogPost{
		createTestPost("post-1", domain.PublishStatusPublished, "technology", "2024-01-15T12:00:00Z"),
	}

	var items []map[string]types.AttributeValue
	for _, post := range posts {
		av, err := attributevalue.MarshalMap(post)
		if err != nil {
			t.Fatalf("failed to marshal post: %v", err)
		}
		items = append(items, av)
	}

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			return &dynamodb.QueryOutput{
				Items: items,
				Count: int32(len(items)),
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{},
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

	// Check items field is present
	if _, ok := responseMap["items"]; !ok {
		t.Errorf("expected field %q to be present in response", "items")
	}

	// Check item fields (without contentMarkdown)
	items2, ok := responseMap["items"].([]interface{})
	if !ok || len(items2) == 0 {
		t.Fatalf("expected items to be a non-empty array")
	}

	item := items2[0].(map[string]interface{})
	expectedFields := []string{"id", "title", "contentHtml", "category", "tags", "publishStatus", "authorId", "createdAt", "updatedAt", "imageUrls"}
	for _, field := range expectedFields {
		if _, ok := item[field]; !ok {
			t.Errorf("expected field %q to be present in response item", field)
		}
	}

	// contentMarkdown should NOT be present
	if _, ok := item["contentMarkdown"]; ok {
		t.Errorf("expected field contentMarkdown to NOT be present in response item")
	}
}

// TestHandler_CategoryQueryExpression tests that category query uses correct KeyConditionExpression
func TestHandler_CategoryQueryExpression(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			// Verify KeyConditionExpression for category
			if params.KeyConditionExpression == nil || *params.KeyConditionExpression != "category = :category" {
				t.Errorf("expected KeyConditionExpression %q, got %v", "category = :category", params.KeyConditionExpression)
			}

			// Verify ExpressionAttributeValues contains category
			if params.ExpressionAttributeValues == nil {
				t.Errorf("expected ExpressionAttributeValues to be set")
			}
			if categoryVal, ok := params.ExpressionAttributeValues[":category"]; !ok {
				t.Errorf("expected :category in ExpressionAttributeValues")
			} else {
				if s, ok := categoryVal.(*types.AttributeValueMemberS); !ok || s.Value != "technology" {
					t.Errorf("expected category value to be 'technology'")
				}
			}

			return &dynamodb.QueryOutput{
				Items: []map[string]types.AttributeValue{},
				Count: 0,
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{
			"category": "technology",
		},
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}
}

// TestHandler_PublishStatusQueryExpression tests that non-category query uses correct KeyConditionExpression
func TestHandler_PublishStatusQueryExpression(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			// Verify KeyConditionExpression for publishStatus
			if params.KeyConditionExpression == nil || *params.KeyConditionExpression != "publishStatus = :publishStatus" {
				t.Errorf("expected KeyConditionExpression %q, got %v", "publishStatus = :publishStatus", params.KeyConditionExpression)
			}

			// Verify ExpressionAttributeValues contains publishStatus = published
			if params.ExpressionAttributeValues == nil {
				t.Errorf("expected ExpressionAttributeValues to be set")
			}
			if statusVal, ok := params.ExpressionAttributeValues[":publishStatus"]; !ok {
				t.Errorf("expected :publishStatus in ExpressionAttributeValues")
			} else {
				if s, ok := statusVal.(*types.AttributeValueMemberS); !ok || s.Value != "published" {
					t.Errorf("expected publishStatus value to be 'published'")
				}
			}

			return &dynamodb.QueryOutput{
				Items: []map[string]types.AttributeValue{},
				Count: 0,
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{},
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}
}

// TestHandler_ProcessResultsSkipsInvalidItems tests that invalid items are skipped during processing
func TestHandler_ProcessResultsSkipsInvalidItems(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	// Create one valid item and one invalid item (tags as string instead of list)
	validPost := createTestPost("valid-post", domain.PublishStatusPublished, "technology", "2024-01-15T12:00:00Z")
	validAV, err := attributevalue.MarshalMap(validPost)
	if err != nil {
		t.Fatalf("failed to marshal post: %v", err)
	}

	invalidItem := map[string]types.AttributeValue{
		"id":   &types.AttributeValueMemberS{Value: "invalid-post"},
		"tags": &types.AttributeValueMemberS{Value: "not-a-list"}, // Invalid: should be list
	}

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			return &dynamodb.QueryOutput{
				Items: []map[string]types.AttributeValue{validAV, invalidItem},
				Count: 2,
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{},
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var listResp ListPostsResponseBody
	if err := json.Unmarshal([]byte(resp.Body), &listResp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	// Only the valid item should be returned
	if len(listResp.Items) != 1 {
		t.Errorf("expected 1 valid item, got %d", len(listResp.Items))
	}

	if len(listResp.Items) > 0 && listResp.Items[0].ID != "valid-post" {
		t.Errorf("expected valid-post, got %s", listResp.Items[0].ID)
	}
}

// TestHandler_NextTokenWithNonStringValues tests nextToken handling with non-string values
func TestHandler_NextTokenWithNonStringValues(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	// Create a nextToken with non-string values (numbers) - should be ignored
	keyMap := map[string]interface{}{
		"id":      123,    // Number, not string
		"created": 456.78, // Float, not string
	}
	keyJSON, _ := json.Marshal(keyMap)
	nextToken := base64.StdEncoding.EncodeToString(keyJSON)

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			// ExclusiveStartKey should be nil because non-string values are ignored
			if params.ExclusiveStartKey != nil {
				t.Errorf("expected ExclusiveStartKey to be nil for non-string values in nextToken")
			}

			return &dynamodb.QueryOutput{
				Items: []map[string]types.AttributeValue{},
				Count: 0,
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{
			"nextToken": nextToken,
		},
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}
}

// TestHandler_GenerateNextTokenWithNonStringValue tests nextToken generation when LastEvaluatedKey contains non-string values
func TestHandler_GenerateNextTokenWithNonStringValue(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	// Mock a LastEvaluatedKey with a Number attribute (should be skipped in token generation)
	lastKey := map[string]types.AttributeValue{
		"id":       &types.AttributeValueMemberS{Value: "last-post-id"},
		"sortKey":  &types.AttributeValueMemberN{Value: "12345"}, // Number type
		"category": &types.AttributeValueMemberS{Value: "tech"},
	}

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			return &dynamodb.QueryOutput{
				Items:            []map[string]types.AttributeValue{},
				Count:            0,
				LastEvaluatedKey: lastKey,
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{},
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var listResp ListPostsResponseBody
	if err := json.Unmarshal([]byte(resp.Body), &listResp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	// NextToken should still be generated (with only string values)
	if listResp.NextToken == nil {
		t.Errorf("expected nextToken to be set")
	}

	// Decode and verify the token contains only string values
	if listResp.NextToken != nil {
		decoded, _ := base64.StdEncoding.DecodeString(*listResp.NextToken)
		var tokenMap map[string]string
		if err := json.Unmarshal(decoded, &tokenMap); err != nil {
			t.Fatalf("failed to unmarshal nextToken: %v", err)
		}

		// Should contain id and category but not sortKey (which is a number)
		if _, ok := tokenMap["id"]; !ok {
			t.Errorf("expected 'id' in nextToken")
		}
		if _, ok := tokenMap["category"]; !ok {
			t.Errorf("expected 'category' in nextToken")
		}
		if _, ok := tokenMap["sortKey"]; ok {
			t.Errorf("expected 'sortKey' NOT to be in nextToken (it's a number)")
		}
	}
}

// TestHandler_InvalidBase64NextToken tests handling of invalid base64 in nextToken
func TestHandler_InvalidBase64NextToken(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			// ExclusiveStartKey should be nil for invalid base64
			if params.ExclusiveStartKey != nil {
				t.Errorf("expected ExclusiveStartKey to be nil for invalid base64")
			}

			return &dynamodb.QueryOutput{
				Items: []map[string]types.AttributeValue{},
				Count: 0,
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{
			"nextToken": "not-valid-base64-!!!",
		},
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}
}

// TestHandler_ValidBase64InvalidJSONNextToken tests handling of valid base64 but invalid JSON in nextToken
func TestHandler_ValidBase64InvalidJSONNextToken(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	// Valid base64 but not valid JSON
	invalidJSON := base64.StdEncoding.EncodeToString([]byte("not valid json {{{"))

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			// ExclusiveStartKey should be nil for invalid JSON
			if params.ExclusiveStartKey != nil {
				t.Errorf("expected ExclusiveStartKey to be nil for invalid JSON")
			}

			return &dynamodb.QueryOutput{
				Items: []map[string]types.AttributeValue{},
				Count: 0,
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{
			"nextToken": invalidJSON,
		},
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}
}

// TestExecuteCountQuery tests the count query execution for admin requests
func TestExecuteCountQuery(t *testing.T) {
	tests := []struct {
		name          string
		publishStatus string
		mockCount     int32
		mockError     error
		expectError   bool
		expectedCount int64
	}{
		{
			name:          "successful count for published",
			publishStatus: "published",
			mockCount:     42,
			mockError:     nil,
			expectError:   false,
			expectedCount: 42,
		},
		{
			name:          "successful count for draft",
			publishStatus: "draft",
			mockCount:     15,
			mockError:     nil,
			expectError:   false,
			expectedCount: 15,
		},
		{
			name:          "zero count",
			publishStatus: "published",
			mockCount:     0,
			mockError:     nil,
			expectError:   false,
			expectedCount: 0,
		},
		{
			name:          "query error",
			publishStatus: "published",
			mockCount:     0,
			mockError:     errors.New("DynamoDB error"),
			expectError:   true,
			expectedCount: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockClient := &MockDynamoDBClient{
				QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
					// Verify it's a count query
					if params.Select != types.SelectCount {
						t.Errorf("expected Select to be COUNT")
					}

					// Verify index name
					if params.IndexName == nil || *params.IndexName != "PublishStatusIndex" {
						t.Errorf("expected index PublishStatusIndex")
					}

					// Verify publishStatus value
					statusVal, ok := params.ExpressionAttributeValues[":publishStatus"]
					if !ok {
						t.Errorf("expected :publishStatus in ExpressionAttributeValues")
					} else if s, ok := statusVal.(*types.AttributeValueMemberS); !ok || s.Value != tt.publishStatus {
						t.Errorf("expected publishStatus %q", tt.publishStatus)
					}

					if tt.mockError != nil {
						return nil, tt.mockError
					}

					return &dynamodb.QueryOutput{
						Count: tt.mockCount,
					}, nil
				},
			}

			count, err := executeCountQuery(context.Background(), mockClient, testTableName, tt.publishStatus)

			if tt.expectError {
				if err == nil {
					t.Errorf("expected error, got nil")
				}
			} else {
				if err != nil {
					t.Errorf("unexpected error: %v", err)
				}
				if count != tt.expectedCount {
					t.Errorf("expected count %d, got %d", tt.expectedCount, count)
				}
			}
		})
	}
}

// TestExecuteCountQuery_Pagination tests count query with pagination (multiple pages)
func TestExecuteCountQuery_Pagination(t *testing.T) {
	callCount := 0

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			callCount++

			// Verify it's a count query
			if params.Select != types.SelectCount {
				t.Errorf("expected Select to be COUNT")
			}

			// Simulate pagination: first call returns 50 with LastEvaluatedKey, second call returns 30
			if callCount == 1 {
				// First page: no ExclusiveStartKey expected
				if params.ExclusiveStartKey != nil {
					t.Errorf("expected no ExclusiveStartKey on first call")
				}
				return &dynamodb.QueryOutput{
					Count: 50,
					LastEvaluatedKey: map[string]types.AttributeValue{
						"id":            &types.AttributeValueMemberS{Value: "page1-last"},
						"publishStatus": &types.AttributeValueMemberS{Value: "published"},
					},
				}, nil
			}

			// Second page: ExclusiveStartKey should be set
			if params.ExclusiveStartKey == nil {
				t.Errorf("expected ExclusiveStartKey on second call")
			}
			return &dynamodb.QueryOutput{
				Count:            30,
				LastEvaluatedKey: nil, // No more pages
			}, nil
		},
	}

	count, err := executeCountQuery(context.Background(), mockClient, testTableName, "published")

	if err != nil {
		t.Errorf("unexpected error: %v", err)
	}

	// Total count should be sum of all pages: 50 + 30 = 80
	if count != 80 {
		t.Errorf("expected total count 80, got %d", count)
	}

	if callCount != 2 {
		t.Errorf("expected 2 query calls, got %d", callCount)
	}
}

// TestBuildQueryInput_WithPublishStatus tests buildQueryInput with different publishStatus values
func TestBuildQueryInput_WithPublishStatus(t *testing.T) {
	tests := []struct {
		name                   string
		category               string
		publishStatus          string
		expectedIndex          string
		expectedKeyCondition   string
		expectedPublishStatus  string
		expectFilterExpression bool
	}{
		{
			name:                   "published status without category",
			category:               "",
			publishStatus:          "published",
			expectedIndex:          "PublishStatusIndex",
			expectedKeyCondition:   "publishStatus = :publishStatus",
			expectedPublishStatus:  "published",
			expectFilterExpression: false,
		},
		{
			name:                   "draft status without category",
			category:               "",
			publishStatus:          "draft",
			expectedIndex:          "PublishStatusIndex",
			expectedKeyCondition:   "publishStatus = :publishStatus",
			expectedPublishStatus:  "draft",
			expectFilterExpression: false,
		},
		{
			name:                   "published status with category",
			category:               "technology",
			publishStatus:          "published",
			expectedIndex:          "CategoryIndex",
			expectedKeyCondition:   "category = :category",
			expectedPublishStatus:  "published",
			expectFilterExpression: true,
		},
		{
			name:                   "draft status with category",
			category:               "technology",
			publishStatus:          "draft",
			expectedIndex:          "CategoryIndex",
			expectedKeyCondition:   "category = :category",
			expectedPublishStatus:  "draft",
			expectFilterExpression: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			queryInput := buildQueryInput(testTableName, 10, tt.category, tt.publishStatus, nil)

			// Verify index name
			if queryInput.IndexName == nil || *queryInput.IndexName != tt.expectedIndex {
				t.Errorf("expected index %q, got %v", tt.expectedIndex, queryInput.IndexName)
			}

			// Verify key condition expression
			if queryInput.KeyConditionExpression == nil || *queryInput.KeyConditionExpression != tt.expectedKeyCondition {
				t.Errorf("expected key condition %q, got %v", tt.expectedKeyCondition, queryInput.KeyConditionExpression)
			}

			// Verify publishStatus value in ExpressionAttributeValues
			statusVal, ok := queryInput.ExpressionAttributeValues[":publishStatus"]
			if !ok {
				t.Errorf("expected :publishStatus in ExpressionAttributeValues")
			} else {
				if s, ok := statusVal.(*types.AttributeValueMemberS); !ok || s.Value != tt.expectedPublishStatus {
					t.Errorf("expected publishStatus value %q, got %v", tt.expectedPublishStatus, statusVal)
				}
			}

			// Verify FilterExpression
			if tt.expectFilterExpression {
				if queryInput.FilterExpression == nil {
					t.Errorf("expected FilterExpression to be set")
				}
			} else {
				if queryInput.FilterExpression != nil {
					t.Errorf("expected FilterExpression to be nil")
				}
			}
		})
	}
}

// TestParsePublishStatus tests the publishStatus parameter parsing and validation
func TestParsePublishStatus(t *testing.T) {
	tests := []struct {
		name           string
		param          string
		expectedStatus string
		expectError    bool
	}{
		{
			name:           "valid published status",
			param:          "published",
			expectedStatus: "published",
			expectError:    false,
		},
		{
			name:           "valid draft status",
			param:          "draft",
			expectedStatus: "draft",
			expectError:    false,
		},
		{
			name:           "empty string defaults to published",
			param:          "",
			expectedStatus: "published",
			expectError:    false,
		},
		{
			name:           "invalid status returns error",
			param:          "invalid",
			expectedStatus: "",
			expectError:    true,
		},
		{
			name:           "unknown status returns error",
			param:          "pending",
			expectedStatus: "",
			expectError:    true,
		},
		{
			name:           "case sensitive - PUBLISHED is invalid",
			param:          "PUBLISHED",
			expectedStatus: "",
			expectError:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			status, err := parsePublishStatus(tt.param)

			if tt.expectError {
				if err == nil {
					t.Errorf("parsePublishStatus(%q) expected error, got nil", tt.param)
				}
			} else {
				if err != nil {
					t.Errorf("parsePublishStatus(%q) unexpected error: %v", tt.param, err)
				}
				if status != tt.expectedStatus {
					t.Errorf("parsePublishStatus(%q) = %q, want %q", tt.param, status, tt.expectedStatus)
				}
			}
		})
	}
}

// TestIsAuthenticated tests the authentication detection function
func TestIsAuthenticated(t *testing.T) {
	tests := []struct {
		name       string
		authorizer map[string]interface{}
		expected   bool
	}{
		{
			name:       "authenticated with valid claims",
			authorizer: map[string]interface{}{"claims": map[string]interface{}{"sub": "user-123"}},
			expected:   true,
		},
		{
			name:       "not authenticated - nil authorizer",
			authorizer: nil,
			expected:   false,
		},
		{
			name:       "not authenticated - empty authorizer",
			authorizer: map[string]interface{}{},
			expected:   false,
		},
		{
			name:       "not authenticated - nil claims",
			authorizer: map[string]interface{}{"claims": nil},
			expected:   false,
		},
		{
			name:       "authenticated - empty claims map (still has claims key)",
			authorizer: map[string]interface{}{"claims": map[string]interface{}{}},
			expected:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			request := events.APIGatewayProxyRequest{
				RequestContext: events.APIGatewayProxyRequestContext{
					Authorizer: tt.authorizer,
				},
			}

			result := isAuthenticated(request)
			if result != tt.expected {
				t.Errorf("isAuthenticated() = %v, want %v", result, tt.expected)
			}
		})
	}
}

// TestHandler_AdminRequestIncludesCount tests that admin requests include count field
func TestHandler_AdminRequestIncludesCount(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	posts := []domain.BlogPost{
		createTestPost("post-1", domain.PublishStatusPublished, "technology", "2024-01-15T12:00:00Z"),
		createTestPost("post-2", domain.PublishStatusPublished, "technology", "2024-01-14T12:00:00Z"),
	}

	var items []map[string]types.AttributeValue
	for _, post := range posts {
		av, err := attributevalue.MarshalMap(post)
		if err != nil {
			t.Fatalf("failed to marshal post: %v", err)
		}
		items = append(items, av)
	}

	queryCallCount := 0
	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			queryCallCount++
			// Check if this is a count query
			if params.Select == types.SelectCount {
				return &dynamodb.QueryOutput{
					Count: 42, // Total count of published articles
				}, nil
			}
			// Regular query
			return &dynamodb.QueryOutput{
				Items: items,
				Count: int32(len(items)),
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	// Admin request with Cognito claims
	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{
			"publishStatus": "published",
		},
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{"sub": "admin-user-123"},
			},
		},
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	// Parse response
	var responseMap map[string]interface{}
	if err := json.Unmarshal([]byte(resp.Body), &responseMap); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	// Count field should be present for admin requests
	countVal, ok := responseMap["count"]
	if !ok {
		t.Fatalf("expected count field to be present for admin request")
	}

	// Verify count value
	count := int64(countVal.(float64))
	if count != 42 {
		t.Errorf("expected count 42, got %d", count)
	}

	// Verify count query was executed (should be 2 queries: list + count)
	if queryCallCount != 2 {
		t.Errorf("expected 2 queries (list + count), got %d", queryCallCount)
	}
}

// TestHandler_PublicRequestExcludesCount tests that public requests do not include count field
func TestHandler_PublicRequestExcludesCount(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	posts := []domain.BlogPost{
		createTestPost("post-1", domain.PublishStatusPublished, "technology", "2024-01-15T12:00:00Z"),
	}

	var items []map[string]types.AttributeValue
	for _, post := range posts {
		av, err := attributevalue.MarshalMap(post)
		if err != nil {
			t.Fatalf("failed to marshal post: %v", err)
		}
		items = append(items, av)
	}

	queryCallCount := 0
	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			queryCallCount++
			// Should never be a count query for public requests
			if params.Select == types.SelectCount {
				t.Errorf("count query should not be executed for public requests")
			}
			return &dynamodb.QueryOutput{
				Items: items,
				Count: int32(len(items)),
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	// Public request (no Authorizer)
	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{},
		// No Authorizer - public request
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	// Parse response
	var responseMap map[string]interface{}
	if err := json.Unmarshal([]byte(resp.Body), &responseMap); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	// Count field should NOT be present for public requests
	if _, ok := responseMap["count"]; ok {
		t.Errorf("expected count field to NOT be present for public request")
	}

	// Only 1 query should be executed (no count query)
	if queryCallCount != 1 {
		t.Errorf("expected 1 query (list only), got %d", queryCallCount)
	}
}

// TestHandler_AdminDraftRequestIncludesCount tests that admin draft requests include count
func TestHandler_AdminDraftRequestIncludesCount(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	posts := []domain.BlogPost{
		createTestPost("draft-1", domain.PublishStatusDraft, "technology", "2024-01-15T12:00:00Z"),
	}

	var items []map[string]types.AttributeValue
	for _, post := range posts {
		av, err := attributevalue.MarshalMap(post)
		if err != nil {
			t.Fatalf("failed to marshal post: %v", err)
		}
		items = append(items, av)
	}

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			if params.Select == types.SelectCount {
				// Verify count query uses draft status
				statusVal := params.ExpressionAttributeValues[":publishStatus"]
				if s, ok := statusVal.(*types.AttributeValueMemberS); !ok || s.Value != "draft" {
					t.Errorf("expected count query for draft status")
				}
				return &dynamodb.QueryOutput{
					Count: 5, // Total count of draft articles
				}, nil
			}
			return &dynamodb.QueryOutput{
				Items: items,
				Count: int32(len(items)),
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	// Admin request for drafts
	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{
			"publishStatus": "draft",
		},
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{"sub": "admin-user-123"},
			},
		},
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var responseMap map[string]interface{}
	if err := json.Unmarshal([]byte(resp.Body), &responseMap); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	// Count should be 5 (draft count)
	countVal, ok := responseMap["count"]
	if !ok {
		t.Fatalf("expected count field for admin request")
	}

	count := int64(countVal.(float64))
	if count != 5 {
		t.Errorf("expected count 5, got %d", count)
	}
}

// TestHandler_CountQueryError tests graceful handling of count query errors
func TestHandler_CountQueryError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	posts := []domain.BlogPost{
		createTestPost("post-1", domain.PublishStatusPublished, "technology", "2024-01-15T12:00:00Z"),
	}

	var items []map[string]types.AttributeValue
	for _, post := range posts {
		av, err := attributevalue.MarshalMap(post)
		if err != nil {
			t.Fatalf("failed to marshal post: %v", err)
		}
		items = append(items, av)
	}

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			// Count query fails, but list query succeeds
			if params.Select == types.SelectCount {
				return nil, errors.New("count query failed")
			}
			return &dynamodb.QueryOutput{
				Items: items,
				Count: int32(len(items)),
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	// Admin request
	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{},
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{"sub": "admin-user-123"},
			},
		},
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	// Should return 500 when count query fails for admin request
	if resp.StatusCode != 500 {
		t.Errorf("expected status 500 for count query failure, got %d", resp.StatusCode)
	}
}

// TestHandler_PostWithNilTags tests that posts with nil tags get empty array
func TestHandler_PostWithNilTags(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	// Create a post with nil tags (simulating a post without tags in DynamoDB)
	post := domain.BlogPost{
		ID:            "post-no-tags",
		Title:         "Post without tags",
		ContentHTML:   "<p>Content</p>",
		Category:      "general",
		Tags:          nil, // Explicitly nil
		PublishStatus: domain.PublishStatusPublished,
		AuthorID:      "author-123",
		CreatedAt:     testCreatedAt,
		UpdatedAt:     testUpdatedAt,
		ImageURLs:     nil, // Also nil
	}

	av, err := attributevalue.MarshalMap(post)
	if err != nil {
		t.Fatalf("failed to marshal post: %v", err)
	}

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			return &dynamodb.QueryOutput{
				Items: []map[string]types.AttributeValue{av},
				Count: 1,
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{},
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var listResp ListPostsResponseBody
	if err := json.Unmarshal([]byte(resp.Body), &listResp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if len(listResp.Items) != 1 {
		t.Fatalf("expected 1 item, got %d", len(listResp.Items))
	}

	// Tags and ImageURLs should be empty arrays, not nil
	if listResp.Items[0].Tags == nil {
		t.Errorf("expected tags to be empty array, not nil")
	}
	if listResp.Items[0].ImageURLs == nil {
		t.Errorf("expected imageUrls to be empty array, not nil")
	}
}

// TestFilterBySearch_TableDriven tests the filterBySearch function with various inputs
func TestFilterBySearch_TableDriven(t *testing.T) {
	items := []ListPostsResponseItem{
		{
			ID:    "post-1",
			Title: "Learning React Hooks",
			Tags:  []string{"react", "javascript", "frontend"},
		},
		{
			ID:    "post-2",
			Title: "Introduction to Go Programming",
			Tags:  []string{"go", "backend", "programming"},
		},
		{
			ID:    "post-3",
			Title: "AWS Lambda Best Practices",
			Tags:  []string{"aws", "serverless", "cloud"},
		},
	}

	tests := []struct {
		name          string
		searchQuery   string
		expectedCount int
		expectedIDs   []string
	}{
		{
			name:          "empty query returns all items",
			searchQuery:   "",
			expectedCount: 3,
			expectedIDs:   []string{"post-1", "post-2", "post-3"},
		},
		{
			name:          "whitespace only query returns all items",
			searchQuery:   "   ",
			expectedCount: 3,
			expectedIDs:   []string{"post-1", "post-2", "post-3"},
		},
		{
			name:          "title match - exact word",
			searchQuery:   "React",
			expectedCount: 1,
			expectedIDs:   []string{"post-1"},
		},
		{
			name:          "title match - partial word",
			searchQuery:   "rea",
			expectedCount: 1,
			expectedIDs:   []string{"post-1"},
		},
		{
			name:          "title match - case insensitive lowercase",
			searchQuery:   "react",
			expectedCount: 1,
			expectedIDs:   []string{"post-1"},
		},
		{
			name:          "title match - case insensitive uppercase",
			searchQuery:   "REACT",
			expectedCount: 1,
			expectedIDs:   []string{"post-1"},
		},
		{
			name:          "title match - mixed case",
			searchQuery:   "ReAcT",
			expectedCount: 1,
			expectedIDs:   []string{"post-1"},
		},
		{
			name:          "tag match - exact tag",
			searchQuery:   "serverless",
			expectedCount: 1,
			expectedIDs:   []string{"post-3"},
		},
		{
			name:          "tag match - partial tag",
			searchQuery:   "server",
			expectedCount: 1,
			expectedIDs:   []string{"post-3"},
		},
		{
			name:          "tag match - case insensitive",
			searchQuery:   "AWS",
			expectedCount: 1,
			expectedIDs:   []string{"post-3"},
		},
		{
			name:          "multiple matches - common word in title",
			searchQuery:   "Introduction",
			expectedCount: 1,
			expectedIDs:   []string{"post-2"},
		},
		{
			name:          "multiple matches - common tag",
			searchQuery:   "programming",
			expectedCount: 1,
			expectedIDs:   []string{"post-2"},
		},
		{
			name:          "no match",
			searchQuery:   "python",
			expectedCount: 0,
			expectedIDs:   []string{},
		},
		{
			name:          "match across title and tags",
			searchQuery:   "go",
			expectedCount: 1,
			expectedIDs:   []string{"post-2"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := filterBySearch(items, tt.searchQuery)

			if len(result) != tt.expectedCount {
				t.Errorf("filterBySearch(%q) returned %d items, want %d", tt.searchQuery, len(result), tt.expectedCount)
			}

			// Verify expected IDs
			for i, expected := range tt.expectedIDs {
				if i < len(result) && result[i].ID != expected {
					t.Errorf("filterBySearch(%q) item[%d].ID = %q, want %q", tt.searchQuery, i, result[i].ID, expected)
				}
			}
		})
	}
}

// TestFilterBySearch_EmptyTags tests filterBySearch with posts that have empty tags
func TestFilterBySearch_EmptyTags(t *testing.T) {
	items := []ListPostsResponseItem{
		{
			ID:    "post-1",
			Title: "Post with no tags",
			Tags:  []string{},
		},
		{
			ID:    "post-2",
			Title: "Another post",
			Tags:  nil,
		},
	}

	// Search by title should still work
	result := filterBySearch(items, "no tags")
	if len(result) != 1 {
		t.Errorf("expected 1 result, got %d", len(result))
	}
	if len(result) > 0 && result[0].ID != "post-1" {
		t.Errorf("expected post-1, got %s", result[0].ID)
	}

	// Search for non-existent tag should return empty
	result = filterBySearch(items, "nonexistent")
	if len(result) != 0 {
		t.Errorf("expected 0 results, got %d", len(result))
	}
}

// TestHandler_SearchByTitle tests the Handler with search query parameter for title search
func TestHandler_SearchByTitle(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	posts := []domain.BlogPost{
		{
			ID:            "post-1",
			Title:         "Learning React Hooks",
			ContentHTML:   "<p>Content</p>",
			Category:      "technology",
			Tags:          []string{"react"},
			PublishStatus: domain.PublishStatusPublished,
			AuthorID:      "author-123",
			CreatedAt:     "2024-01-15T12:00:00Z",
			UpdatedAt:     testUpdatedAt,
			ImageURLs:     []string{},
		},
		{
			ID:            "post-2",
			Title:         "Introduction to Go",
			ContentHTML:   "<p>Content</p>",
			Category:      "technology",
			Tags:          []string{"go"},
			PublishStatus: domain.PublishStatusPublished,
			AuthorID:      "author-123",
			CreatedAt:     "2024-01-14T12:00:00Z",
			UpdatedAt:     testUpdatedAt,
			ImageURLs:     []string{},
		},
	}

	var items []map[string]types.AttributeValue
	for _, post := range posts {
		av, err := attributevalue.MarshalMap(post)
		if err != nil {
			t.Fatalf("failed to marshal post: %v", err)
		}
		items = append(items, av)
	}

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			return &dynamodb.QueryOutput{
				Items: items,
				Count: int32(len(items)),
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{
			"q": "React",
		},
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var listResp ListPostsResponseBody
	if err := json.Unmarshal([]byte(resp.Body), &listResp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	// Only the React post should be returned
	if len(listResp.Items) != 1 {
		t.Errorf("expected 1 item after search, got %d", len(listResp.Items))
	}

	if len(listResp.Items) > 0 && listResp.Items[0].ID != "post-1" {
		t.Errorf("expected post-1, got %s", listResp.Items[0].ID)
	}
}

// TestHandler_SearchByTags tests the Handler with search query parameter for tag search
func TestHandler_SearchByTags(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	posts := []domain.BlogPost{
		{
			ID:            "post-1",
			Title:         "Post One",
			ContentHTML:   "<p>Content</p>",
			Category:      "technology",
			Tags:          []string{"react", "frontend"},
			PublishStatus: domain.PublishStatusPublished,
			AuthorID:      "author-123",
			CreatedAt:     "2024-01-15T12:00:00Z",
			UpdatedAt:     testUpdatedAt,
			ImageURLs:     []string{},
		},
		{
			ID:            "post-2",
			Title:         "Post Two",
			ContentHTML:   "<p>Content</p>",
			Category:      "technology",
			Tags:          []string{"go", "backend"},
			PublishStatus: domain.PublishStatusPublished,
			AuthorID:      "author-123",
			CreatedAt:     "2024-01-14T12:00:00Z",
			UpdatedAt:     testUpdatedAt,
			ImageURLs:     []string{},
		},
	}

	var items []map[string]types.AttributeValue
	for _, post := range posts {
		av, err := attributevalue.MarshalMap(post)
		if err != nil {
			t.Fatalf("failed to marshal post: %v", err)
		}
		items = append(items, av)
	}

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			return &dynamodb.QueryOutput{
				Items: items,
				Count: int32(len(items)),
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{
			"q": "backend",
		},
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var listResp ListPostsResponseBody
	if err := json.Unmarshal([]byte(resp.Body), &listResp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	// Only the backend post should be returned
	if len(listResp.Items) != 1 {
		t.Errorf("expected 1 item after tag search, got %d", len(listResp.Items))
	}

	if len(listResp.Items) > 0 && listResp.Items[0].ID != "post-2" {
		t.Errorf("expected post-2, got %s", listResp.Items[0].ID)
	}
}

// TestHandler_SearchCaseInsensitive tests case-insensitive search
func TestHandler_SearchCaseInsensitive(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	posts := []domain.BlogPost{
		{
			ID:            "post-1",
			Title:         "Learning React Hooks",
			ContentHTML:   "<p>Content</p>",
			Category:      "technology",
			Tags:          []string{"react"},
			PublishStatus: domain.PublishStatusPublished,
			AuthorID:      "author-123",
			CreatedAt:     "2024-01-15T12:00:00Z",
			UpdatedAt:     testUpdatedAt,
			ImageURLs:     []string{},
		},
	}

	var items []map[string]types.AttributeValue
	for _, post := range posts {
		av, err := attributevalue.MarshalMap(post)
		if err != nil {
			t.Fatalf("failed to marshal post: %v", err)
		}
		items = append(items, av)
	}

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			return &dynamodb.QueryOutput{
				Items: items,
				Count: int32(len(items)),
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	// Test various case combinations
	cases := []string{"react", "REACT", "React", "ReAcT"}
	for _, q := range cases {
		t.Run("query_"+q, func(t *testing.T) {
			request := events.APIGatewayProxyRequest{
				QueryStringParameters: map[string]string{
					"q": q,
				},
			}

			resp, err := Handler(context.Background(), request)
			if err != nil {
				t.Fatalf("Handler returned unexpected error: %v", err)
			}

			if resp.StatusCode != 200 {
				t.Errorf("expected status 200, got %d", resp.StatusCode)
			}

			var listResp ListPostsResponseBody
			if err := json.Unmarshal([]byte(resp.Body), &listResp); err != nil {
				t.Fatalf("failed to unmarshal response: %v", err)
			}

			if len(listResp.Items) != 1 {
				t.Errorf("search for %q: expected 1 item, got %d", q, len(listResp.Items))
			}
		})
	}
}

// TestHandler_SearchCombinedWithCategory tests search combined with category filter
func TestHandler_SearchCombinedWithCategory(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	posts := []domain.BlogPost{
		{
			ID:            "post-1",
			Title:         "React in Technology",
			ContentHTML:   "<p>Content</p>",
			Category:      "technology",
			Tags:          []string{"react"},
			PublishStatus: domain.PublishStatusPublished,
			AuthorID:      "author-123",
			CreatedAt:     "2024-01-15T12:00:00Z",
			UpdatedAt:     testUpdatedAt,
			ImageURLs:     []string{},
		},
		{
			ID:            "post-2",
			Title:         "React in Lifestyle",
			ContentHTML:   "<p>Content</p>",
			Category:      "lifestyle",
			Tags:          []string{"react"},
			PublishStatus: domain.PublishStatusPublished,
			AuthorID:      "author-123",
			CreatedAt:     "2024-01-14T12:00:00Z",
			UpdatedAt:     testUpdatedAt,
			ImageURLs:     []string{},
		},
	}

	// Only return posts for the requested category
	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			// Verify CategoryIndex is used
			if params.IndexName == nil || *params.IndexName != "CategoryIndex" {
				t.Errorf("expected CategoryIndex to be used with category filter")
			}

			// Filter by category in mock (simulating DynamoDB behavior)
			categoryVal := params.ExpressionAttributeValues[":category"]
			category := ""
			if s, ok := categoryVal.(*types.AttributeValueMemberS); ok {
				category = s.Value
			}

			var items []map[string]types.AttributeValue
			for _, post := range posts {
				if post.Category == category {
					av, _ := attributevalue.MarshalMap(post)
					items = append(items, av)
				}
			}

			return &dynamodb.QueryOutput{
				Items: items,
				Count: int32(len(items)),
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{
			"q":        "React",
			"category": "technology",
		},
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var listResp ListPostsResponseBody
	if err := json.Unmarshal([]byte(resp.Body), &listResp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	// Only the technology React post should be returned
	if len(listResp.Items) != 1 {
		t.Errorf("expected 1 item, got %d", len(listResp.Items))
	}

	if len(listResp.Items) > 0 {
		if listResp.Items[0].ID != "post-1" {
			t.Errorf("expected post-1, got %s", listResp.Items[0].ID)
		}
		if listResp.Items[0].Category != "technology" {
			t.Errorf("expected category technology, got %s", listResp.Items[0].Category)
		}
	}
}

// TestHandler_SearchNoResults tests search with no matching results
func TestHandler_SearchNoResults(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	posts := []domain.BlogPost{
		{
			ID:            "post-1",
			Title:         "Learning Go",
			ContentHTML:   "<p>Content</p>",
			Category:      "technology",
			Tags:          []string{"go", "backend"},
			PublishStatus: domain.PublishStatusPublished,
			AuthorID:      "author-123",
			CreatedAt:     "2024-01-15T12:00:00Z",
			UpdatedAt:     testUpdatedAt,
			ImageURLs:     []string{},
		},
	}

	var items []map[string]types.AttributeValue
	for _, post := range posts {
		av, err := attributevalue.MarshalMap(post)
		if err != nil {
			t.Fatalf("failed to marshal post: %v", err)
		}
		items = append(items, av)
	}

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			return &dynamodb.QueryOutput{
				Items: items,
				Count: int32(len(items)),
			}, nil
		},
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return mockClient, nil
	}

	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{
			"q": "python",
		},
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var listResp ListPostsResponseBody
	if err := json.Unmarshal([]byte(resp.Body), &listResp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	// No results expected
	if len(listResp.Items) != 0 {
		t.Errorf("expected 0 items for non-matching search, got %d", len(listResp.Items))
	}
}
