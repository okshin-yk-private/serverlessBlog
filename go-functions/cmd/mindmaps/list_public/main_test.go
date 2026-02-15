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

const testTableName = "test-mindmaps-table"

type MockDynamoDBClient struct {
	QueryFunc func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error)
}

func (m *MockDynamoDBClient) Query(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
	if m.QueryFunc != nil {
		return m.QueryFunc(ctx, params, optFns...)
	}
	return &dynamodb.QueryOutput{}, nil
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

func TestHandler_SuccessfulListPublished(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	publishedAt := "2026-02-14T01:00:00Z"
	mindmap := domain.Mindmap{
		ID:            "mindmap-1",
		Title:         "Published Mindmap",
		Nodes:         `{"id":"root","text":"Root","children":[]}`,
		PublishStatus: "published",
		AuthorID:      "author-123",
		CreatedAt:     "2026-02-14T00:00:00Z",
		UpdatedAt:     "2026-02-14T00:00:00Z",
		PublishedAt:   &publishedAt,
	}
	av, _ := attributevalue.MarshalMap(mindmap)

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(_ context.Context, params *dynamodb.QueryInput, _ ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			// Verify GSI is used
			if params.IndexName == nil || *params.IndexName != "PublishStatusIndex" {
				t.Error("Expected PublishStatusIndex GSI")
			}
			// Verify querying for published status
			if params.ExpressionAttributeValues[":publishStatus"].(*types.AttributeValueMemberS).Value != "published" {
				t.Error("Expected publishStatus=published")
			}
			// Verify descending order
			if params.ScanIndexForward == nil || *params.ScanIndexForward != false {
				t.Error("Expected ScanIndexForward=false")
			}
			return &dynamodb.QueryOutput{
				Items: []map[string]types.AttributeValue{av},
				Count: 1,
			}, nil
		},
	}
	dynamoClientGetter = func() (DynamoDBClientInterface, error) { return mockClient, nil }

	request := events.APIGatewayProxyRequest{}

	resp, err := Handler(context.Background(), request)
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
	if result.Count != 1 {
		t.Errorf("Expected count 1, got %d", result.Count)
	}
	if len(result.Items) != 1 {
		t.Errorf("Expected 1 item, got %d", len(result.Items))
	}
	if result.Items[0].ID != "mindmap-1" {
		t.Errorf("Expected ID 'mindmap-1', got %s", result.Items[0].ID)
	}
}

func TestHandler_EmptyList(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(_ context.Context, _ *dynamodb.QueryInput, _ ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			return &dynamodb.QueryOutput{
				Items: []map[string]types.AttributeValue{},
				Count: 0,
			}, nil
		},
	}
	dynamoClientGetter = func() (DynamoDBClientInterface, error) { return mockClient, nil }

	request := events.APIGatewayProxyRequest{}

	resp, err := Handler(context.Background(), request)
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
		PublishStatus: "published",
	}
	av, _ := attributevalue.MarshalMap(mindmap)

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(_ context.Context, params *dynamodb.QueryInput, _ ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			if *params.Limit != 5 {
				t.Errorf("Expected limit 5, got %d", *params.Limit)
			}
			return &dynamodb.QueryOutput{
				Items: []map[string]types.AttributeValue{av},
				Count: 1,
				LastEvaluatedKey: map[string]types.AttributeValue{
					"id":            &types.AttributeValueMemberS{Value: "mindmap-1"},
					"publishStatus": &types.AttributeValueMemberS{Value: "published"},
					"createdAt":     &types.AttributeValueMemberS{Value: "2026-02-14T00:00:00Z"},
				},
			}, nil
		},
	}
	dynamoClientGetter = func() (DynamoDBClientInterface, error) { return mockClient, nil }

	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{"limit": "5"},
	}

	resp, err := Handler(context.Background(), request)
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

func TestHandler_NoAuthRequired(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(_ context.Context, _ *dynamodb.QueryInput, _ ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			return &dynamodb.QueryOutput{
				Items: []map[string]types.AttributeValue{},
				Count: 0,
			}, nil
		},
	}
	dynamoClientGetter = func() (DynamoDBClientInterface, error) { return mockClient, nil }

	// No auth context at all
	request := events.APIGatewayProxyRequest{}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Errorf("Expected status 200 (no auth required), got %d", resp.StatusCode)
	}
}

func TestHandler_DynamoDBError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		QueryFunc: func(_ context.Context, _ *dynamodb.QueryInput, _ ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
			return nil, errors.New("dynamodb error")
		},
	}
	dynamoClientGetter = func() (DynamoDBClientInterface, error) { return mockClient, nil }

	request := events.APIGatewayProxyRequest{}

	resp, err := Handler(context.Background(), request)
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

	request := events.APIGatewayProxyRequest{}

	resp, err := Handler(context.Background(), request)
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

	request := events.APIGatewayProxyRequest{}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 500 {
		t.Errorf("Expected status 500, got %d", resp.StatusCode)
	}
}
