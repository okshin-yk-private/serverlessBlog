package main

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/aws/aws-lambda-go/events"
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
	PutItemFunc func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error)
}

func (m *MockDynamoDBClient) PutItem(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
	if m.PutItemFunc != nil {
		return m.PutItemFunc(ctx, params, optFns...)
	}
	return &dynamodb.PutItemOutput{}, nil
}

func setupTest(t *testing.T) func() {
	t.Helper()
	t.Setenv("TABLE_NAME", testTableName)
	t.Setenv("AWS_REGION", "ap-northeast-1")

	originalDynamoGetter := dynamoClientGetter
	originalUUIDGenerator := uuidGenerator
	originalCodeBuildGetter := codebuildClientGetter

	return func() {
		dynamoClientGetter = originalDynamoGetter
		uuidGenerator = originalUUIDGenerator
		codebuildClientGetter = originalCodeBuildGetter
	}
}

func makeAuthRequest(body string) events.APIGatewayProxyRequest {
	return events.APIGatewayProxyRequest{
		Body: body,
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{
					"sub": testAuthorID,
				},
			},
		},
	}
}

func TestHandler_SuccessfulCreateDraftMindmap(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		PutItemFunc: func(_ context.Context, params *dynamodb.PutItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			if *params.TableName != testTableName {
				t.Errorf("Expected table name %s, got %s", testTableName, *params.TableName)
			}
			return &dynamodb.PutItemOutput{}, nil
		},
	}
	dynamoClientGetter = func() (DynamoDBClientInterface, error) { return mockClient, nil }
	uuidGenerator = func() string { return "test-uuid-123" }

	reqBody := domain.CreateMindmapRequest{
		Title:         "Test Mindmap",
		Nodes:         `{"id":"root","text":"Root","children":[]}`,
		PublishStatus: "draft",
	}
	body, _ := json.Marshal(reqBody)

	resp, err := Handler(context.Background(), makeAuthRequest(string(body)))
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 201 {
		t.Errorf("Expected status 201, got %d. Body: %s", resp.StatusCode, resp.Body)
	}

	var mindmap domain.Mindmap
	if err := json.Unmarshal([]byte(resp.Body), &mindmap); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}
	if mindmap.ID != "test-uuid-123" {
		t.Errorf("Expected ID 'test-uuid-123', got %s", mindmap.ID)
	}
	if mindmap.Title != "Test Mindmap" {
		t.Errorf("Expected Title 'Test Mindmap', got %s", mindmap.Title)
	}
	if mindmap.PublishStatus != "draft" {
		t.Errorf("Expected PublishStatus 'draft', got %s", mindmap.PublishStatus)
	}
	if mindmap.AuthorID != testAuthorID {
		t.Errorf("Expected AuthorID %s, got %s", testAuthorID, mindmap.AuthorID)
	}
	if mindmap.PublishedAt != nil {
		t.Error("Expected PublishedAt to be nil for draft")
	}
}

func TestHandler_SuccessfulCreatePublishedMindmap(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{}
	dynamoClientGetter = func() (DynamoDBClientInterface, error) { return mockClient, nil }
	uuidGenerator = func() string { return "test-uuid-456" }

	// Mock CodeBuild client to suppress build trigger
	codebuildClientGetter = func() (*codebuild.Client, error) {
		return nil, errors.New("mock: no codebuild")
	}

	reqBody := domain.CreateMindmapRequest{
		Title:         "Published Mindmap",
		Nodes:         `{"id":"root","text":"Root","children":[]}`,
		PublishStatus: "published",
	}
	body, _ := json.Marshal(reqBody)

	resp, err := Handler(context.Background(), makeAuthRequest(string(body)))
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 201 {
		t.Errorf("Expected status 201, got %d. Body: %s", resp.StatusCode, resp.Body)
	}

	var mindmap domain.Mindmap
	if err := json.Unmarshal([]byte(resp.Body), &mindmap); err != nil {
		t.Fatalf("Failed to unmarshal response: %v", err)
	}
	if mindmap.PublishStatus != "published" {
		t.Errorf("Expected PublishStatus 'published', got %s", mindmap.PublishStatus)
	}
	if mindmap.PublishedAt == nil {
		t.Error("Expected PublishedAt to be set for published mindmap")
	}
}

func TestHandler_Unauthorized(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	request := events.APIGatewayProxyRequest{
		Body: `{"title":"Test","nodes":"{}","publishStatus":"draft"}`,
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 401 {
		t.Errorf("Expected status 401, got %d", resp.StatusCode)
	}
}

func TestHandler_InvalidRequestBody(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	resp, err := Handler(context.Background(), makeAuthRequest("invalid json"))
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 400 {
		t.Errorf("Expected status 400, got %d", resp.StatusCode)
	}
}

func TestHandler_ValidationError_MissingTitle(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	reqBody := domain.CreateMindmapRequest{
		Title:         "",
		Nodes:         `{"id":"root","text":"Root","children":[]}`,
		PublishStatus: "draft",
	}
	body, _ := json.Marshal(reqBody)

	resp, err := Handler(context.Background(), makeAuthRequest(string(body)))
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 400 {
		t.Errorf("Expected status 400, got %d. Body: %s", resp.StatusCode, resp.Body)
	}
}

func TestHandler_ValidationError_InvalidPublishStatus(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	body := `{"title":"Test","nodes":"{\"id\":\"root\",\"text\":\"Root\",\"children\":[]}","publishStatus":"archived"}`

	resp, err := Handler(context.Background(), makeAuthRequest(body))
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 400 {
		t.Errorf("Expected status 400, got %d. Body: %s", resp.StatusCode, resp.Body)
	}
}

func TestHandler_DynamoDBError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := &MockDynamoDBClient{
		PutItemFunc: func(_ context.Context, _ *dynamodb.PutItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			return nil, errors.New("dynamodb error")
		},
	}
	dynamoClientGetter = func() (DynamoDBClientInterface, error) { return mockClient, nil }
	uuidGenerator = func() string { return "test-uuid" }

	reqBody := domain.CreateMindmapRequest{
		Title:         "Test",
		Nodes:         `{"id":"root","text":"Root","children":[]}`,
		PublishStatus: "draft",
	}
	body, _ := json.Marshal(reqBody)

	resp, err := Handler(context.Background(), makeAuthRequest(string(body)))
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

	reqBody := domain.CreateMindmapRequest{
		Title:         "Test",
		Nodes:         `{"id":"root","text":"Root","children":[]}`,
		PublishStatus: "draft",
	}
	body, _ := json.Marshal(reqBody)

	resp, err := Handler(context.Background(), makeAuthRequest(string(body)))
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

	reqBody := domain.CreateMindmapRequest{
		Title:         "Test",
		Nodes:         `{"id":"root","text":"Root","children":[]}`,
		PublishStatus: "draft",
	}
	body, _ := json.Marshal(reqBody)

	resp, err := Handler(context.Background(), makeAuthRequest(string(body)))
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 500 {
		t.Errorf("Expected status 500, got %d", resp.StatusCode)
	}
}
