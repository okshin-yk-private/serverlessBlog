// Package main provides the UpdateMindmap Lambda function for updating mindmaps.
//
// Requirement 1.4: マインドマップ更新 (PUT /admin/mindmaps/:id)
// Requirement 8.4: PUT /mindmaps/:id エンドポイント（認証必須）
// Requirement 4.5, 4.6: バリデーション（サイズ、ノード数）
// Requirement 8.8: 存在しないIDの場合は404を返却
package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"os"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"serverless-blog/go-functions/internal/buildtrigger"
	"serverless-blog/go-functions/internal/clients"
	"serverless-blog/go-functions/internal/domain"
	"serverless-blog/go-functions/internal/middleware"
)

// DynamoDBClientInterface defines the interface for DynamoDB operations (for testing)
type DynamoDBClientInterface interface {
	GetItem(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error)
	PutItem(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error)
}

// dynamoClientGetter is a function that returns the DynamoDB client
var dynamoClientGetter = func() (DynamoDBClientInterface, error) {
	return clients.GetDynamoDB()
}

// codebuildClientGetter is a function that returns the CodeBuild client
var codebuildClientGetter = clients.GetCodeBuild

// Handler handles PUT /admin/mindmaps/:id requests
func Handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	userID := extractAuthorID(request)
	if userID == "" {
		return errorResponse(401, "unauthorized")
	}

	mindmapID := request.PathParameters["id"]
	if mindmapID == "" {
		return errorResponse(400, "mindmap ID is required")
	}

	req, parseErr := parseUpdateRequest(request.Body)
	if parseErr != nil {
		return errorResponse(400, parseErr.Error())
	}

	tableName := os.Getenv("TABLE_NAME")
	if tableName == "" {
		return errorResponse(500, "server configuration error")
	}

	dynamoClient, err := dynamoClientGetter()
	if err != nil {
		return errorResponse(500, "server error")
	}

	existing, statusCode, fetchErr := fetchAndVerifyOwnership(ctx, dynamoClient, tableName, mindmapID, userID)
	if fetchErr != nil {
		return errorResponse(statusCode, fetchErr.Error())
	}

	previousStatus := existing.PublishStatus
	applyUpdates(existing, req)

	av, err := attributevalue.MarshalMap(existing)
	if err != nil {
		return errorResponse(500, "failed to marshal mindmap")
	}
	_, err = dynamoClient.PutItem(ctx, &dynamodb.PutItemInput{
		TableName: &tableName,
		Item:      av,
	})
	if err != nil {
		return errorResponse(500, "failed to update mindmap")
	}

	if shouldTriggerBuild(req, previousStatus) {
		triggerSiteBuild(ctx)
	}

	return middleware.JSONResponse(200, existing)
}

// parseUpdateRequest parses and validates the update request body
func parseUpdateRequest(body string) (*domain.UpdateMindmapRequest, error) {
	if body == "" {
		return nil, errors.New("request body is required")
	}
	var req domain.UpdateMindmapRequest
	if err := json.Unmarshal([]byte(body), &req); err != nil {
		return nil, errors.New("invalid request body")
	}
	if err := req.Validate(); err != nil {
		return nil, err
	}
	return &req, nil
}

// fetchAndVerifyOwnership retrieves a mindmap and verifies the user owns it
func fetchAndVerifyOwnership(ctx context.Context, client DynamoDBClientInterface, tableName, mindmapID, userID string) (*domain.Mindmap, int, error) {
	result, err := client.GetItem(ctx, &dynamodb.GetItemInput{
		TableName: &tableName,
		Key: map[string]types.AttributeValue{
			"id": &types.AttributeValueMemberS{Value: mindmapID},
		},
	})
	if err != nil {
		return nil, 500, errors.New("failed to retrieve mindmap")
	}
	if len(result.Item) == 0 {
		return nil, 404, errors.New("mindmap not found")
	}

	var existing domain.Mindmap
	if err = attributevalue.UnmarshalMap(result.Item, &existing); err != nil {
		return nil, 500, errors.New("failed to parse mindmap data")
	}
	if existing.AuthorID != userID {
		return nil, 403, errors.New("forbidden: you can only update your own mindmaps")
	}
	return &existing, 0, nil
}

// applyUpdates applies the request fields to the existing mindmap
func applyUpdates(existing *domain.Mindmap, req *domain.UpdateMindmapRequest) {
	if req.Title != nil {
		existing.Title = *req.Title
	}
	if req.Nodes != nil {
		existing.Nodes = *req.Nodes
	}
	if req.PublishStatus != nil {
		previousStatus := existing.PublishStatus
		existing.PublishStatus = *req.PublishStatus
		if *req.PublishStatus == domain.PublishStatusPublished && previousStatus == domain.PublishStatusDraft {
			now := time.Now().UTC().Format(time.RFC3339)
			existing.PublishedAt = &now
		}
	}
	existing.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
}

// shouldTriggerBuild determines if the SSG build should be triggered
func shouldTriggerBuild(req *domain.UpdateMindmapRequest, previousStatus string) bool {
	if req.PublishStatus != nil && *req.PublishStatus == domain.PublishStatusPublished {
		return true
	}
	return previousStatus == domain.PublishStatusPublished && (req.Title != nil || req.Nodes != nil)
}

// extractAuthorID extracts the user ID from Cognito authorizer claims
func extractAuthorID(request events.APIGatewayProxyRequest) string {
	if request.RequestContext.Authorizer == nil {
		return ""
	}
	claims, ok := request.RequestContext.Authorizer["claims"]
	if !ok {
		return ""
	}
	claimsMap, ok := claims.(map[string]interface{})
	if !ok {
		return ""
	}
	sub, ok := claimsMap["sub"]
	if !ok {
		return ""
	}
	subStr, ok := sub.(string)
	if !ok {
		return ""
	}
	return subStr
}

// errorResponse creates an error response with CORS headers
func errorResponse(statusCode int, message string) (events.APIGatewayProxyResponse, error) {
	return middleware.JSONResponse(statusCode, domain.ErrorResponse{Message: message})
}

// triggerSiteBuild triggers the Astro SSG build via CodeBuild
func triggerSiteBuild(ctx context.Context) {
	projectName := os.Getenv("CODEBUILD_PROJECT_NAME")
	if projectName == "" {
		slog.Warn("CODEBUILD_PROJECT_NAME not set, skipping build trigger")
		return
	}
	client, err := codebuildClientGetter()
	if err != nil {
		slog.Error("failed to get CodeBuild client", "error", err)
		return
	}
	trigger := buildtrigger.NewBuildTrigger(client, projectName)
	if err := trigger.TriggerBuild(ctx); err != nil {
		slog.Error("failed to trigger site build", "error", err, "project", projectName)
		return
	}
	slog.Info("site build triggered successfully", "project", projectName)
}

func main() {
	lambda.Start(Handler)
}
