package main

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"

	"serverless-blog/go-functions/internal/domain"
)

const testTableName = "test-mindmaps-table"

type MockDynamoDBClient struct {
	GetItemFunc func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error)
}

func (m *MockDynamoDBClient) GetItem(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
	if m.GetItemFunc != nil {
		return m.GetItemFunc(ctx, params, optFns...)
	}
	return &dynamodb.GetItemOutput{}, nil
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

func TestHandler_SuccessfulGetPublished(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	publishedAt := "2026-02-14T01:00:00Z"
	mindmap := domain.Mindmap{
		ID:            "mindmap-123",
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
		GetItemFunc: func(_ context.Context, _ *dynamodb.GetItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: av}, nil
		},
	}
	dynamoClientGetter = func() (DynamoDBClientInterface, error) { return mockClient, nil }

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{"id": "mindmap-123"},
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Errorf("Expected status 200, got %d. Body: %s", resp.StatusCode, resp.Body)
	}

	var result domain.Mindmap
	if err := json.Unmarshal([]byte(resp.Body), &result); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}
	if result.ID != "mindmap-123" {
		t.Errorf("Expected ID 'mindmap-123', got %s", result.ID)
	}
}

func TestHandler_DraftMindmapReturns404(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mindmap := domain.Mindmap{
		ID:            "mindmap-draft",
		Title:         "Draft Mindmap",
		PublishStatus: "draft",
	}
	av, _ := attributevalue.MarshalMap(mindmap)

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(_ context.Context, _ *dynamodb.GetItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: av}, nil
		},
	}
	dynamoClientGetter = func() (DynamoDBClientInterface, error) { return mockClient, nil }

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{"id": "mindmap-draft"},
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 404 {
		t.Errorf("Expected status 404, got %d", resp.StatusCode)
	}
}

func TestHandler_NotFound(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(_ context.Context, _ *dynamodb.GetItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: nil}, nil
		},
	}
	dynamoClientGetter = func() (DynamoDBClientInterface, error) { return mockClient, nil }

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{"id": "nonexistent"},
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 404 {
		t.Errorf("Expected status 404, got %d", resp.StatusCode)
	}
}

func TestHandler_MissingID(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{},
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 400 {
		t.Errorf("Expected status 400, got %d", resp.StatusCode)
	}
}

func TestHandler_DynamoDBError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(_ context.Context, _ *dynamodb.GetItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return nil, errors.New("dynamodb error")
		},
	}
	dynamoClientGetter = func() (DynamoDBClientInterface, error) { return mockClient, nil }

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{"id": "test-id"},
	}

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

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{"id": "test-id"},
	}

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

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{"id": "test-id"},
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 500 {
		t.Errorf("Expected status 500, got %d", resp.StatusCode)
	}
}

func TestHandler_NoAuthRequired(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	publishedAt := "2026-02-14T01:00:00Z"
	mindmap := domain.Mindmap{
		ID:            "mindmap-pub",
		Title:         "Public Mindmap",
		PublishStatus: "published",
		PublishedAt:   &publishedAt,
	}
	av, _ := attributevalue.MarshalMap(mindmap)

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(_ context.Context, _ *dynamodb.GetItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: av}, nil
		},
	}
	dynamoClientGetter = func() (DynamoDBClientInterface, error) { return mockClient, nil }

	// Request without any auth context
	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{"id": "mindmap-pub"},
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Errorf("Expected status 200 (no auth required), got %d", resp.StatusCode)
	}
}
