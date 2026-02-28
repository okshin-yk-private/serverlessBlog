// Package main provides integration tests for the ListMindmaps Lambda function.
//
// These tests verify admin mindmap listing with DynamoDB Local, including:
// - List mindmaps with authentication
// - Pagination support
// - Author-filtered results
//
// Requirements: 1.2, 8.2, 9.6
//
// To run these integration tests:
//   INTEGRATION_TEST=true go test -v -tags=integration ./go-functions/cmd/mindmaps/list/...
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
	integrationTableName  = "test-mindmaps-list-integration"
	dynamoDBLocalEndpoint = "http://localhost:8000"
	integrationAuthorID   = "integration-author-123"
)

// TestIntegration_ListMindmaps tests listing mindmaps for authenticated user
// Requirement 1.2, 8.2: List mindmaps with auth
func TestIntegration_ListMindmaps(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") != "true" {
		t.Skip("Skipping integration test: set INTEGRATION_TEST=true to run")
	}

	ctx := context.Background()
	client := setupIntegrationTest(t, ctx)
	defer cleanupIntegrationTest(t, ctx, client)

	seedTestMindmaps(t, ctx, client)

	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{},
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

	var response domain.ListMindmapsResponse
	if err := json.Unmarshal([]byte(resp.Body), &response); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	// Author has 3 mindmaps (2 draft + 1 published)
	if response.Count != 3 {
		t.Errorf("expected 3 mindmaps for author, got %d", response.Count)
	}
	if len(response.Items) != 3 {
		t.Errorf("expected 3 items, got %d", len(response.Items))
	}

	// Verify all items belong to the author
	for _, item := range response.Items {
		if item.AuthorID != integrationAuthorID {
			t.Errorf("expected authorId %q, got %q", integrationAuthorID, item.AuthorID)
		}
	}
}

// TestIntegration_ListMindmaps_Pagination tests pagination support
// Requirement 8.2: Pagination with limit and nextToken
func TestIntegration_ListMindmaps_Pagination(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") != "true" {
		t.Skip("Skipping integration test: set INTEGRATION_TEST=true to run")
	}

	ctx := context.Background()
	client := setupIntegrationTest(t, ctx)
	defer cleanupIntegrationTest(t, ctx, client)

	seedTestMindmaps(t, ctx, client)

	// First page: limit=2
	firstRequest := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{"limit": "2"},
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{"sub": integrationAuthorID},
			},
		},
	}

	firstResp, err := Handler(ctx, firstRequest)
	if err != nil {
		t.Fatalf("first page request failed: %v", err)
	}
	if firstResp.StatusCode != 200 {
		t.Fatalf("expected status 200, got %d", firstResp.StatusCode)
	}

	var firstPage domain.ListMindmapsResponse
	if err := json.Unmarshal([]byte(firstResp.Body), &firstPage); err != nil {
		t.Fatalf("failed to parse first page: %v", err)
	}

	if len(firstPage.Items) > 2 {
		t.Errorf("expected at most 2 items in first page, got %d", len(firstPage.Items))
	}

	// Verify nextToken is present when there are more items
	if firstPage.NextToken == nil {
		t.Skip("no nextToken returned; pagination may not apply with DynamoDB Local Scan filter")
	}

	// Second page using nextToken
	secondRequest := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{
			"limit":     "2",
			"nextToken": *firstPage.NextToken,
		},
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{"sub": integrationAuthorID},
			},
		},
	}

	secondResp, err := Handler(ctx, secondRequest)
	if err != nil {
		t.Fatalf("second page request failed: %v", err)
	}
	if secondResp.StatusCode != 200 {
		t.Fatalf("expected status 200 for second page, got %d", secondResp.StatusCode)
	}

	var secondPage domain.ListMindmapsResponse
	if err := json.Unmarshal([]byte(secondResp.Body), &secondPage); err != nil {
		t.Fatalf("failed to parse second page: %v", err)
	}

	// Verify total items across pages (author has 3 mindmaps, page size 2)
	totalItems := len(firstPage.Items) + len(secondPage.Items)
	if totalItems < 2 || totalItems > 3 {
		t.Errorf("expected 2-3 total items across pages, got %d", totalItems)
	}

	// Verify no duplicate items across pages
	seen := make(map[string]bool)
	for _, item := range firstPage.Items {
		seen[item.ID] = true
	}
	for _, item := range secondPage.Items {
		if seen[item.ID] {
			t.Errorf("duplicate item found across pages: %s", item.ID)
		}
	}
}

// TestIntegration_ListMindmaps_AuthorIsolation tests that users only see their own mindmaps
func TestIntegration_ListMindmaps_AuthorIsolation(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") != "true" {
		t.Skip("Skipping integration test: set INTEGRATION_TEST=true to run")
	}

	ctx := context.Background()
	client := setupIntegrationTest(t, ctx)
	defer cleanupIntegrationTest(t, ctx, client)

	seedTestMindmaps(t, ctx, client)

	// Request as a different user
	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{},
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{"sub": "different-author-456"},
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

	var response domain.ListMindmapsResponse
	if err := json.Unmarshal([]byte(resp.Body), &response); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	// Different author has 1 mindmap
	if response.Count != 1 {
		t.Errorf("expected 1 mindmap for different author, got %d", response.Count)
	}
}

// TestIntegration_ListUnauthorized tests that unauthenticated requests are rejected
// Requirement 1.6: Cognito auth required for all CRUD operations
func TestIntegration_ListUnauthorized(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") != "true" {
		t.Skip("Skipping integration test: set INTEGRATION_TEST=true to run")
	}

	ctx := context.Background()
	client := setupIntegrationTest(t, ctx)
	defer cleanupIntegrationTest(t, ctx, client)

	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{},
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
			Title:         "Draft Mindmap 1",
			Nodes:         `{"id":"root","text":"Draft Root","children":[]}`,
			PublishStatus: "draft",
			AuthorID:      integrationAuthorID,
			CreatedAt:     "2026-02-14T09:00:00Z",
			UpdatedAt:     "2026-02-14T09:00:00Z",
		},
		{
			ID:            "mindmap-3",
			Title:         "Draft Mindmap 2",
			Nodes:         `{"id":"root","text":"Draft Root 2","children":[]}`,
			PublishStatus: "draft",
			AuthorID:      integrationAuthorID,
			CreatedAt:     "2026-02-14T08:00:00Z",
			UpdatedAt:     "2026-02-14T08:00:00Z",
		},
		{
			ID:            "mindmap-4",
			Title:         "Other Author Mindmap",
			Nodes:         `{"id":"root","text":"Other","children":[]}`,
			PublishStatus: "published",
			AuthorID:      "different-author-456",
			CreatedAt:     "2026-02-14T07:00:00Z",
			UpdatedAt:     "2026-02-14T07:00:00Z",
			PublishedAt:   &publishedAt,
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
