package main

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"testing"

	"github.com/aws/aws-lambda-go/lambdacontext"
	"github.com/aws/aws-sdk-go-v2/service/codebuild"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"

	"serverless-blog/go-functions/internal/sitebuild"
)

type idleDynamoDB struct{}

func (idleDynamoDB) GetItem(_ context.Context, _ *dynamodb.GetItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
	return &dynamodb.GetItemOutput{}, nil
}

func (idleDynamoDB) UpdateItem(_ context.Context, _ *dynamodb.UpdateItemInput, _ ...func(*dynamodb.Options)) (*dynamodb.UpdateItemOutput, error) {
	return &dynamodb.UpdateItemOutput{}, nil
}

type idleCodeBuild struct{}

func (idleCodeBuild) StartBuild(_ context.Context, _ *codebuild.StartBuildInput, _ ...func(*codebuild.Options)) (*codebuild.StartBuildOutput, error) {
	return &codebuild.StartBuildOutput{}, nil
}

func (idleCodeBuild) BatchGetBuilds(_ context.Context, _ *codebuild.BatchGetBuildsInput, _ ...func(*codebuild.Options)) (*codebuild.BatchGetBuildsOutput, error) {
	return &codebuild.BatchGetBuildsOutput{}, nil
}

func preserveClientGetters(t *testing.T) {
	t.Helper()
	originalDynamo := dynamoClientGetter
	originalCodeBuild := codebuildClientGetter
	t.Cleanup(func() {
		dynamoClientGetter = originalDynamo
		codebuildClientGetter = originalCodeBuild
	})
}

func TestHandlerRejectsMissingConfiguration(t *testing.T) {
	preserveClientGetters(t)
	t.Setenv("TABLE_NAME", "")
	t.Setenv("CODEBUILD_PROJECT_NAME", "")
	if err := Handler(context.Background()); err == nil {
		t.Fatal("expected configuration error")
	}
}

func TestHandlerReturnsClientInitializationError(t *testing.T) {
	preserveClientGetters(t)
	readLogs := captureLogs(t)
	t.Setenv("TABLE_NAME", "posts")
	t.Setenv("CODEBUILD_PROJECT_NAME", "site-project")
	want := errors.New("dynamodb unavailable")
	dynamoClientGetter = func() (sitebuild.DynamoDBClient, error) { return nil, want }
	ctx := lambdacontext.NewContext(context.Background(), &lambdacontext.LambdaContext{AwsRequestID: "reconcile-request"})
	if err := Handler(ctx); !errors.Is(err, want) {
		t.Fatalf("expected DynamoDB error, got %v", err)
	}
	entries := readLogs()
	if len(entries) != 1 || entries[0]["level"] != "ERROR" || entries[0]["requestId"] != "reconcile-request" || entries[0]["error"] != "get DynamoDB client: dynamodb unavailable" {
		t.Fatalf("missing correlated reconciliation error: %+v", entries)
	}
}

func TestHandlerSucceedsWhenNoBuildIsPending(t *testing.T) {
	preserveClientGetters(t)
	t.Setenv("TABLE_NAME", "posts")
	t.Setenv("CODEBUILD_PROJECT_NAME", "site-project")
	dynamoClientGetter = func() (sitebuild.DynamoDBClient, error) { return idleDynamoDB{}, nil }
	codebuildClientGetter = func() (sitebuild.CodeBuildClient, error) { return idleCodeBuild{}, nil }
	if err := Handler(context.Background()); err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
}

type unavailableDynamoDB struct {
	idleDynamoDB
	err error
}

func (db unavailableDynamoDB) GetItem(context.Context, *dynamodb.GetItemInput, ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
	return nil, db.err
}

func TestHandlerLogsReconciliationFailuresAndKeepsRetryError(t *testing.T) {
	for _, failure := range []string{"CodeBuild client", "read state"} {
		t.Run(failure, func(t *testing.T) {
			preserveClientGetters(t)
			t.Setenv("TABLE_NAME", "posts")
			t.Setenv("CODEBUILD_PROJECT_NAME", "site-project")
			readLogs := captureLogs(t)
			cause := errors.New("dependency unavailable")
			dynamoClientGetter = func() (sitebuild.DynamoDBClient, error) { return idleDynamoDB{}, nil }
			codebuildClientGetter = func() (sitebuild.CodeBuildClient, error) { return idleCodeBuild{}, nil }
			if failure == "CodeBuild client" {
				codebuildClientGetter = func() (sitebuild.CodeBuildClient, error) { return nil, cause }
			} else {
				dynamoClientGetter = func() (sitebuild.DynamoDBClient, error) { return unavailableDynamoDB{err: cause}, nil }
			}
			ctx := lambdacontext.NewContext(context.Background(), &lambdacontext.LambdaContext{AwsRequestID: "reconcile-failure"})
			if err := Handler(ctx); !errors.Is(err, cause) {
				t.Fatalf("must keep failure for Lambda retry: %v", err)
			}
			entries := readLogs()
			if len(entries) != 1 || entries[0]["level"] != "ERROR" || entries[0]["requestId"] != "reconcile-failure" || !strings.Contains(entries[0]["error"].(string), cause.Error()) {
				t.Fatalf("missing correlated failure: %+v", entries)
			}
		})
	}
}

// captureLogs redirects stdout for this non-parallel test and parses JSON events.
func captureLogs(t *testing.T) func() []map[string]any {
	t.Helper()
	output, err := os.CreateTemp(t.TempDir(), "logs")
	if err != nil {
		t.Fatal(err)
	}
	original := os.Stdout
	os.Stdout = output
	t.Cleanup(func() { os.Stdout = original; _ = output.Close() })
	return func() []map[string]any {
		t.Helper()
		raw, err := os.ReadFile(output.Name())
		if err != nil {
			t.Fatal(err)
		}
		var entries []map[string]any
		for _, line := range strings.Split(strings.TrimSpace(string(raw)), "\n") {
			if line == "" {
				continue
			}
			var entry map[string]any
			if err := json.Unmarshal([]byte(line), &entry); err != nil {
				t.Fatalf("invalid JSON log: %s: %v", line, err)
			}
			entries = append(entries, entry)
		}
		return entries
	}
}
