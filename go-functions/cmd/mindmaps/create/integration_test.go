// Package main provides integration tests for the CreateMindmap Lambda function.
//
// These tests verify mindmap creation with DynamoDB Local, including:
// - Successful creation of draft and published mindmaps
// - Validation errors (node count exceed, size exceed)
// - Data persistence verification
//
// Requirements: 1.1, 4.5, 4.6, 8.1, 8.9, 9.6
//
// To run these integration tests:
//   INTEGRATION_TEST=true go test -v -tags=integration ./go-functions/cmd/mindmaps/create/...
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
	integrationTableName  = "test-mindmaps-create-integration"
	dynamoDBLocalEndpoint = "http://localhost:8000"
	integrationAuthorID   = "integration-author-123"
)

// TestIntegration_CreateDraftMindmap tests creating a draft mindmap
// Requirement 1.1: Create mindmap with draft status
func TestIntegration_CreateDraftMindmap(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") != "true" {
		t.Skip("Skipping integration test: set INTEGRATION_TEST=true to run")
	}

	ctx := context.Background()
	client := setupIntegrationTest(t, ctx)
	defer cleanupIntegrationTest(t, ctx, client)

	reqBody := domain.CreateMindmapRequest{
		Title:         "Integration Test Draft Mindmap",
		Nodes:         `{"id":"root","text":"Root Node","children":[{"id":"child-1","text":"Child 1","children":[]}]}`,
		PublishStatus: "draft",
	}
	body, _ := json.Marshal(reqBody)

	request := makeIntegrationAuthRequest(string(body))

	resp, err := Handler(ctx, request)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 201 {
		t.Fatalf("expected status 201, got %d: %s", resp.StatusCode, resp.Body)
	}

	var mindmap domain.Mindmap
	if err := json.Unmarshal([]byte(resp.Body), &mindmap); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	// Verify response fields
	if mindmap.ID == "" {
		t.Error("expected non-empty ID")
	}
	if mindmap.Title != "Integration Test Draft Mindmap" {
		t.Errorf("expected title 'Integration Test Draft Mindmap', got %q", mindmap.Title)
	}
	if mindmap.PublishStatus != "draft" {
		t.Errorf("expected publishStatus 'draft', got %q", mindmap.PublishStatus)
	}
	if mindmap.AuthorID != integrationAuthorID {
		t.Errorf("expected authorId %q, got %q", integrationAuthorID, mindmap.AuthorID)
	}
	if mindmap.PublishedAt != nil {
		t.Error("expected publishedAt to be nil for draft")
	}
	if mindmap.CreatedAt == "" {
		t.Error("expected non-empty createdAt")
	}
	if mindmap.UpdatedAt == "" {
		t.Error("expected non-empty updatedAt")
	}

	// Verify data persisted in DynamoDB
	getOutput, err := client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(integrationTableName),
		Key: map[string]types.AttributeValue{
			"id": &types.AttributeValueMemberS{Value: mindmap.ID},
		},
	})
	if err != nil {
		t.Fatalf("failed to get item from DynamoDB: %v", err)
	}
	if len(getOutput.Item) == 0 {
		t.Fatal("mindmap not found in DynamoDB after creation")
	}

	var stored domain.Mindmap
	if err := attributevalue.UnmarshalMap(getOutput.Item, &stored); err != nil {
		t.Fatalf("failed to unmarshal stored mindmap: %v", err)
	}
	if stored.Title != "Integration Test Draft Mindmap" {
		t.Errorf("stored title mismatch: got %q", stored.Title)
	}
}

