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

const (
	testTableName = "test-mindmaps-table"
	testAuthorID  = "test-author-123"
)

// MockDynamoDBClient is a mock implementation of DynamoDBClientInterface
type MockDynamoDBClient struct {
	ScanFunc func(ctx context.Context, params *dynamodb.ScanInput, optFns ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error)
}

func (m *MockDynamoDBClient) Scan(ctx context.Context, params *dynamodb.ScanInput, optFns ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
	if m.ScanFunc != nil {
		return m.ScanFunc(ctx, params, optFns...)
	}
	return &dynamodb.ScanOutput{}, nil
}

func setupTest(t *testing.T) func() {
	t.Helper()
	t.Setenv("TABLE_NAME", testTableName)
	t.Setenv("AWS_REGION", "ap-northeast-1")

	originalDynamoGetter := dynamoClientGetter
	return func() {
		dynamoClientGetter = originalDynamoGetter
	}
}

func makeAuthRequest(queryParams map[string]string) events.APIGatewayProxyRequest {
	return events.APIGatewayProxyRequest{
		QueryStringParameters: queryParams,
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{
					"sub": testAuthorID,
				},
			},
		},
	}
}

func TestHandler_SuccessfulList(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mindmap1 := domain.Mindmap{
		ID:            "mindmap-1",
		Title:         "First Mindmap",
		Nodes:         `{"id":"root","text":"Root","children":[]}`,
		PublishStatus: "draft",
		AuthorID:      testAuthorID,
		CreatedAt:     "2026-02-14T00:00:00Z",
		UpdatedAt:     "2026-02-14T00:00:00Z",
	}
	mindmap2 := domain.Mindmap{
		ID:            "mindmap-2",
		Title:         "Second Mindmap",
		Nodes:         `{"id":"root","text":"Root","children":[]}`,
		PublishStatus: "published",
		AuthorID:      testAuthorID,
		CreatedAt:     "2026-02-14T01:00:00Z",
		UpdatedAt:     "2026-02-14T01:00:00Z",
	}
	av1, _ := attributevalue.MarshalMap(mindmap1)
	av2, _ := attributevalue.MarshalMap(mindmap2)

	mockClient := &MockDynamoDBClient{
		ScanFunc: func(_ context.Context, params *dynamodb.ScanInput, _ ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
			if *params.TableName != testTableName {
				t.Errorf("Expected table name %s, got %s", testTableName, *params.TableName)
			}
			// Verify author filter is applied
			if params.FilterExpression == nil || *params.FilterExpression != "authorId = :authorId" {
				t.Error("Expected FilterExpression for authorId")
			}
			authorVal, ok := params.ExpressionAttributeValues[":authorId"]
			if !ok {
				t.Error("Expected :authorId in ExpressionAttributeValues")
			} else if s, ok := authorVal.(*types.AttributeValueMemberS); !ok || s.Value != testAuthorID {
				t.Errorf("Expected authorId=%s, got %v", testAuthorID, authorVal)
			}
			return &dynamodb.ScanOutput{
				Items: []map[string]types.AttributeValue{av1, av2},
				Count: 2,
			}, nil
		},
	}
	dynamoClientGetter = func() (DynamoDBClientInterface, error) { return mockClient, nil }

	resp, err := Handler(context.Background(), makeAuthRequest(nil))
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Errorf("Expected status 200, got %d. Body: %s", resp.StatusCode, resp.Body)
	}

	var result domain.ListMindmapsResponse
	if err := json.Unmarshal([]byte(resp.Body), &result); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}
	if result.Count != 2 {
		t.Errorf("Expected count 2, got %d", result.Count)
	}
	if len(result.Items) != 2 {
		t.Errorf("Expected 2 items, got %d", len(result.Items))
	}
	if result.NextToken != nil {
		t.Error("Expected NextToken to be nil")
	}
}

func TestHandler_EmptyList(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		ScanFunc: func(_ context.Context, _ *dynamodb.ScanInput, _ ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
			return &dynamodb.ScanOutput{
				Items: []map[string]types.AttributeValue{},
				Count: 0,
			}, nil
		},
	}
	dynamoClientGetter = func() (DynamoDBClientInterface, error) { return mockClient, nil }

	resp, err := Handler(context.Background(), makeAuthRequest(nil))
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}

	var result domain.ListMindmapsResponse
	if err := json.Unmarshal([]byte(resp.Body), &result); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}
	if result.Count != 0 {
		t.Errorf("Expected count 0, got %d", result.Count)
	}
}

func TestHandler_WithPagination(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mindmap := domain.Mindmap{
		ID:            "mindmap-1",
		Title:         "First Mindmap",
		PublishStatus: "draft",
	}
	av, _ := attributevalue.MarshalMap(mindmap)

	mockClient := &MockDynamoDBClient{
		ScanFunc: func(_ context.Context, params *dynamodb.ScanInput, _ ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
			if *params.Limit != 5 {
				t.Errorf("Expected limit 5, got %d", *params.Limit)
			}
			return &dynamodb.ScanOutput{
				Items: []map[string]types.AttributeValue{av},
				Count: 1,
				LastEvaluatedKey: map[string]types.AttributeValue{
					"id": &types.AttributeValueMemberS{Value: "mindmap-1"},
				},
			}, nil
		},
	}
	dynamoClientGetter = func() (DynamoDBClientInterface, error) { return mockClient, nil }

	resp, err := Handler(context.Background(), makeAuthRequest(map[string]string{"limit": "5"}))
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}

	var result domain.ListMindmapsResponse
	if err := json.Unmarshal([]byte(resp.Body), &result); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}
	if result.NextToken == nil {
		t.Error("Expected NextToken to be set")
	}
}

func TestHandler_Unauthorized(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	request := events.APIGatewayProxyRequest{}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 401 {
		t.Errorf("Expected status 401, got %d", resp.StatusCode)
	}
}

func TestHandler_DynamoDBError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		ScanFunc: func(_ context.Context, _ *dynamodb.ScanInput, _ ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
			return nil, errors.New("dynamodb error")
		},
	}
	dynamoClientGetter = func() (DynamoDBClientInterface, error) { return mockClient, nil }

	resp, err := Handler(context.Background(), makeAuthRequest(nil))
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 500 {
		t.Errorf("Expected status 500, got %d", resp.StatusCode)
	}
}

func TestHandler_DynamoClientError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return nil, errors.New("client init error")
	}

	resp, err := Handler(context.Background(), makeAuthRequest(nil))
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 500 {
		t.Errorf("Expected status 500, got %d", resp.StatusCode)
	}
}

func TestHandler_MissingTableName(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	t.Setenv("TABLE_NAME", "")

	resp, err := Handler(context.Background(), makeAuthRequest(nil))
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 500 {
		t.Errorf("Expected status 500, got %d", resp.StatusCode)
	}
}

func TestParseLimit(t *testing.T) {
	tests := []struct {
		input    string
		expected int32
	}{
		{"", DefaultLimit},
		{"5", 5},
		{"100", 100},
		{"0", DefaultLimit},
		{"101", DefaultLimit},
		{"-1", DefaultLimit},
		{"abc", DefaultLimit},
	}

	for _, tt := range tests {
		result := parseLimit(tt.input)
		if result != tt.expected {
			t.Errorf("parseLimit(%q) = %d, expected %d", tt.input, result, tt.expected)
		}
	}
}
