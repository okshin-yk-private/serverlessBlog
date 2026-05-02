package main

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"serverless-blog/go-functions/internal/domain"
)

const testTableName = "test-table"

type mockClient struct {
	queryFunc func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error)
}

func (m *mockClient) Query(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
	return m.queryFunc(ctx, params, optFns...)
}

func setupTest(t *testing.T) func() {
	t.Helper()
	t.Setenv("TABLE_NAME", testTableName)
	t.Setenv("AWS_REGION", "ap-northeast-1")
	original := dynamoClientGetter
	return func() {
		dynamoClientGetter = original
	}
}

func makeRequest(slug string) events.APIGatewayProxyRequest {
	return events.APIGatewayProxyRequest{
		PathParameters: map[string]string{"slug": slug},
	}
}

func ptr[T any](v T) *T { return &v }

func TestHandler_PublishedPost_Returns200(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	post := domain.BlogPost{
		ID:            "post-1",
		Title:         "Hello",
		PublishStatus: domain.PublishStatusPublished,
		Slug:          ptr("hello"),
	}
	item, err := attributevalue.MarshalMap(post)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return &mockClient{
			queryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
				if params.IndexName == nil || *params.IndexName != "SlugIndex" {
					t.Errorf("expected SlugIndex, got %v", params.IndexName)
				}
				return &dynamodb.QueryOutput{Count: 1, Items: []map[string]types.AttributeValue{item}}, nil
			},
		}, nil
	}

	resp, _ := Handler(context.Background(), makeRequest("hello"))
	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d body=%s", resp.StatusCode, resp.Body)
	}
	var got domain.BlogPost
	if err := json.Unmarshal([]byte(resp.Body), &got); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if got.ID != "post-1" {
		t.Errorf("expected post id post-1, got %q", got.ID)
	}
}

func TestHandler_NotFound_Returns404(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return &mockClient{
			queryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
				return &dynamodb.QueryOutput{Count: 0}, nil
			},
		}, nil
	}

	resp, _ := Handler(context.Background(), makeRequest("missing"))
	if resp.StatusCode != 404 {
		t.Errorf("expected 404, got %d", resp.StatusCode)
	}
}

func TestHandler_DraftPost_Returns404(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	draft := domain.BlogPost{
		ID:            "post-1",
		Title:         "Draft",
		PublishStatus: domain.PublishStatusDraft,
		Slug:          ptr("draft-only"),
	}
	item, err := attributevalue.MarshalMap(draft)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return &mockClient{
			queryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
				return &dynamodb.QueryOutput{Count: 1, Items: []map[string]types.AttributeValue{item}}, nil
			},
		}, nil
	}

	resp, _ := Handler(context.Background(), makeRequest("draft-only"))
	if resp.StatusCode != 404 {
		t.Errorf("expected 404 for draft, got %d", resp.StatusCode)
	}
}

func TestHandler_QueryError_Returns500(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return &mockClient{
			queryFunc: func(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error) {
				return nil, errors.New("ddb down")
			},
		}, nil
	}

	resp, _ := Handler(context.Background(), makeRequest("any"))
	if resp.StatusCode != 500 {
		t.Errorf("expected 500, got %d", resp.StatusCode)
	}
}

func TestHandler_MissingSlug_Returns400(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()
	resp, _ := Handler(context.Background(), events.APIGatewayProxyRequest{PathParameters: map[string]string{}})
	if resp.StatusCode != 400 {
		t.Errorf("expected 400, got %d", resp.StatusCode)
	}
}

func TestHandler_MissingTable_Returns500(t *testing.T) {
	t.Setenv("TABLE_NAME", "")
	resp, _ := Handler(context.Background(), makeRequest("hello"))
	if resp.StatusCode != 500 {
		t.Errorf("expected 500, got %d", resp.StatusCode)
	}
}

func TestHandler_ClientInitError_Returns500(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()
	dynamoClientGetter = func() (DynamoDBClientInterface, error) {
		return nil, errors.New("client init failed")
	}
	resp, _ := Handler(context.Background(), makeRequest("hello"))
	if resp.StatusCode != 500 {
		t.Errorf("expected 500, got %d", resp.StatusCode)
	}
}
