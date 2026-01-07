// Package main provides integration tests for the ListPosts Lambda function.
//
// These tests verify admin endpoint behavior (publishStatus filtering, count response)
// and public endpoint backward compatibility (published-only, no count field).
//
// Requirement 2.1-2.6: Admin Dashboard Statistics Accuracy
// Requirement 3.1-3.4: Public Site Article Display
//
// To run these integration tests:
//   INTEGRATION_TEST=true go test -v -tags=integration ./go-functions/cmd/posts/list/...
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
	testTableNameIntegration = "test-listposts-integration"
	dynamoDBLocalEndpoint    = "http://localhost:8000"
)

// TestIntegration_AdminEndpoint_PublishStatusFiltering tests admin endpoint filtering by publishStatus
// Requirement 2.1, 2.2: Dashboard queries published/draft counts via PublishStatusIndex GSI
func TestIntegration_AdminEndpoint_PublishStatusFiltering(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") != "true" {
		t.Skip("Skipping integration test: set INTEGRATION_TEST=true to run")
	}

	ctx := context.Background()
	client := setupIntegrationTest(t, ctx)
	defer cleanupIntegrationTest(t, ctx, client)

	// Insert test data
	seedTestData(t, ctx, client)

	tests := []struct {
		name                  string
		publishStatus         string
		expectedItemsCount    int
		expectedCountInResp   int64
		shouldIncludeCountKey bool
	}{
		{
			name:                  "admin request for published articles",
			publishStatus:         "published",
			expectedItemsCount:    3,
			expectedCountInResp:   3,
			shouldIncludeCountKey: true,
		},
		{
			name:                  "admin request for draft articles",
			publishStatus:         "draft",
			expectedItemsCount:    2,
			expectedCountInResp:   2,
			shouldIncludeCountKey: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Arrange: Admin request with Cognito claims
			request := events.APIGatewayProxyRequest{
				QueryStringParameters: map[string]string{
					"publishStatus": tt.publishStatus,
				},
				RequestContext: events.APIGatewayProxyRequestContext{
					Authorizer: map[string]interface{}{
						"claims": map[string]interface{}{
							"sub": "admin-user-123",
						},
					},
				},
			}

			// Act
			resp, err := Handler(ctx, request)

			// Assert
			if err != nil {
				t.Fatalf("Handler returned error: %v", err)
			}
			if resp.StatusCode != 200 {
				t.Fatalf("expected status 200, got %d: %s", resp.StatusCode, resp.Body)
			}

			var response map[string]interface{}
			if err := json.Unmarshal([]byte(resp.Body), &response); err != nil {
				t.Fatalf("failed to parse response: %v", err)
			}

			// Verify items array
			items, ok := response["items"].([]interface{})
			if !ok {
				t.Fatalf("items field is not an array")
			}
			if len(items) != tt.expectedItemsCount {
				t.Errorf("expected %d items, got %d", tt.expectedItemsCount, len(items))
			}

			// Verify count field is present for admin requests
			if tt.shouldIncludeCountKey {
				countVal, countExists := response["count"]
				if !countExists {
					t.Errorf("expected count field for admin request")
				} else {
					count := int64(countVal.(float64))
					if count != tt.expectedCountInResp {
						t.Errorf("expected count %d, got %d", tt.expectedCountInResp, count)
					}
				}
			}

			// Verify all items have correct publishStatus
			for _, item := range items {
				itemMap := item.(map[string]interface{})
				if itemMap["publishStatus"] != tt.publishStatus {
					t.Errorf("expected publishStatus %q, got %q", tt.publishStatus, itemMap["publishStatus"])
				}
			}
		})
	}
}

// TestIntegration_AdminEndpoint_InvalidPublishStatus tests 400 error for invalid publishStatus
// Requirement 2.1: Validation of publishStatus parameter
func TestIntegration_AdminEndpoint_InvalidPublishStatus(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") != "true" {
		t.Skip("Skipping integration test: set INTEGRATION_TEST=true to run")
	}

	ctx := context.Background()
	client := setupIntegrationTest(t, ctx)
	defer cleanupIntegrationTest(t, ctx, client)

	// Admin request with invalid publishStatus
	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{
			"publishStatus": "invalid-status",
		},
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{
					"sub": "admin-user-123",
				},
			},
		},
	}

	// Act
	resp, err := Handler(ctx, request)

	// Assert
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 400 {
		t.Errorf("expected status 400 for invalid publishStatus, got %d", resp.StatusCode)
	}

	var errResp domain.ErrorResponse
	if err := json.Unmarshal([]byte(resp.Body), &errResp); err != nil {
		t.Fatalf("failed to parse error response: %v", err)
	}
	if errResp.Message != "invalid publishStatus value" {
		t.Errorf("expected error message 'invalid publishStatus value', got %q", errResp.Message)
	}
}

