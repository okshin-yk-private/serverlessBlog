// Package main provides integration tests for the GetPublicMindmap Lambda function.
//
// These tests verify public mindmap retrieval with DynamoDB Local, including:
// - Get published mindmap returns 200
// - Get draft mindmap returns 404
// - Get non-existent mindmap returns 404
//
// Requirements: 8.7, 8.8, 9.6
//
// To run these integration tests:
//   INTEGRATION_TEST=true go test -v -tags=integration ./go-functions/cmd/mindmaps/get_public/...
//
//go:build integration
// +build integration

package main

import (
	"context"
	"encoding/json"
	"os"
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
	integrationTableName  = "test-mindmaps-getpublic-integration"
	dynamoDBLocalEndpoint = "http://localhost:8000"
)

// TestIntegration_GetPublicPublishedMindmap tests that published mindmaps are accessible
// Requirement 8.7: Public get returns published mindmap
func TestIntegration_GetPublicPublishedMindmap(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") != "true" {
		t.Skip("Skipping integration test: set INTEGRATION_TEST=true to run")
	}

	ctx := context.Background()
	client := setupIntegrationTest(t, ctx)
	defer cleanupIntegrationTest(t, ctx, client)

	seedTestMindmaps(t, ctx, client)

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{"id": "mindmap-published-1"},
		// No Authorizer - public endpoint
	}

	resp, err := Handler(ctx, request)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("expected status 200 for published mindmap, got %d: %s", resp.StatusCode, resp.Body)
	}

	var mindmap domain.Mindmap
	if err := json.Unmarshal([]byte(resp.Body), &mindmap); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}
	if mindmap.ID != "mindmap-published-1" {
		t.Errorf("expected id 'mindmap-published-1', got %q", mindmap.ID)
	}
	if mindmap.Title != "Published Mindmap 1" {
		t.Errorf("expected title 'Published Mindmap 1', got %q", mindmap.Title)
	}
	if mindmap.PublishStatus != "published" {
		t.Errorf("expected publishStatus 'published', got %q", mindmap.PublishStatus)
	}

	// Verify nodes data is returned
	if mindmap.Nodes == "" {
		t.Error("expected non-empty nodes data")
	}
}

// TestIntegration_GetPublicDraftMindmap tests that draft mindmaps return 404
// Requirement 8.7: Public endpoint should not expose draft mindmaps
func TestIntegration_GetPublicDraftMindmap(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") != "true" {
		t.Skip("Skipping integration test: set INTEGRATION_TEST=true to run")
	}

	ctx := context.Background()
	client := setupIntegrationTest(t, ctx)
	defer cleanupIntegrationTest(t, ctx, client)

	seedTestMindmaps(t, ctx, client)

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{"id": "mindmap-draft-1"},
		// No Authorizer - public endpoint
	}

	resp, err := Handler(ctx, request)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 404 {
		t.Errorf("expected status 404 for draft mindmap on public API, got %d: %s", resp.StatusCode, resp.Body)
	}

	var errResp domain.ErrorResponse
	if err := json.Unmarshal([]byte(resp.Body), &errResp); err != nil {
		t.Fatalf("failed to parse error response: %v", err)
	}
	if errResp.Message != "mindmap not found" {
		t.Errorf("expected 'mindmap not found' error message, got %q", errResp.Message)
	}
}

// TestIntegration_GetPublicNonExistentMindmap tests 404 for non-existent ID
// Requirement 8.8: Return 404 for non-existent mindmap
func TestIntegration_GetPublicNonExistentMindmap(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") != "true" {
		t.Skip("Skipping integration test: set INTEGRATION_TEST=true to run")
	}

	ctx := context.Background()
	client := setupIntegrationTest(t, ctx)
	defer cleanupIntegrationTest(t, ctx, client)

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{"id": "non-existent-id"},
	}

	resp, err := Handler(ctx, request)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 404 {
		t.Errorf("expected status 404 for non-existent mindmap, got %d: %s", resp.StatusCode, resp.Body)
	}
}

// TestIntegration_GetPublicMindmapWithNodeMetadata tests that node metadata is returned
// Requirement 7.5, 7.6: Node metadata accessible via public API
func TestIntegration_GetPublicMindmapWithNodeMetadata(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") != "true" {
		t.Skip("Skipping integration test: set INTEGRATION_TEST=true to run")
	}

	ctx := context.Background()
	client := setupIntegrationTest(t, ctx)
	defer cleanupIntegrationTest(t, ctx, client)

	seedTestMindmaps(t, ctx, client)

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{"id": "mindmap-published-2"},
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

	// Verify the nodes JSON contains metadata
	var rootNode domain.MindmapNode
	if err := json.Unmarshal([]byte(mindmap.Nodes), &rootNode); err != nil {
		t.Fatalf("failed to parse nodes: %v", err)
	}
	if rootNode.Color == nil || *rootNode.Color != "#FF5733" {
		t.Errorf("expected root node color '#FF5733', got %v", rootNode.Color)
	}
	if rootNode.Note == nil || *rootNode.Note != "This is a note" {
		t.Errorf("expected root node note 'This is a note', got %v", rootNode.Note)
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

func seedTestMindmaps(t *testing.T, ctx context.Context, client *dynamodb.Client) {
	t.Helper()

	publishedAt := "2026-02-14T12:00:00Z"
	color := "#FF5733"
	note := "This is a note"

	nodesWithMetadata := domain.MindmapNode{
		ID:    "root",
		Text:  "Root with Metadata",
		Color: &color,
		Note:  &note,
		Children: []domain.MindmapNode{
			{ID: "child-1", Text: "Child", Children: []domain.MindmapNode{}},
		},
	}
	nodesWithMetadataJSON, _ := json.Marshal(nodesWithMetadata)

	mindmaps := []domain.Mindmap{
		{
			ID:            "mindmap-published-1",
			Title:         "Published Mindmap 1",
			Nodes:         `{"id":"root","text":"Root","children":[{"id":"child-1","text":"Child 1","children":[]}]}`,
			PublishStatus: "published",
			AuthorID:      "author-123",
			CreatedAt:     "2026-02-14T10:00:00Z",
			UpdatedAt:     "2026-02-14T10:00:00Z",
			PublishedAt:   &publishedAt,
		},
		{
			ID:            "mindmap-published-2",
			Title:         "Published Mindmap with Metadata",
			Nodes:         string(nodesWithMetadataJSON),
			PublishStatus: "published",
			AuthorID:      "author-123",
			CreatedAt:     "2026-02-14T09:00:00Z",
			UpdatedAt:     "2026-02-14T09:00:00Z",
			PublishedAt:   &publishedAt,
		},
		{
			ID:            "mindmap-draft-1",
			Title:         "Draft Mindmap",
			Nodes:         `{"id":"root","text":"Draft Root","children":[]}`,
			PublishStatus: "draft",
			AuthorID:      "author-123",
			CreatedAt:     "2026-02-14T08:00:00Z",
			UpdatedAt:     "2026-02-14T08:00:00Z",
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
