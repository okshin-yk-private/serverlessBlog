// Package main provides integration tests for the DeleteMindmap Lambda function.
//
// These tests verify mindmap deletion with DynamoDB Local, including:
// - Successful deletion and data removal verification
// - 404 for non-existent mindmap
// - Ownership verification
//
// Requirements: 1.5, 8.5, 8.8, 9.6
//
// To run these integration tests:
//   INTEGRATION_TEST=true go test -v -tags=integration ./go-functions/cmd/mindmaps/delete/...
//
//go:build integration
// +build integration

package main

import (
	"context"
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
	integrationTableName  = "test-mindmaps-delete-integration"
	dynamoDBLocalEndpoint = "http://localhost:8000"
	integrationAuthorID   = "integration-author-123"
)

// TestIntegration_DeleteExistingMindmap tests deleting an existing mindmap
// Requirement 1.5, 8.5: Delete mindmap by ID
func TestIntegration_DeleteExistingMindmap(t *testing.T) {
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
	if resp.StatusCode != 204 {
		t.Errorf("expected status 204, got %d: %s", resp.StatusCode, resp.Body)
	}

	// Verify data actually deleted from DynamoDB
	getOutput, err := client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(integrationTableName),
		Key: map[string]types.AttributeValue{
			"id": &types.AttributeValueMemberS{Value: "mindmap-1"},
		},
	})
	if err != nil {
		t.Fatalf("failed to verify deletion: %v", err)
	}
	if len(getOutput.Item) != 0 {
		t.Error("mindmap should have been deleted from DynamoDB")
	}
}

// TestIntegration_DeleteNonExistentMindmap tests 404 for non-existent mindmap
// Requirement 8.8: Return 404 for non-existent ID
func TestIntegration_DeleteNonExistentMindmap(t *testing.T) {
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

// TestIntegration_DeleteOtherAuthorMindmap tests that users cannot delete other authors' mindmaps
func TestIntegration_DeleteOtherAuthorMindmap(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") != "true" {
		t.Skip("Skipping integration test: set INTEGRATION_TEST=true to run")
	}

	ctx := context.Background()
	client := setupIntegrationTest(t, ctx)
	defer cleanupIntegrationTest(t, ctx, client)

	seedTestMindmaps(t, ctx, client)

	// Try to delete mindmap-1 as a different author
	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{"id": "mindmap-1"},
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
	if resp.StatusCode != 403 {
		t.Errorf("expected status 403 for unauthorized deletion, got %d: %s", resp.StatusCode, resp.Body)
	}

	// Verify data NOT deleted from DynamoDB
	getOutput, err := client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: aws.String(integrationTableName),
		Key: map[string]types.AttributeValue{
			"id": &types.AttributeValueMemberS{Value: "mindmap-1"},
		},
	})
	if err != nil {
		t.Fatalf("failed to verify non-deletion: %v", err)
	}
	if len(getOutput.Item) == 0 {
		t.Error("mindmap should NOT have been deleted")
	}
}

// TestIntegration_DeleteUnauthorized tests that unauthenticated requests are rejected
// Requirement 1.6: Cognito auth required for all CRUD operations
func TestIntegration_DeleteUnauthorized(t *testing.T) {
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
