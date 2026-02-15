// Package main provides integration tests for the UpdateMindmap Lambda function.
//
// These tests verify mindmap update operations with DynamoDB Local, including:
// - Update title and nodes
// - Draft to published transition (publishedAt set)
// - 404 for non-existent mindmap
// - Validation errors during update
//
// Requirements: 1.4, 4.5, 4.6, 8.4, 8.8, 9.6
//
// To run these integration tests:
//   INTEGRATION_TEST=true go test -v -tags=integration ./go-functions/cmd/mindmaps/update/...
//
//go:build integration
// +build integration

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"serverless-blog/go-functions/internal/domain"
)

const (
	integrationTableName  = "test-mindmaps-update-integration"
	dynamoDBLocalEndpoint = "http://localhost:8000"
	integrationAuthorID   = "integration-author-123"
)

// TestIntegration_UpdateTitle tests updating a mindmap's title
// Requirement 1.4, 8.4: Update mindmap fields
func TestIntegration_UpdateTitle(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") != "true" {
		t.Skip("Skipping integration test: set INTEGRATION_TEST=true to run")
	}

	ctx := context.Background()
	client := setupIntegrationTest(t, ctx)
	defer cleanupIntegrationTest(t, ctx, client)

	seedTestMindmaps(t, ctx, client)

	newTitle := "Updated Title"
	reqBody := domain.UpdateMindmapRequest{
		Title: &newTitle,
	}
	body, _ := json.Marshal(reqBody)

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{"id": "mindmap-draft-1"},
		Body:           string(body),
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{"sub": integrationAuthorID},
			},
		},
	}

	resp, err := Handler(ctx, request)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("expected status 200, got %d: %s", resp.StatusCode, resp.Body)
	}

	var mindmap domain.Mindmap
	if err := json.Unmarshal([]byte(resp.Body), &mindmap); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}
	if mindmap.Title != "Updated Title" {
		t.Errorf("expected title 'Updated Title', got %q", mindmap.Title)
	}

	// Verify data updated in DynamoDB
	getOutput, err := client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(integrationTableName),
		Key: map[string]types.AttributeValue{
			"id": &types.AttributeValueMemberS{Value: "mindmap-draft-1"},
		},
	})
	if err != nil {
		t.Fatalf("failed to get item: %v", err)
	}
	var stored domain.Mindmap
	if err := attributevalue.UnmarshalMap(getOutput.Item, &stored); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}
	if stored.Title != "Updated Title" {
		t.Errorf("stored title not updated: got %q", stored.Title)
	}
}

// TestIntegration_UpdateDraftToPublished tests the draft→published transition
// Requirement 1.4: PublishedAt should be set on publish transition
func TestIntegration_UpdateDraftToPublished(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") != "true" {
		t.Skip("Skipping integration test: set INTEGRATION_TEST=true to run")
	}

	ctx := context.Background()
	client := setupIntegrationTest(t, ctx)
	defer cleanupIntegrationTest(t, ctx, client)

	seedTestMindmaps(t, ctx, client)

	publishedStatus := "published"
	reqBody := domain.UpdateMindmapRequest{
		PublishStatus: &publishedStatus,
	}
	body, _ := json.Marshal(reqBody)

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{"id": "mindmap-draft-1"},
		Body:           string(body),
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{"sub": integrationAuthorID},
			},
		},
	}

	resp, err := Handler(ctx, request)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("expected status 200, got %d: %s", resp.StatusCode, resp.Body)
	}

	var mindmap domain.Mindmap
	if err := json.Unmarshal([]byte(resp.Body), &mindmap); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}
	if mindmap.PublishStatus != "published" {
		t.Errorf("expected publishStatus 'published', got %q", mindmap.PublishStatus)
	}
	if mindmap.PublishedAt == nil {
		t.Error("expected publishedAt to be set after draft→published transition")
	}

	// Verify in DynamoDB
	getOutput, err := client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(integrationTableName),
		Key: map[string]types.AttributeValue{
			"id": &types.AttributeValueMemberS{Value: "mindmap-draft-1"},
		},
	})
	if err != nil {
		t.Fatalf("failed to get item: %v", err)
	}
	var stored domain.Mindmap
	if err := attributevalue.UnmarshalMap(getOutput.Item, &stored); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}
	if stored.PublishStatus != "published" {
		t.Errorf("stored publishStatus not updated: got %q", stored.PublishStatus)
	}
	if stored.PublishedAt == nil {
		t.Error("stored publishedAt should be set")
	}
}