// TestIntegration_AdminEndpoint_PaginationWithPublishStatus tests pagination with publishStatus filter
// Requirement 2.5, 2.6: Dashboard shows updated counts
func TestIntegration_AdminEndpoint_PaginationWithPublishStatus(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") != "true" {
		t.Skip("Skipping integration test: set INTEGRATION_TEST=true to run")
	}

	ctx := context.Background()
	client := setupIntegrationTest(t, ctx)
	defer cleanupIntegrationTest(t, ctx, client)

	seedTestData(t, ctx, client)

	// First page: limit=2 for published articles
	firstPageRequest := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{
			"publishStatus": "published",
			"limit":         "2",
		},
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{"sub": "admin-123"},
			},
		},
	}

	firstResp, err := Handler(ctx, firstPageRequest)
	if err != nil {
		t.Fatalf("first page request failed: %v", err)
	}
	if firstResp.StatusCode != 200 {
		t.Fatalf("expected status 200, got %d", firstResp.StatusCode)
	}

	var firstPage map[string]interface{}
	if err := json.Unmarshal([]byte(firstResp.Body), &firstPage); err != nil {
		t.Fatalf("failed to parse first page: %v", err)
	}

	items := firstPage["items"].([]interface{})
	if len(items) != 2 {
		t.Errorf("expected 2 items in first page, got %d", len(items))
	}

	// Count should still be total (3) not page size
	count := int64(firstPage["count"].(float64))
	if count != 3 {
		t.Errorf("expected total count 3, got %d", count)
	}

	// NextToken should be present
	nextToken, ok := firstPage["nextToken"]
	if !ok || nextToken == nil {
		t.Errorf("expected nextToken for pagination")
	}

	// Second page
	secondPageRequest := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{
			"publishStatus": "published",
			"limit":         "2",
			"nextToken":     nextToken.(string),
		},
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{"sub": "admin-123"},
			},
		},
	}

	secondResp, err := Handler(ctx, secondPageRequest)
	if err != nil {
		t.Fatalf("second page request failed: %v", err)
	}

	var secondPage map[string]interface{}
	if err := json.Unmarshal([]byte(secondResp.Body), &secondPage); err != nil {
		t.Fatalf("failed to parse second page: %v", err)
	}

	secondItems := secondPage["items"].([]interface{})
	if len(secondItems) != 1 {
		t.Errorf("expected 1 item in second page, got %d", len(secondItems))
	}
}

// TestIntegration_AdminEndpoint_CategoryAndPublishStatus tests category filtering combined with publishStatus
// Requirement 2.1-2.6: Combined filtering
func TestIntegration_AdminEndpoint_CategoryAndPublishStatus(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") != "true" {
		t.Skip("Skipping integration test: set INTEGRATION_TEST=true to run")
	}

	ctx := context.Background()
	client := setupIntegrationTest(t, ctx)
	defer cleanupIntegrationTest(t, ctx, client)

	seedTestData(t, ctx, client)

	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{
			"publishStatus": "published",
			"category":      "technology",
		},
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{"sub": "admin-123"},
			},
		},
	}

	resp, err := Handler(ctx, request)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}

	var response map[string]interface{}
	if err := json.Unmarshal([]byte(resp.Body), &response); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	items := response["items"].([]interface{})
	// technology category with published status: post-1, post-3
	if len(items) != 2 {
		t.Errorf("expected 2 published tech articles, got %d", len(items))
	}

	// Verify all items are published and technology category
	for _, item := range items {
		itemMap := item.(map[string]interface{})
		if itemMap["publishStatus"] != "published" {
			t.Errorf("expected publishStatus 'published', got %q", itemMap["publishStatus"])
		}
		if itemMap["category"] != "technology" {
			t.Errorf("expected category 'technology', got %q", itemMap["category"])
		}
	}
}

