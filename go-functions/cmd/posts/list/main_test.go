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
func createTestPost(id string, status string, category string, createdAt string) domain.BlogPost {
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
		name                  string
		queryParams           map[string]string
		expectedIndexName     string
		expectFilterExpression bool
	}{
		{
			name:                  "no category - use PublishStatusIndex",
			queryParams:           map[string]string{},
			expectedIndexName:     "PublishStatusIndex",
			expectFilterExpression: false,
		},
		{
			name:                  "with category - use CategoryIndex",
			queryParams:           map[string]string{"category": "technology"},
			expectedIndexName:     "CategoryIndex",
			expectFilterExpression: true,
		},
		{
			name:                  "with category and limit",
			queryParams:           map[string]string{"category": "lifestyle", "limit": "5"},
			expectedIndexName:     "CategoryIndex",
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