// TestIntegration_UpdateNonExistent tests 404 for updating a non-existent mindmap
// Requirement 8.8: Return 404 for non-existent ID
func TestIntegration_UpdateNonExistent(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") != "true" {
		t.Skip("Skipping integration test: set INTEGRATION_TEST=true to run")
	}

	ctx := context.Background()
	client := setupIntegrationTest(t, ctx)
	defer cleanupIntegrationTest(t, ctx, client)

	newTitle := "Updated"
	reqBody := domain.UpdateMindmapRequest{Title: &newTitle}
	body, _ := json.Marshal(reqBody)

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{"id": "non-existent-id"},
		Body:           string(body),
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{"sub": integrationAuthorID},
			},
		},
	}

	resp, err := Handler(ctx, request)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 404 {
		t.Errorf("expected status 404 for non-existent mindmap, got %d: %s", resp.StatusCode, resp.Body)
	}
}

// TestIntegration_UpdateValidationError tests node validation during update
// Requirement 4.6: Node ID/text validation on update
func TestIntegration_UpdateValidationError(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") != "true" {
		t.Skip("Skipping integration test: set INTEGRATION_TEST=true to run")
	}

	ctx := context.Background()
	client := setupIntegrationTest(t, ctx)
	defer cleanupIntegrationTest(t, ctx, client)

	seedTestMindmaps(t, ctx, client)

	invalidNodes := `{"id":"","text":"Root","children":[]}`
	reqBody := domain.UpdateMindmapRequest{
		Nodes: &invalidNodes,
	}
	body, _ := json.Marshal(reqBody)

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{"id": "mindmap-draft-1"},
		Body:           string(body),
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{"sub": integrationAuthorID},
			},
		},
	}

	resp, err := Handler(ctx, request)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 400 {
		t.Errorf("expected status 400 for validation error, got %d: %s", resp.StatusCode, resp.Body)
	}
}

// TestIntegration_UpdateValidationError_NodeCountExceed tests node count validation during update
// Requirement 4.6: Node count must not exceed 500
func TestIntegration_UpdateValidationError_NodeCountExceed(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") != "true" {
		t.Skip("Skipping integration test: set INTEGRATION_TEST=true to run")
	}

	ctx := context.Background()
	client := setupIntegrationTest(t, ctx)
	defer cleanupIntegrationTest(t, ctx, client)

	seedTestMindmaps(t, ctx, client)

	// Generate a tree with 501 nodes
	root := generateLargeNodeTree(501)
	nodesJSON, _ := json.Marshal(root)
	nodesStr := string(nodesJSON)

	reqBody := domain.UpdateMindmapRequest{
		Nodes: &nodesStr,
	}
	body, _ := json.Marshal(reqBody)

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{"id": "mindmap-draft-1"},
		Body:           string(body),
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{"sub": integrationAuthorID},
			},
		},
	}

	resp, err := Handler(ctx, request)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 400 {
		t.Fatalf("expected status 400 for node count exceed, got %d: %s", resp.StatusCode, resp.Body)
	}

	var errResp domain.ErrorResponse
	if err := json.Unmarshal([]byte(resp.Body), &errResp); err != nil {
		t.Fatalf("failed to parse error response: %v", err)
	}
	if errResp.Message != "mindmap exceeds maximum node count of 500" {
		t.Errorf("expected node count error message, got %q", errResp.Message)
	}
}

