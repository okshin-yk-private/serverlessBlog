// Package main provides integration tests for the ListPublicMindmaps Lambda function.
//
// These tests verify public mindmap listing with DynamoDB Local, including:
// - List returns only published mindmaps via PublishStatusIndex GSI
// - Pagination support
// - Descending order by createdAt
//
// Requirements: 8.6, 9.6
//
// To run these integration tests:
//   INTEGRATION_TEST=true go test -v -tags=integration ./go-functions/cmd/mindmaps/list_public/...
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
	integrationTableName  = "test-mindmaps-listpublic-integration"
	dynamoDBLocalEndpoint = "http://localhost:8000"
)

// TestIntegration_ListPublicMindmaps_OnlyPublished tests that only published mindmaps are returned
// Requirement 8.6: Public list returns only published mindmaps
func TestIntegration_ListPublicMindmaps_OnlyPublished(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") != "true" {
		t.Skip("Skipping integration test: set INTEGRATION_TEST=true to run")
	}

	ctx := context.Background()
	client := setupIntegrationTest(t, ctx)
	defer cleanupIntegrationTest(t, ctx, client)

	seedTestMindmaps(t, ctx, client)

	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{},
		// No Authorizer - public endpoint
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

	// Should return only 3 published mindmaps (not the 2 drafts)
	if response.Count != 3 {
		t.Errorf("expected 3 published mindmaps, got %d", response.Count)
	}
	if len(response.Items) != 3 {
		t.Errorf("expected 3 items, got %d", len(response.Items))
	}

	// Verify all items are published
	for i, item := range response.Items {
		if item.PublishStatus != "published" {
			t.Errorf("item %d: expected publishStatus 'published', got %q", i, item.PublishStatus)
		}
	}
}

// TestIntegration_ListPublicMindmaps_DescendingOrder tests that results are sorted by createdAt descending
// Requirement 8.6: GSI query with ScanIndexForward=false
func TestIntegration_ListPublicMindmaps_DescendingOrder(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") != "true" {
		t.Skip("Skipping integration test: set INTEGRATION_TEST=true to run")
	}

	ctx := context.Background()
	client := setupIntegrationTest(t, ctx)
	defer cleanupIntegrationTest(t, ctx, client)

	seedTestMindmaps(t, ctx, client)

	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{},
	}

	resp, err := Handler(ctx, request)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}

	var response domain.ListMindmapsResponse
	if err := json.Unmarshal([]byte(resp.Body), &response); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	// Verify descending order by createdAt
	for i := 0; i < len(response.Items)-1; i++ {
		if response.Items[i].CreatedAt < response.Items[i+1].CreatedAt {
			t.Errorf("items not in descending order: item[%d].createdAt=%s < item[%d].createdAt=%s",
				i, response.Items[i].CreatedAt, i+1, response.Items[i+1].CreatedAt)
		}
	}
}

// TestIntegration_ListPublicMindmaps_Pagination tests pagination via GSI
// Requirement 8.6: Pagination with limit and nextToken
func TestIntegration_ListPublicMindmaps_Pagination(t *testing.T) {
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

	if len(firstPage.Items) != 2 {
		t.Errorf("expected 2 items in first page, got %d", len(firstPage.Items))
	}

	if firstPage.NextToken == nil {
		t.Fatal("expected nextToken for pagination")
	}

	// Second page using nextToken
	secondRequest := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{
			"limit":     "2",
			"nextToken": *firstPage.NextToken,
		},
	}

	secondResp, err := Handler(ctx, secondRequest)
	if err != nil {
		t.Fatalf("second page request failed: %v", err)
	}
	if secondResp.StatusCode != 200 {
		t.Fatalf("expected status 200, got %d", secondResp.StatusCode)
	}

	var secondPage domain.ListMindmapsResponse
	if err := json.Unmarshal([]byte(secondResp.Body), &secondPage); err != nil {
		t.Fatalf("failed to parse second page: %v", err)
	}

	if len(secondPage.Items) != 1 {
		t.Errorf("expected 1 item in second page, got %d", len(secondPage.Items))
	}

	// Verify all items across pages are published
	for _, item := range secondPage.Items {
		if item.PublishStatus != "published" {
			t.Errorf("expected publishStatus 'published', got %q", item.PublishStatus)
		}
	}
}

