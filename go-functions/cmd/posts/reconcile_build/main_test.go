package main

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/aws/aws-lambda-go/lambdacontext"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/codebuild"
	codebuildtypes "github.com/aws/aws-sdk-go-v2/service/codebuild/types"
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

func (idleCodeBuild) ListBuildsForProject(_ context.Context, _ *codebuild.ListBuildsForProjectInput, _ ...func(*codebuild.Options)) (*codebuild.ListBuildsForProjectOutput, error) {
	return &codebuild.ListBuildsForProjectOutput{}, nil
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
	codebuildClientGetter = func() (sitebuild.BuildHistoryClient, error) { return idleCodeBuild{}, nil }
	if err := Handler(context.Background()); err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
}

type staleStartDynamoDB struct {
	idleDynamoDB
	state sitebuild.State
}

func (db staleStartDynamoDB) GetItem(context.Context, *dynamodb.GetItemInput, ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error) {
	item, err := attributevalue.MarshalMap(db.state)
	return &dynamodb.GetItemOutput{Item: item}, err
}

type historyCodeBuild struct {
	listCalls  int
	startCalls int
}

func (c *historyCodeBuild) StartBuild(context.Context, *codebuild.StartBuildInput, ...func(*codebuild.Options)) (*codebuild.StartBuildOutput, error) {
	c.startCalls++
	return &codebuild.StartBuildOutput{}, nil
}

func (c *historyCodeBuild) ListBuildsForProject(context.Context, *codebuild.ListBuildsForProjectInput, ...func(*codebuild.Options)) (*codebuild.ListBuildsForProjectOutput, error) {
	c.listCalls++
	return &codebuild.ListBuildsForProjectOutput{Ids: []string{"site-project:build-2"}}, nil
}

func (c *historyCodeBuild) BatchGetBuilds(context.Context, *codebuild.BatchGetBuildsInput, ...func(*codebuild.Options)) (*codebuild.BatchGetBuildsOutput, error) {
	return &codebuild.BatchGetBuildsOutput{Builds: []codebuildtypes.Build{{
		Id: aws.String("site-project:build-2"), BuildStatus: codebuildtypes.StatusTypeInProgress, StartTime: aws.Time(time.Now().Add(-10 * time.Minute)),
		Environment: &codebuildtypes.ProjectEnvironment{EnvironmentVariables: []codebuildtypes.EnvironmentVariable{
			{Name: aws.String("CONTENT_REVISION"), Value: aws.String("2")},
		}},
	}}}, nil
}

// The reconciler is the only caller allowed to read build history, so a lost
// Build ID past the IdempotencyToken lifetime is recovered here (#902).
func TestHandlerRecoversExpiredStartFromBuildHistory(t *testing.T) {
	preserveClientGetters(t)
	t.Setenv("TABLE_NAME", "posts")
	t.Setenv("CODEBUILD_PROJECT_NAME", "site-project")
	attemptedAt := time.Now().Add(-10 * time.Minute).UTC().Format(time.RFC3339Nano)
	dynamoClientGetter = func() (sitebuild.DynamoDBClient, error) {
		return staleStartDynamoDB{state: sitebuild.State{
			ID: sitebuild.StateItemID, DesiredRevision: 2, DeployedRevision: 1, ActiveRevision: 2,
			StartToken: "site-revision-2", Status: sitebuild.StatusStarting, StartedAt: attemptedAt, StartAttemptedAt: attemptedAt,
		}}, nil
	}
	codebuildClient := &historyCodeBuild{}
	codebuildClientGetter = func() (sitebuild.BuildHistoryClient, error) { return codebuildClient, nil }
	if err := Handler(context.Background()); err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if codebuildClient.listCalls != 1 || codebuildClient.startCalls != 0 {
		t.Fatalf("expected history recovery without StartBuild, list=%d start=%d", codebuildClient.listCalls, codebuildClient.startCalls)
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
			codebuildClientGetter = func() (sitebuild.BuildHistoryClient, error) { return idleCodeBuild{}, nil }
			if failure == "CodeBuild client" {
				codebuildClientGetter = func() (sitebuild.BuildHistoryClient, error) { return nil, cause }
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