// TestIntegration_UpdateValidationError_SizeExceed tests nodes JSON size validation during update
// Requirement 4.5: Nodes JSON size must not exceed 350KB
func TestIntegration_UpdateValidationError_SizeExceed(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") != "true" {
		t.Skip("Skipping integration test: set INTEGRATION_TEST=true to run")
	}

	ctx := context.Background()
	client := setupIntegrationTest(t, ctx)
	defer cleanupIntegrationTest(t, ctx, client)

	seedTestMindmaps(t, ctx, client)

	// Generate nodes JSON that exceeds 350KB
	largeText := strings.Repeat("x", 1000)
	root := domain.MindmapNode{
		ID: "root", Text: "Root",
		Children: make([]domain.MindmapNode, 0, 400),
	}
	for i := 0; i < 400; i++ {
		root.Children = append(root.Children, domain.MindmapNode{
			ID:       fmt.Sprintf("node-%d", i),
			Text:     largeText,
			Children: []domain.MindmapNode{},
		})
	}
	nodesJSON, _ := json.Marshal(root)
	nodesStr := string(nodesJSON)

	reqBody := domain.UpdateMindmapRequest{
		Nodes: &nodesStr,
	}
	body, _ := json.Marshal(reqBody)

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{"id": "mindmap-draft-1"},
		Body:           string(body),
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{"sub": integrationAuthorID},
			},
		},
	}

	resp, err := Handler(ctx, request)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 400 {
		t.Fatalf("expected status 400 for size exceed, got %d: %s", resp.StatusCode, resp.Body)
	}

	var errResp domain.ErrorResponse
	if err := json.Unmarshal([]byte(resp.Body), &errResp); err != nil {
		t.Fatalf("failed to parse error response: %v", err)
	}
	if errResp.Message != "mindmap data exceeds maximum size of 350KB" {
		t.Errorf("expected size exceed error message, got %q", errResp.Message)
	}
}

// TestIntegration_UpdateUnauthorized tests that unauthenticated requests are rejected
// Requirement 1.6: Cognito auth required for all CRUD operations
func TestIntegration_UpdateUnauthorized(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") != "true" {
		t.Skip("Skipping integration test: set INTEGRATION_TEST=true to run")
	}

	ctx := context.Background()
	client := setupIntegrationTest(t, ctx)
	defer cleanupIntegrationTest(t, ctx, client)

	newTitle := "Updated"
	reqBody := domain.UpdateMindmapRequest{Title: &newTitle}
	body, _ := json.Marshal(reqBody)

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{"id": "mindmap-draft-1"},
		Body:           string(body),
		// No Authorizer - unauthenticated
	}

	resp, err := Handler(ctx, request)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 401 {
		t.Errorf("expected status 401 for unauthenticated request, got %d", resp.StatusCode)
	}
}

// Helper functions

func generateLargeNodeTree(n int) domain.MindmapNode {
	root := domain.MindmapNode{
		ID:       "root",
		Text:     "Root",
		Children: make([]domain.MindmapNode, 0, n-1),
	}
	for i := 1; i < n; i++ {
		root.Children = append(root.Children, domain.MindmapNode{
			ID:       fmt.Sprintf("node-%d", i),
			Text:     fmt.Sprintf("Node %d", i),
			Children: []domain.MindmapNode{},
		})
	}
	return root
}

func setupIntegrationTest(t *testing.T, ctx context.Context) *dynamodb.Client {
	t.Helper()

	t.Setenv("TABLE_NAME", integrationTableName)
	t.Setenv("AWS_REGION", "us-east-1")
	t.Setenv("DYNAMODB_ENDPOINT", dynamoDBLocalEndpoint)

	cfg, err := config.LoadDefaultConfig(ctx,
		config.WithRegion("us-east-1"),
		config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider("test", "test", "")),
	)
	if err != nil {
		t.Fatalf("failed to load config: %v", err)
	}

	client := dynamodb.NewFromConfig(cfg, func(o *dynamodb.Options) {
		o.BaseEndpoint = aws.String(dynamoDBLocalEndpoint)
	})

	createMindmapsTable(t, ctx, client)

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return client, nil
	}

	return client
}