// TestIntegration_ListPublicMindmaps_Empty tests listing when no published mindmaps exist
func TestIntegration_ListPublicMindmaps_Empty(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") != "true" {
		t.Skip("Skipping integration test: set INTEGRATION_TEST=true to run")
	}

	ctx := context.Background()
	client := setupIntegrationTest(t, ctx)
	defer cleanupIntegrationTest(t, ctx, client)

	// Seed only draft mindmaps
	draftMindmap := domain.Mindmap{
		ID:            "mindmap-draft-only",
		Title:         "Draft Only",
		Nodes:         `{"id":"root","text":"Root","children":[]}`,
		PublishStatus: "draft",
		AuthorID:      "author-123",
		CreatedAt:     "2026-02-14T10:00:00Z",
		UpdatedAt:     "2026-02-14T10:00:00Z",
	}
	item, _ := attributevalue.MarshalMap(draftMindmap)
	_, err := client.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: aws.String(integrationTableName),
		Item:      item,
	})
	if err != nil {
		t.Fatalf("failed to seed draft mindmap: %v", err)
	}
	time.Sleep(100 * time.Millisecond)

	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{},
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

	if response.Count != 0 {
		t.Errorf("expected 0 published mindmaps, got %d", response.Count)
	}
	if len(response.Items) != 0 {
		t.Errorf("expected 0 items, got %d", len(response.Items))
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
		// Published mindmaps (3)
		{
			ID:            "mindmap-pub-1",
			Title:         "Published Mindmap 1",
			Nodes:         `{"id":"root","text":"Root 1","children":[]}`,
			PublishStatus: "published",
			AuthorID:      "author-1",
			CreatedAt:     "2026-02-14T10:00:00Z",
			UpdatedAt:     "2026-02-14T10:00:00Z",
			PublishedAt:   &publishedAt,
		},
		{
			ID:            "mindmap-pub-2",
			Title:         "Published Mindmap 2",
			Nodes:         `{"id":"root","text":"Root 2","children":[]}`,
			PublishStatus: "published",
			AuthorID:      "author-1",
			CreatedAt:     "2026-02-14T09:00:00Z",
			UpdatedAt:     "2026-02-14T09:00:00Z",
			PublishedAt:   &publishedAt,
		},
		{
			ID:            "mindmap-pub-3",
			Title:         "Published Mindmap 3",
			Nodes:         `{"id":"root","text":"Root 3","children":[]}`,
			PublishStatus: "published",
			AuthorID:      "author-2",
			CreatedAt:     "2026-02-14T08:00:00Z",
			UpdatedAt:     "2026-02-14T08:00:00Z",
			PublishedAt:   &publishedAt,
		},
		// Draft mindmaps (2) - should NOT be returned
		{
			ID:            "mindmap-draft-1",
			Title:         "Draft Mindmap 1",
			Nodes:         `{"id":"root","text":"Draft 1","children":[]}`,
			PublishStatus: "draft",
			AuthorID:      "author-1",
			CreatedAt:     "2026-02-14T07:00:00Z",
			UpdatedAt:     "2026-02-14T07:00:00Z",
		},
		{
			ID:            "mindmap-draft-2",
			Title:         "Draft Mindmap 2",
			Nodes:         `{"id":"root","text":"Draft 2","children":[]}`,
			PublishStatus: "draft",
			AuthorID:      "author-2",
			CreatedAt:     "2026-02-14T06:00:00Z",
			UpdatedAt:     "2026-02-14T06:00:00Z",
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