// TestIntegration_PublicEndpoint_BackwardCompatibility tests public endpoint returns published articles only
// Requirement 3.1, 3.4: Public site shows only published articles, no draft articles
func TestIntegration_PublicEndpoint_BackwardCompatibility(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") != "true" {
		t.Skip("Skipping integration test: set INTEGRATION_TEST=true to run")
	}

	ctx := context.Background()
	client := setupIntegrationTest(t, ctx)
	defer cleanupIntegrationTest(t, ctx, client)

	seedTestData(t, ctx, client)

	// Public request (no Authorizer)
	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{},
		// No Authorizer - public request
	}

	resp, err := Handler(ctx, request)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}

	var response map[string]interface{}
	if err := json.Unmarshal([]byte(resp.Body), &response); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	// Verify count field is NOT present for public requests
	if _, exists := response["count"]; exists {
		t.Errorf("count field should NOT be present for public requests")
	}

	// Verify only published articles are returned
	items := response["items"].([]interface{})
	if len(items) != 3 {
		t.Errorf("expected 3 published articles, got %d", len(items))
	}

	for _, item := range items {
		itemMap := item.(map[string]interface{})
		if itemMap["publishStatus"] != "published" {
			t.Errorf("public endpoint should only return published articles, got %q", itemMap["publishStatus"])
		}
	}
}

// TestIntegration_PublicEndpoint_IgnoresInvalidPublishStatus tests public endpoint ignores invalid publishStatus
// Requirement 3.1: Public site defaults to published
func TestIntegration_PublicEndpoint_IgnoresInvalidPublishStatus(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") != "true" {
		t.Skip("Skipping integration test: set INTEGRATION_TEST=true to run")
	}

	ctx := context.Background()
	client := setupIntegrationTest(t, ctx)
	defer cleanupIntegrationTest(t, ctx, client)

	seedTestData(t, ctx, client)

	// Public request with invalid publishStatus (should be ignored, not 400)
	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{
			"publishStatus": "invalid-status", // Should be ignored for public
		},
		// No Authorizer - public request
	}

	resp, err := Handler(ctx, request)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}

	// Public requests should return 200 and ignore invalid publishStatus
	if resp.StatusCode != 200 {
		t.Errorf("expected status 200 for public request (ignore invalid publishStatus), got %d", resp.StatusCode)
	}

	var response map[string]interface{}
	if err := json.Unmarshal([]byte(resp.Body), &response); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	// Should return published articles (default)
	items := response["items"].([]interface{})
	if len(items) != 3 {
		t.Errorf("expected 3 published articles, got %d", len(items))
	}
}

// TestIntegration_PublicEndpoint_CategoryFilter tests public endpoint with category filter
// Requirement 3.1, 3.2: Public site with category filtering
func TestIntegration_PublicEndpoint_CategoryFilter(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") != "true" {
		t.Skip("Skipping integration test: set INTEGRATION_TEST=true to run")
	}

	ctx := context.Background()
	client := setupIntegrationTest(t, ctx)
	defer cleanupIntegrationTest(t, ctx, client)

	seedTestData(t, ctx, client)

	// Public request with category filter
	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{
			"category": "lifestyle",
		},
		// No Authorizer - public request
	}

	resp, err := Handler(ctx, request)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("expected status 200, got %d", resp.StatusCode)
	}

	var response map[string]interface{}
	if err := json.Unmarshal([]byte(resp.Body), &response); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	// No count for public
	if _, exists := response["count"]; exists {
		t.Errorf("count field should NOT be present for public requests")
	}

	items := response["items"].([]interface{})
	// Only published lifestyle article: post-2
	if len(items) != 1 {
		t.Errorf("expected 1 published lifestyle article, got %d", len(items))
	}

	if len(items) > 0 {
		itemMap := items[0].(map[string]interface{})
		if itemMap["category"] != "lifestyle" {
			t.Errorf("expected category 'lifestyle', got %q", itemMap["category"])
		}
		if itemMap["publishStatus"] != "published" {
			t.Errorf("expected publishStatus 'published', got %q", itemMap["publishStatus"])
		}
	}
}

