// Package main reconciles durable site-build state with CodeBuild.
package main

import (
	"context"
	"errors"
	"fmt"
	"os"

	"github.com/aws/aws-lambda-go/lambda"

	"serverless-blog/go-functions/internal/buildtrigger"
	"serverless-blog/go-functions/internal/clients"
	"serverless-blog/go-functions/internal/middleware"
	"serverless-blog/go-functions/internal/sitebuild"
)

var dynamoClientGetter = func() (sitebuild.DynamoDBClient, error) { return clients.GetDynamoDB() }
var codebuildClientGetter = func() (sitebuild.CodeBuildClient, error) { return clients.GetCodeBuild() }

// Handler accepts both CodeBuild State Change events and scheduled events.
// The event payload is intentionally not trusted for state transitions; the
// active Build ID persisted in DynamoDB is reconciled through BatchGetBuilds.
func Handler(ctx context.Context) (err error) {
	ctx = middleware.WithInvocationLogger(ctx)
	logger := middleware.LoggerFromContext(ctx)
	defer func() {
		if err != nil {
			logger.Error("site build reconciliation failed", "error", err)
		}
	}()
	tableName := os.Getenv("TABLE_NAME")
	projectName := buildtrigger.SanitizeProjectName(os.Getenv("CODEBUILD_PROJECT_NAME"))
	if tableName == "" || projectName == "" {
		return errors.New("site build reconciler is not configured")
	}
	dynamoClient, err := dynamoClientGetter()
	if err != nil {
		return fmt.Errorf("get DynamoDB client: %w", err)
	}
	codebuildClient, err := codebuildClientGetter()
	if err != nil {
		return fmt.Errorf("get CodeBuild client: %w", err)
	}
	state, err := sitebuild.NewCoordinator(dynamoClient, codebuildClient, tableName, projectName).Reconcile(ctx)
	if err != nil {
		return err
	}
	logger.Info("site build state reconciled",
		"desiredRevision", state.DesiredRevision,
		"deployedRevision", state.DeployedRevision,
		"activeRevision", state.ActiveRevision,
		"status", state.Status,
	)
	return nil
}

func main() {
	lambda.Start(Handler)
}
