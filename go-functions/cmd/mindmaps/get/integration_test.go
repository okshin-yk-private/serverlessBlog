// Package main provides integration tests for the GetMindmap Lambda function.
//
// These tests verify authenticated mindmap retrieval with DynamoDB Local, including:
// - Get existing mindmap by ID
// - 404 for non-existent mindmap
// - Draft access restricted to author only
//
// Requirements: 1.3, 8.3, 8.8, 9.6
//
// To run these integration tests:
//   INTEGRATION_TEST=true go test -v -tags=integration ./go-functions/cmd/mindmaps/get/...
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
	integrationTableName  = "test-mindmaps-get-integration"
	dynamoDBLocalEndpoint = "http://localhost:8000"
	integrationAuthorID   = "integration-author-123"
)

// TestIntegration_GetExistingMindmap tests retrieving an existing mindmap
// Requirement 1.3, 8.3: Get mindmap by ID
func TestIntegration_GetExistingMindmap(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") != "true" {
		t.Skip("Skipping integration test: set INTEGRATION_TEST=true to run")
	}

	ctx := context.Background()
	client := setupIntegrationTest(t, ctx)
	defer cleanupIntegrationTest(t, ctx, client)

	seedTestMindmaps(t, ctx, client)

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{"id": "mindmap-1"},
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
	if mindmap.ID != "mindmap-1" {
		t.Errorf("expected id 'mindmap-1', got %q", mindmap.ID)
	}
	if mindmap.Title != "Published Mindmap" {
		t.Errorf("expected title 'Published Mindmap', got %q", mindmap.Title)
	}
	if mindmap.PublishStatus != "published" {
		t.Errorf("expected publishStatus 'published', got %q", mindmap.PublishStatus)
	}
}

// TestIntegration_GetNonExistentMindmap tests 404 for non-existent ID
// Requirement 8.8: Return 404 for non-existent mindmap
func TestIntegration_GetNonExistentMindmap(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") != "true" {
		t.Skip("Skipping integration test: set INTEGRATION_TEST=true to run")
	}

	ctx := context.Background()
	client := setupIntegrationTest(t, ctx)
	defer cleanupIntegrationTest(t, ctx, client)

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{"id": "non-existent-id"},
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

// TestIntegration_GetDraftMindmap_DifferentAuthor tests draft access restriction
// Draft mindmaps should only be accessible by their author
func TestIntegration_GetDraftMindmap_DifferentAuthor(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") != "true" {
		t.Skip("Skipping integration test: set INTEGRATION_TEST=true to run")
	}

	ctx := context.Background()
	client := setupIntegrationTest(t, ctx)
	defer cleanupIntegrationTest(t, ctx, client)

	seedTestMindmaps(t, ctx, client)

	// Try to access draft mindmap with a different user
	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{"id": "mindmap-2"},
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{"sub": "different-user-456"},
			},
		},
	}

	resp, err := Handler(ctx, request)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 403 {
		t.Errorf("expected status 403 for draft access by different user, got %d: %s", resp.StatusCode, resp.Body)
	}
}

// TestIntegration_GetDraftMindmap_SameAuthor tests that author can access their own draft
func TestIntegration_GetDraftMindmap_SameAuthor(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") != "true" {
		t.Skip("Skipping integration test: set INTEGRATION_TEST=true to run")
	}

	ctx := context.Background()
	client := setupIntegrationTest(t, ctx)
	defer cleanupIntegrationTest(t, ctx, client)

	seedTestMindmaps(t, ctx, client)

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{"id": "mindmap-2"},
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
		t.Fatalf("expected status 200 for author accessing own draft, got %d: %s", resp.StatusCode, resp.Body)
	}

	var mindmap domain.Mindmap
	if err := json.Unmarshal([]byte(resp.Body), &mindmap); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}
	if mindmap.PublishStatus != "draft" {
		t.Errorf("expected publishStatus 'draft', got %q", mindmap.PublishStatus)
	}
}

// TestIntegration_GetUnauthorized tests that unauthenticated requests are rejected
// Requirement 1.6: Cognito auth required for all CRUD operations
func TestIntegration_GetUnauthorized(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") != "true" {
		t.Skip("Skipping integration test: set INTEGRATION_TEST=true to run")
	}

	ctx := context.Background()
	client := setupIntegrationTest(t, ctx)
	defer cleanupIntegrationTest(t, ctx, client)

	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{"id": "mindmap-1"},
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

func seedTestMindmaps(t *testing.T, ctx context.Context, client *dynamodb.Client) {
	t.Helper()

	publishedAt := "2026-02-14T12:00:00Z"
	mindmaps := []domain.Mindmap{
		{
			ID:            "mindmap-1",
			Title:         "Published Mindmap",
			Nodes:         `{"id":"root","text":"Root","children":[]}`,
			PublishStatus: "published",
			AuthorID:      integrationAuthorID,
			CreatedAt:     "2026-02-14T10:00:00Z",
			UpdatedAt:     "2026-02-14T10:00:00Z",
			PublishedAt:   &publishedAt,
		},
		{
			ID:            "mindmap-2",
			Title:         "Draft Mindmap",
			Nodes:         `{"id":"root","text":"Draft Root","children":[]}`,
			PublishStatus: "draft",
			AuthorID:      integrationAuthorID,
			CreatedAt:     "2026-02-14T09:00:00Z",
			UpdatedAt:     "2026-02-14T09:00:00Z",
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