// TestIntegration_PublicEndpoint_Pagination tests public endpoint pagination
// Requirement 3.2: Public site sorted by createdAt descending
func TestIntegration_PublicEndpoint_Pagination(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") != "true" {
		t.Skip("Skipping integration test: set INTEGRATION_TEST=true to run")
	}

	ctx := context.Background()
	client := setupIntegrationTest(t, ctx)
	defer cleanupIntegrationTest(t, ctx, client)

	seedTestData(t, ctx, client)

	// First page
	firstRequest := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{
			"limit": "2",
		},
	}

	firstResp, err := Handler(ctx, firstRequest)
	if err != nil {
		t.Fatalf("first page request failed: %v", err)
	}

	var firstPage map[string]interface{}
	if err := json.Unmarshal([]byte(firstResp.Body), &firstPage); err != nil {
		t.Fatalf("failed to parse first page: %v", err)
	}

	items := firstPage["items"].([]interface{})
	if len(items) != 2 {
		t.Errorf("expected 2 items in first page, got %d", len(items))
	}

	// Verify descending order by createdAt
	if len(items) >= 2 {
		first := items[0].(map[string]interface{})
		second := items[1].(map[string]interface{})
		if first["createdAt"].(string) < second["createdAt"].(string) {
			t.Errorf("expected descending order by createdAt")
		}
	}

	// No count for public
	if _, exists := firstPage["count"]; exists {
		t.Errorf("count should not be present for public requests")
	}
}

// TestIntegration_PublicEndpoint_NoContentMarkdown tests contentMarkdown is excluded
// Requirement 3.1-3.4: Response format
func TestIntegration_PublicEndpoint_NoContentMarkdown(t *testing.T) {
	if os.Getenv("INTEGRATION_TEST") != "true" {
		t.Skip("Skipping integration test: set INTEGRATION_TEST=true to run")
	}

	ctx := context.Background()
	client := setupIntegrationTest(t, ctx)
	defer cleanupIntegrationTest(t, ctx, client)

	seedTestData(t, ctx, client)

	request := events.APIGatewayProxyRequest{
		QueryStringParameters: map[string]string{},
	}

	resp, err := Handler(ctx, request)
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}

	var response map[string]interface{}
	if err := json.Unmarshal([]byte(resp.Body), &response); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	items := response["items"].([]interface{})
	for i, item := range items {
		itemMap := item.(map[string]interface{})

		// contentMarkdown should NOT be present
		if _, exists := itemMap["contentMarkdown"]; exists {
			t.Errorf("item %d: contentMarkdown should not be in response", i)
		}

		// contentHtml should be present
		if _, exists := itemMap["contentHtml"]; !exists {
			t.Errorf("item %d: contentHtml should be in response", i)
		}
	}
}

// Helper functions for integration tests

func setupIntegrationTest(t *testing.T, ctx context.Context) *dynamodb.Client {
	t.Helper()

	// Set environment variables
	t.Setenv("TABLE_NAME", testTableNameIntegration)
	t.Setenv("AWS_REGION", "us-east-1")
	t.Setenv("DYNAMODB_ENDPOINT", dynamoDBLocalEndpoint)

	// Create DynamoDB client for DynamoDB Local
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

	// Create table
	createTable(t, ctx, client)

	// Override the dynamoClientGetter to use DynamoDB Local
	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return client, nil
	}

	return client
}

func cleanupIntegrationTest(t *testing.T, ctx context.Context, client *dynamodb.Client) {
	t.Helper()

	// Delete table
	_, err := client.DeleteTable(ctx, &dynamodb.DeleteTableInput{
		TableName: aws.String(testTableNameIntegration),
	})
	if err != nil {
		t.Logf("Warning: failed to delete table: %v", err)
	}
}

