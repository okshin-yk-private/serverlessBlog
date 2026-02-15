package main

import (
	"context"
	"errors"
	"testing"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/codebuild"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"

	"serverless-blog/go-functions/internal/domain"
)

const (
	testTableName = "test-mindmaps-table"
	testAuthorID  = "test-author-123"
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
	return &dynamodb.GetItemOutput{}, nil
}

func (m *MockDynamoDBClient) DeleteItem(ctx context.Context, params *dynamodb.DeleteItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.DeleteItemOutput, error) {
	if m.DeleteItemFunc != nil {
		return m.DeleteItemFunc(ctx, params, optFns...)
	}
	return &dynamodb.DeleteItemOutput{}, nil
}

func setupTest(t *testing.T) func() {
	t.Helper()
	t.Setenv("TABLE_NAME", testTableName)
	t.Setenv("AWS_REGION", "ap-northeast-1")

	originalDynamoGetter := dynamoClientGetter
	originalCodeBuildGetter := codebuildClientGetter

	return func() {
		dynamoClientGetter = originalDynamoGetter
		codebuildClientGetter = originalCodeBuildGetter
	}
}

func makeAuthRequest(id string) events.APIGatewayProxyRequest {
	return events.APIGatewayProxyRequest{
		PathParameters: map[string]string{"id": id},
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{
					"sub": testAuthorID,
				},
			},
		},
	}
}

func TestHandler_SuccessfulDeleteDraft(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mindmap := domain.Mindmap{
		ID:            "mindmap-123",
		Title:         "Test Mindmap",
		PublishStatus: "draft",
		AuthorID:      testAuthorID,
	}
	av, _ := attributevalue.MarshalMap(mindmap)

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(_ context.Context, _ *dynamodb.GetItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: av}, nil
		},
		DeleteItemFunc: func(_ context.Context, params *dynamodb.DeleteItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.DeleteItemOutput, error) {
			if *params.TableName != testTableName {
				t.Errorf("Expected table name %s, got %s", testTableName, *params.TableName)
			}
			return &dynamodb.DeleteItemOutput{}, nil
		},
	}
	dynamoClientGetter = func() (DynamoDBClientInterface, error) { return mockClient, nil }

	resp, err := Handler(context.Background(), makeAuthRequest("mindmap-123"))
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 204 {
		t.Errorf("Expected status 204, got %d", resp.StatusCode)
	}
	if resp.Body != "" {
		t.Errorf("Expected empty body, got %s", resp.Body)
	}
}

func TestHandler_SuccessfulDeletePublished(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mindmap := domain.Mindmap{
		ID:            "mindmap-123",
		Title:         "Published Mindmap",
		PublishStatus: "published",
		AuthorID:      testAuthorID,
	}
	av, _ := attributevalue.MarshalMap(mindmap)

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(_ context.Context, _ *dynamodb.GetItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: av}, nil
		},
	}
	dynamoClientGetter = func() (DynamoDBClientInterface, error) { return mockClient, nil }
	codebuildClientGetter = func() (*codebuild.Client, error) { return nil, errors.New("mock") }

	resp, err := Handler(context.Background(), makeAuthRequest("mindmap-123"))
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 204 {
		t.Errorf("Expected status 204, got %d", resp.StatusCode)
	}
}

func TestHandler_ForbiddenOtherUser(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mindmap := domain.Mindmap{
		ID:            "mindmap-123",
		Title:         "Other's Mindmap",
		PublishStatus: "draft",
		AuthorID:      "other-author-456",
	}
	av, _ := attributevalue.MarshalMap(mindmap)

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(_ context.Context, _ *dynamodb.GetItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: av}, nil
		},
	}
	dynamoClientGetter = func() (DynamoDBClientInterface, error) { return mockClient, nil }

	resp, err := Handler(context.Background(), makeAuthRequest("mindmap-123"))
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 403 {
		t.Errorf("Expected status 403, got %d. Body: %s", resp.StatusCode, resp.Body)
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

	resp, err := Handler(context.Background(), makeAuthRequest("nonexistent"))
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 404 {
		t.Errorf("Expected status 404, got %d", resp.StatusCode)
	}
}

func TestHandler_Unauthorized(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{"id": "test-id"},
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 401 {
		t.Errorf("Expected status 401, got %d", resp.StatusCode)
	}
}

func TestHandler_MissingID(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{},
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{"sub": testAuthorID},
			},
		},
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 400 {
		t.Errorf("Expected status 400, got %d", resp.StatusCode)
	}
}

func TestHandler_DynamoDBGetError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(_ context.Context, _ *dynamodb.GetItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return nil, errors.New("dynamodb error")
		},
	}
	dynamoClientGetter = func() (DynamoDBClientInterface, error) { return mockClient, nil }

	resp, err := Handler(context.Background(), makeAuthRequest("test-id"))
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 500 {
		t.Errorf("Expected status 500, got %d", resp.StatusCode)
	}
}

func TestHandler_DynamoDBDeleteError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mindmap := domain.Mindmap{
		ID:            "mindmap-123",
		PublishStatus: "draft",
		AuthorID:      testAuthorID,
	}
	av, _ := attributevalue.MarshalMap(mindmap)

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(_ context.Context, _ *dynamodb.GetItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: av}, nil
		},
		DeleteItemFunc: func(_ context.Context, _ *dynamodb.DeleteItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.DeleteItemOutput, error) {
			return nil, errors.New("delete error")
		},
	}
	dynamoClientGetter = func() (DynamoDBClientInterface, error) { return mockClient, nil }

	resp, err := Handler(context.Background(), makeAuthRequest("mindmap-123"))
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

	resp, err := Handler(context.Background(), makeAuthRequest("test-id"))
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

	resp, err := Handler(context.Background(), makeAuthRequest("test-id"))
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 500 {
		t.Errorf("Expected status 500, got %d", resp.StatusCode)
	}
}
