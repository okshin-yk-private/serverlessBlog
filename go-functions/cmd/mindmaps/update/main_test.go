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

const (
	testTableName = "test-mindmaps-table"
	testAuthorID  = "test-author-123"
)

// MockDynamoDBClient is a mock implementation of DynamoDBClientInterface
type MockDynamoDBClient struct {
	GetItemFunc func(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error)
	PutItemFunc func(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error)
}

func (m *MockDynamoDBClient) GetItem(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
	if m.GetItemFunc != nil {
		return m.GetItemFunc(ctx, params, optFns...)
	}
	return &dynamodb.GetItemOutput{}, nil
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
	originalCodeBuildGetter := codebuildClientGetter

	return func() {
		dynamoClientGetter = originalDynamoGetter
		codebuildClientGetter = originalCodeBuildGetter
	}
}

func strPtr(s string) *string { return &s }

func existingMindmap() domain.Mindmap {
	return domain.Mindmap{
		ID:            "mindmap-123",
		Title:         "Original Title",
		Nodes:         `{"id":"root","text":"Root","children":[]}`,
		PublishStatus: "draft",
		AuthorID:      testAuthorID,
		CreatedAt:     "2026-02-14T00:00:00Z",
		UpdatedAt:     "2026-02-14T00:00:00Z",
	}
}

func makeAuthRequest(id, body string) events.APIGatewayProxyRequest {
	return events.APIGatewayProxyRequest{
		PathParameters: map[string]string{"id": id},
		Body:           body,
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{
					"sub": testAuthorID,
				},
			},
		},
	}
}

func setupMockWithExisting(t *testing.T) *MockDynamoDBClient {
	t.Helper()
	m := existingMindmap()
	av, _ := attributevalue.MarshalMap(m)
	return &MockDynamoDBClient{
		GetItemFunc: func(_ context.Context, _ *dynamodb.GetItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: av}, nil
		},
		PutItemFunc: func(_ context.Context, _ *dynamodb.PutItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			return &dynamodb.PutItemOutput{}, nil
		},
	}
}

func TestHandler_SuccessfulUpdateTitle(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := setupMockWithExisting(t)
	dynamoClientGetter = func() (DynamoDBClientInterface, error) { return mockClient, nil }

	reqBody := domain.UpdateMindmapRequest{Title: strPtr("Updated Title")}
	body, _ := json.Marshal(reqBody)

	resp, err := Handler(context.Background(), makeAuthRequest("mindmap-123", string(body)))
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
	if result.Title != "Updated Title" {
		t.Errorf("Expected Title 'Updated Title', got %s", result.Title)
	}
	if result.ID != "mindmap-123" {
		t.Errorf("Expected ID 'mindmap-123', got %s", result.ID)
	}
}

func TestHandler_SuccessfulPublishTransition(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := setupMockWithExisting(t)
	dynamoClientGetter = func() (DynamoDBClientInterface, error) { return mockClient, nil }
	codebuildClientGetter = func() (*codebuild.Client, error) { return nil, errors.New("mock") }

	reqBody := domain.UpdateMindmapRequest{PublishStatus: strPtr("published")}
	body, _ := json.Marshal(reqBody)

	resp, err := Handler(context.Background(), makeAuthRequest("mindmap-123", string(body)))
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
	if result.PublishStatus != "published" {
		t.Errorf("Expected PublishStatus 'published', got %s", result.PublishStatus)
	}
	if result.PublishedAt == nil {
		t.Error("Expected PublishedAt to be set on publish transition")
	}
}

func TestHandler_PublishedContentUpdateTriggersBuild(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	// Create a published mindmap
	m := domain.Mindmap{
		ID:            "mindmap-123",
		Title:         "Original Title",
		Nodes:         `{"id":"root","text":"Root","children":[]}`,
		PublishStatus: "published",
		AuthorID:      testAuthorID,
		CreatedAt:     "2026-02-14T00:00:00Z",
		UpdatedAt:     "2026-02-14T00:00:00Z",
	}
	av, _ := attributevalue.MarshalMap(m)

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(_ context.Context, _ *dynamodb.GetItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: av}, nil
		},
		PutItemFunc: func(_ context.Context, _ *dynamodb.PutItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			return &dynamodb.PutItemOutput{}, nil
		},
	}
	dynamoClientGetter = func() (DynamoDBClientInterface, error) { return mockClient, nil }

	buildTriggered := false
	t.Setenv("CODEBUILD_PROJECT_NAME", "test-project")
	codebuildClientGetter = func() (*codebuild.Client, error) {
		buildTriggered = true
		return nil, errors.New("mock build trigger")
	}

	// Update title only (no PublishStatus change) on a published mindmap
	reqBody := domain.UpdateMindmapRequest{Title: strPtr("Updated Title")}
	body, _ := json.Marshal(reqBody)

	resp, err := Handler(context.Background(), makeAuthRequest("mindmap-123", string(body)))
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Errorf("Expected status 200, got %d. Body: %s", resp.StatusCode, resp.Body)
	}
	if !buildTriggered {
		t.Error("Expected build to be triggered when updating published mindmap content")
	}
}