// TestIntegration_CreatePublishedMindmap tests creating a published mindmap
// Requirement 1.1: Create mindmap with published status, publishedAt should be set
func TestIntegration_CreatePublishedMindmap(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") != "true" {
		t.Skip("Skipping integration test: set INTEGRATION_TEST=true to run")
	}

	ctx := context.Background()
	client := setupIntegrationTest(t, ctx)
	defer cleanupIntegrationTest(t, ctx, client)

	reqBody := domain.CreateMindmapRequest{
		Title:         "Integration Test Published Mindmap",
		Nodes:         `{"id":"root","text":"Root","children":[]}`,
		PublishStatus: "published",
	}
	body, _ := json.Marshal(reqBody)

	resp, err := Handler(ctx, makeIntegrationAuthRequest(string(body)))
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 201 {
		t.Fatalf("expected status 201, got %d: %s", resp.StatusCode, resp.Body)
	}

	var mindmap domain.Mindmap
	if err := json.Unmarshal([]byte(resp.Body), &mindmap); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if mindmap.PublishStatus != "published" {
		t.Errorf("expected publishStatus 'published', got %q", mindmap.PublishStatus)
	}
	if mindmap.PublishedAt == nil {
		t.Error("expected publishedAt to be set for published mindmap")
	}

	// Verify in DynamoDB
	getOutput, err := client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(integrationTableName),
		Key: map[string]types.AttributeValue{
			"id": &types.AttributeValueMemberS{Value: mindmap.ID},
		},
	})
	if err != nil {
		t.Fatalf("failed to get item from DynamoDB: %v", err)
	}

	var stored domain.Mindmap
	if err := attributevalue.UnmarshalMap(getOutput.Item, &stored); err != nil {
		t.Fatalf("failed to unmarshal stored mindmap: %v", err)
	}
	if stored.PublishStatus != "published" {
		t.Errorf("stored publishStatus mismatch: got %q", stored.PublishStatus)
	}
}

// TestIntegration_CreateValidationError_NodeCountExceed tests node count validation
// Requirement 4.6: Node count must not exceed 500
func TestIntegration_CreateValidationError_NodeCountExceed(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") != "true" {
		t.Skip("Skipping integration test: set INTEGRATION_TEST=true to run")
	}

	ctx := context.Background()
	client := setupIntegrationTest(t, ctx)
	defer cleanupIntegrationTest(t, ctx, client)

	// Generate a tree with 501 nodes
	root := generateLargeNodeTree(501)
	nodesJSON, _ := json.Marshal(root)

	reqBody := domain.CreateMindmapRequest{
		Title:         "Too Many Nodes",
		Nodes:         string(nodesJSON),
		PublishStatus: "draft",
	}
	body, _ := json.Marshal(reqBody)

	resp, err := Handler(ctx, makeIntegrationAuthRequest(string(body)))
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

// TestIntegration_CreateValidationError_SizeExceed tests nodes JSON size validation
// Requirement 4.5: Nodes JSON size must not exceed 350KB
func TestIntegration_CreateValidationError_SizeExceed(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") != "true" {
		t.Skip("Skipping integration test: set INTEGRATION_TEST=true to run")
	}

	ctx := context.Background()
	client := setupIntegrationTest(t, ctx)
	defer cleanupIntegrationTest(t, ctx, client)

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

	reqBody := domain.CreateMindmapRequest{
		Title:         "Too Large",
		Nodes:         string(nodesJSON),
		PublishStatus: "draft",
	}
	body, _ := json.Marshal(reqBody)

	resp, err := Handler(ctx, makeIntegrationAuthRequest(string(body)))
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

// TestIntegration_CreateUnauthorized tests that unauthenticated requests are rejected
// Requirement 1.6: Cognito auth required for all CRUD operations
func TestIntegration_CreateUnauthorized(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") != "true" {
		t.Skip("Skipping integration test: set INTEGRATION_TEST=true to run")
	}

	ctx := context.Background()
	client := setupIntegrationTest(t, ctx)
	defer cleanupIntegrationTest(t, ctx, client)

	request := events.APIGatewayProxyRequest{
		Body: `{"title":"Test","nodes":"{\"id\":\"root\",\"text\":\"Root\",\"children\":[]}","publishStatus":"draft"}`,
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

func makeIntegrationAuthRequest(body string) events.APIGatewayProxyRequest {
	return events.APIGatewayProxyRequest{
		Body: body,
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{
					"sub": integrationAuthorID,
				},
			},
		},
	}
}

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