func cleanupIntegrationTest(t *testing.T, ctx context.Context, client *dynamodb.Client) {
	t.Helper()
	_, err := client.DeleteTable(ctx, &dynamodb.DeleteTableInput{
		TableName: aws.String(integrationTableName),
	})
	if err != nil {
		t.Logf("Warning: failed to delete table: %v", err)
	}
}

func createMindmapsTable(t *testing.T, ctx context.Context, client *dynamodb.Client) {
	t.Helper()

	_, _ = client.DeleteTable(ctx, &dynamodb.DeleteTableInput{
		TableName: aws.String(integrationTableName),
	})
	// Wait for table deletion to complete
	for i := 0; i < 30; i++ {
		_, err := client.DescribeTable(ctx, &dynamodb.DescribeTableInput{
			TableName: aws.String(integrationTableName),
		})
		if err != nil {
			break // Table no longer exists
		}
		time.Sleep(100 * time.Millisecond)
	}

	_, err := client.CreateTable(ctx, &dynamodb.CreateTableInput{
		TableName: aws.String(integrationTableName),
		KeySchema: []types.KeySchemaElement{
			{AttributeName: aws.String("id"), KeyType: types.KeyTypeHash},
		},
		AttributeDefinitions: []types.AttributeDefinition{
			{AttributeName: aws.String("id"), AttributeType: types.ScalarAttributeTypeS},
			{AttributeName: aws.String("publishStatus"), AttributeType: types.ScalarAttributeTypeS},
			{AttributeName: aws.String("createdAt"), AttributeType: types.ScalarAttributeTypeS},
		},
		GlobalSecondaryIndexes: []types.GlobalSecondaryIndex{
			{
				IndexName: aws.String("PublishStatusIndex"),
				KeySchema: []types.KeySchemaElement{
					{AttributeName: aws.String("publishStatus"), KeyType: types.KeyTypeHash},
					{AttributeName: aws.String("createdAt"), KeyType: types.KeyTypeRange},
				},
				Projection: &types.Projection{
					ProjectionType: types.ProjectionTypeAll,
				},
			},
		},
		BillingMode: types.BillingModePayPerRequest,
	})
	if err != nil {
		t.Fatalf("failed to create table: %v", err)
	}

	for i := 0; i < 30; i++ {
		desc, err := client.DescribeTable(ctx, &dynamodb.DescribeTableInput{
			TableName: aws.String(integrationTableName),
		})
		if err == nil && desc.Table.TableStatus == types.TableStatusActive {
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatalf("table did not become active")
}

func seedTestMindmaps(t *testing.T, ctx context.Context, client *dynamodb.Client) {
	t.Helper()

	mindmaps := []domain.Mindmap{
		{
			ID:            "mindmap-draft-1",
			Title:         "Draft Mindmap",
			Nodes:         `{"id":"root","text":"Root","children":[]}`,
			PublishStatus: "draft",
			AuthorID:      integrationAuthorID,
			CreatedAt:     "2026-02-14T10:00:00Z",
			UpdatedAt:     "2026-02-14T10:00:00Z",
		},
	}

	for _, m := range mindmaps {
		item, err := attributevalue.MarshalMap(m)
		if err != nil {
			t.Fatalf("failed to marshal mindmap: %v", err)
		}
		_, err = client.PutItem(ctx, &dynamodb.PutItemInput{
			TableName: aws.String(integrationTableName),
			Item:      item,
		})
		if err != nil {
			t.Fatalf("failed to put item: %v", err)
		}
	}
	time.Sleep(100 * time.Millisecond)
}