func createTable(t *testing.T, ctx context.Context, client *dynamodb.Client) {
	t.Helper()

	// Delete existing table if it exists
	_, _ = client.DeleteTable(ctx, &dynamodb.DeleteTableInput{
		TableName: aws.String(testTableNameIntegration),
	})
	time.Sleep(500 * time.Millisecond)

	_, err := client.CreateTable(ctx, &dynamodb.CreateTableInput{
		TableName: aws.String(testTableNameIntegration),
		KeySchema: []types.KeySchemaElement{
			{AttributeName: aws.String("id"), KeyType: types.KeyTypeHash},
		},
		AttributeDefinitions: []types.AttributeDefinition{
			{AttributeName: aws.String("id"), AttributeType: types.ScalarAttributeTypeS},
			{AttributeName: aws.String("publishStatus"), AttributeType: types.ScalarAttributeTypeS},
			{AttributeName: aws.String("category"), AttributeType: types.ScalarAttributeTypeS},
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
			{
				IndexName: aws.String("CategoryIndex"),
				KeySchema: []types.KeySchemaElement{
					{AttributeName: aws.String("category"), KeyType: types.KeyTypeHash},
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

	// Wait for table to be active
	for i := 0; i < 30; i++ {
		desc, err := client.DescribeTable(ctx, &dynamodb.DescribeTableInput{
			TableName: aws.String(testTableNameIntegration),
		})
		if err == nil && desc.Table.TableStatus == types.TableStatusActive {
			return
		}
		time.Sleep(100 * time.Millisecond)
	}
	t.Fatalf("table did not become active")
}

func seedTestData(t *testing.T, ctx context.Context, client *dynamodb.Client) {
	t.Helper()

	publishedAt := "2024-01-15T12:00:00Z"
	testPosts := []domain.BlogPost{
		// Published articles (3)
		{
			ID:              "post-1",
			Title:           "Published Tech Article 1",
			ContentMarkdown: "# Tech 1",
			ContentHTML:     "<h1>Tech 1</h1>",
			Category:        "technology",
			Tags:            []string{"go", "aws"},
			PublishStatus:   "published",
			AuthorID:        "author-1",
			CreatedAt:       "2024-01-15T10:00:00Z",
			UpdatedAt:       "2024-01-15T10:00:00Z",
			PublishedAt:     &publishedAt,
			ImageURLs:       []string{},
		},
		{
			ID:              "post-2",
			Title:           "Published Lifestyle Article",
			ContentMarkdown: "# Lifestyle",
			ContentHTML:     "<h1>Lifestyle</h1>",
			Category:        "lifestyle",
			Tags:            []string{},
			PublishStatus:   "published",
			AuthorID:        "author-1",
			CreatedAt:       "2024-01-14T10:00:00Z",
			UpdatedAt:       "2024-01-14T10:00:00Z",
			PublishedAt:     &publishedAt,
			ImageURLs:       []string{},
		},
		{
			ID:              "post-3",
			Title:           "Published Tech Article 2",
			ContentMarkdown: "# Tech 2",
			ContentHTML:     "<h1>Tech 2</h1>",
			Category:        "technology",
			Tags:            []string{"serverless"},
			PublishStatus:   "published",
			AuthorID:        "author-2",
			CreatedAt:       "2024-01-13T10:00:00Z",
			UpdatedAt:       "2024-01-13T10:00:00Z",
			PublishedAt:     &publishedAt,
			ImageURLs:       []string{},
		},
		// Draft articles (2)
		{
			ID:              "post-4",
			Title:           "Draft Tech Article",
			ContentMarkdown: "# Draft Tech",
			ContentHTML:     "<h1>Draft Tech</h1>",
			Category:        "technology",
			Tags:            []string{},
			PublishStatus:   "draft",
			AuthorID:        "author-1",
			CreatedAt:       "2024-01-12T10:00:00Z",
			UpdatedAt:       "2024-01-12T10:00:00Z",
			ImageURLs:       []string{},
		},
		{
			ID:              "post-5",
			Title:           "Draft Lifestyle Article",
			ContentMarkdown: "# Draft Lifestyle",
			ContentHTML:     "<h1>Draft Lifestyle</h1>",
			Category:        "lifestyle",
			Tags:            []string{},
			PublishStatus:   "draft",
			AuthorID:        "author-2",
			CreatedAt:       "2024-01-11T10:00:00Z",
			UpdatedAt:       "2024-01-11T10:00:00Z",
			ImageURLs:       []string{},
		},
	}

	for _, post := range testPosts {
		item, err := attributevalue.MarshalMap(post)
		if err != nil {
			t.Fatalf("failed to marshal post: %v", err)
		}

		_, err = client.PutItem(ctx, &dynamodb.PutItemInput{
			TableName: aws.String(testTableNameIntegration),
			Item:      item,
		})
		if err != nil {
			t.Fatalf("failed to put item: %v", err)
		}
	}

	// Small delay to ensure GSI propagation
	time.Sleep(100 * time.Millisecond)
}