func TestHandler_ForbiddenOtherUser(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	// Create mindmap owned by a different user
	m := domain.Mindmap{
		ID:            "mindmap-123",
		Title:         "Original Title",
		Nodes:         `{"id":"root","text":"Root","children":[]}`,
		PublishStatus: "draft",
		AuthorID:      "other-author-456",
		CreatedAt:     "2026-02-14T00:00:00Z",
		UpdatedAt:     "2026-02-14T00:00:00Z",
	}
	av, _ := attributevalue.MarshalMap(m)

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(_ context.Context, _ *dynamodb.GetItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: av}, nil
		},
	}
	dynamoClientGetter = func() (DynamoDBClientInterface, error) { return mockClient, nil }

	reqBody := domain.UpdateMindmapRequest{Title: strPtr("Hacked Title")}
	body, _ := json.Marshal(reqBody)

	resp, err := Handler(context.Background(), makeAuthRequest("mindmap-123", string(body)))
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

	reqBody := domain.UpdateMindmapRequest{Title: strPtr("New")}
	body, _ := json.Marshal(reqBody)

	resp, err := Handler(context.Background(), makeAuthRequest("nonexistent", string(body)))
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
		Body:           `{"title":"New"}`,
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
		Body:           `{"title":"New"}`,
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

func TestHandler_EmptyBody(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	resp, err := Handler(context.Background(), makeAuthRequest("test-id", ""))
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 400 {
		t.Errorf("Expected status 400, got %d", resp.StatusCode)
	}
}

func TestHandler_InvalidJSON(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	resp, err := Handler(context.Background(), makeAuthRequest("test-id", "invalid json"))
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 400 {
		t.Errorf("Expected status 400, got %d", resp.StatusCode)
	}
}

func TestHandler_ValidationError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	// Empty title is invalid in update
	reqBody := domain.UpdateMindmapRequest{Title: strPtr("")}
	body, _ := json.Marshal(reqBody)

	resp, err := Handler(context.Background(), makeAuthRequest("test-id", string(body)))
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 400 {
		t.Errorf("Expected status 400, got %d. Body: %s", resp.StatusCode, resp.Body)
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

	reqBody := domain.UpdateMindmapRequest{Title: strPtr("New")}
	body, _ := json.Marshal(reqBody)

	resp, err := Handler(context.Background(), makeAuthRequest("test-id", string(body)))
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 500 {
		t.Errorf("Expected status 500, got %d", resp.StatusCode)
	}
}

func TestHandler_DynamoDBPutError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	m := existingMindmap()
	av, _ := attributevalue.MarshalMap(m)

	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(_ context.Context, _ *dynamodb.GetItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{Item: av}, nil
		},
		PutItemFunc: func(_ context.Context, _ *dynamodb.PutItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error) {
			return nil, errors.New("put error")
		},
	}
	dynamoClientGetter = func() (DynamoDBClientInterface, error) { return mockClient, nil }

	reqBody := domain.UpdateMindmapRequest{Title: strPtr("New")}
	body, _ := json.Marshal(reqBody)

	resp, err := Handler(context.Background(), makeAuthRequest("mindmap-123", string(body)))
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

	reqBody := domain.UpdateMindmapRequest{Title: strPtr("New")}
	body, _ := json.Marshal(reqBody)

	resp, err := Handler(context.Background(), makeAuthRequest("test-id", string(body)))
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

	reqBody := domain.UpdateMindmapRequest{Title: strPtr("New")}
	body, _ := json.Marshal(reqBody)

	resp, err := Handler(context.Background(), makeAuthRequest("test-id", string(body)))
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 500 {
		t.Errorf("Expected status 500, got %d", resp.StatusCode)
	}
}

func TestHandler_UpdateNodes(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	mockClient := setupMockWithExisting(t)
	dynamoClientGetter = func() (DynamoDBClientInterface, error) { return mockClient, nil }

	newNodes := `{"id":"root","text":"Updated Root","children":[{"id":"c1","text":"Child","children":[]}]}`
	reqBody := domain.UpdateMindmapRequest{Nodes: &newNodes}
	body, _ := json.Marshal(reqBody)

	resp, err := Handler(context.Background(), makeAuthRequest("mindmap-123", string(body)))
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
	if result.Nodes != newNodes {
		t.Errorf("Expected updated nodes, got %s", result.Nodes)
	}
}

func TestHandler_UnmarshalExistingError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	// Return an item with wrong types that will cause unmarshal failure
	mockClient := &MockDynamoDBClient{
		GetItemFunc: func(_ context.Context, _ *dynamodb.GetItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
			return &dynamodb.GetItemOutput{
				Item: map[string]types.AttributeValue{
					"id":    &types.AttributeValueMemberS{Value: "test"},
					"title": &types.AttributeValueMemberL{Value: []types.AttributeValue{}}, // Wrong type
				},
			}, nil
		},
	}
	dynamoClientGetter = func() (DynamoDBClientInterface, error) { return mockClient, nil }

	reqBody := domain.UpdateMindmapRequest{Title: strPtr("New")}
	body, _ := json.Marshal(reqBody)

	resp, err := Handler(context.Background(), makeAuthRequest("test-id", string(body)))
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 500 {
		t.Errorf("Expected status 500, got %d", resp.StatusCode)
	}
}
