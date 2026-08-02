package main

import (
	"context"
	"errors"
	"testing"

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
	t.Setenv("TABLE_NAME", "posts")
	t.Setenv("CODEBUILD_PROJECT_NAME", "site-project")
	want := errors.New("dynamodb unavailable")
	dynamoClientGetter = func() (sitebuild.DynamoDBClient, error) { return nil, want }
	if err := Handler(context.Background()); !errors.Is(err, want) {
		t.Fatalf("expected DynamoDB error, got %v", err)
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
