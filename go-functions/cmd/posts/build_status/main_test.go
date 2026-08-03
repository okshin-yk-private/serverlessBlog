package main

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"

	"serverless-blog/go-functions/internal/sitebuild"
)

type mockDynamo struct {
	state sitebuild.State
	err   error
}

func (m *mockDynamo) GetItem(_ context.Context, _ *dynamodb.GetItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
	if m.err != nil {
		return nil, m.err
	}
	if m.state.ID == "" {
		return &dynamodb.GetItemOutput{}, nil
	}
	item, err := attributevalue.MarshalMap(m.state)
	return &dynamodb.GetItemOutput{Item: item}, err
}

func (m *mockDynamo) UpdateItem(_ context.Context, _ *dynamodb.UpdateItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.UpdateItemOutput, error) {
	return &dynamodb.UpdateItemOutput{}, nil
}

func request(target string) events.APIGatewayProxyRequest {
	return events.APIGatewayProxyRequest{
		PathParameters:        map[string]string{"id": "post-1"},
		QueryStringParameters: map[string]string{"targetRevision": target},
		RequestContext: events.APIGatewayProxyRequestContext{Authorizer: map[string]interface{}{
			"claims": map[string]interface{}{"sub": "user-1"},
		}},
	}
}

func setup(t *testing.T, state sitebuild.State) {
	t.Helper()
	t.Setenv("TABLE_NAME", "posts")
	original := dynamoClientGetter
	dynamoClientGetter = func() (sitebuild.DynamoDBClient, error) { return &mockDynamo{state: state}, nil }
	t.Cleanup(func() { dynamoClientGetter = original })
}

func TestHandlerCorrelatesTargetRevision(t *testing.T) {
	setup(t, sitebuild.State{
		ID: sitebuild.StateItemID, DesiredRevision: 5, DeployedRevision: 3,
		ActiveRevision: 4, ActiveBuildID: "build-4", Status: sitebuild.StatusInProgress,
	})

	tests := []struct {
		target string
		status string
	}{
		{"3", sitebuild.StatusSucceeded},
		{"4", sitebuild.StatusInProgress},
		{"5", sitebuild.StatusQueued},
	}
	for _, tt := range tests {
		resp, err := Handler(context.Background(), request(tt.target))
		if err != nil || resp.StatusCode != 200 {
			t.Fatalf("target %s: status=%d err=%v", tt.target, resp.StatusCode, err)
		}
		var body BuildStatusResponse
		if err := json.Unmarshal([]byte(resp.Body), &body); err != nil {
			t.Fatal(err)
		}
		if body.Status != tt.status || body.TargetRevision == 0 {
			t.Errorf("target %s: got status=%s revision=%d", tt.target, body.Status, body.TargetRevision)
		}
	}
}

func TestHandlerUsesLatestDesiredRevisionWhenTargetOmitted(t *testing.T) {
	setup(t, sitebuild.State{ID: sitebuild.StateItemID, DesiredRevision: 7, DeployedRevision: 7, Status: sitebuild.StatusSucceeded})
	req := request("")
	resp, _ := Handler(context.Background(), req)
	var body BuildStatusResponse
	_ = json.Unmarshal([]byte(resp.Body), &body)
	if body.Status != sitebuild.StatusSucceeded || body.TargetRevision != 7 {
		t.Fatalf("unexpected body: %+v", body)
	}
}

func TestHandlerValidationAndErrors(t *testing.T) {
	t.Run("unauthorized", func(t *testing.T) {
		setup(t, sitebuild.State{})
		resp, _ := Handler(context.Background(), events.APIGatewayProxyRequest{PathParameters: map[string]string{"id": "post-1"}})
		if resp.StatusCode != 401 {
			t.Fatalf("got %d", resp.StatusCode)
		}
	})
	t.Run("missing post id", func(t *testing.T) {
		setup(t, sitebuild.State{})
		req := request("")
		req.PathParameters = nil
		resp, _ := Handler(context.Background(), req)
		if resp.StatusCode != 400 {
			t.Fatalf("got %d", resp.StatusCode)
		}
	})
	t.Run("invalid revision", func(t *testing.T) {
		setup(t, sitebuild.State{})
		resp, _ := Handler(context.Background(), request("old"))
		if resp.StatusCode != 400 {
			t.Fatalf("got %d", resp.StatusCode)
		}
	})
	t.Run("dynamodb error", func(t *testing.T) {
		t.Setenv("TABLE_NAME", "posts")
		original := dynamoClientGetter
		dynamoClientGetter = func() (sitebuild.DynamoDBClient, error) {
			return &mockDynamo{err: errors.New("unavailable")}, nil
		}
		t.Cleanup(func() { dynamoClientGetter = original })
		resp, _ := Handler(context.Background(), request("1"))
		if resp.StatusCode != 500 {
			t.Fatalf("got %d", resp.StatusCode)
		}
	})
}
