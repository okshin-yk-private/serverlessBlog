// Package main provides the CreateMindmap Lambda function for creating mindmaps.
//
// Requirement 1.1: マインドマップ作成 (POST /admin/mindmaps)
//   - Cognito認証からauthorIDを抽出し、リクエストボディをバリデーションする
//   - UUIDを生成し、タイムスタンプを付与してDynamoDBにPutItemする
//   - 公開ステータスがpublishedの場合、SSG再ビルドをトリガーする
//   - 201ステータスで作成されたマインドマップを返却する
//
// Requirement 8.1: POST /mindmaps エンドポイント
// Requirement 8.9: バリデーションエラー時に400を返却
package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/google/uuid"

	"serverless-blog/go-functions/internal/buildtrigger"
	"serverless-blog/go-functions/internal/clients"
	"serverless-blog/go-functions/internal/domain"
	"serverless-blog/go-functions/internal/middleware"
)

// DynamoDBClientInterface defines the interface for DynamoDB operations (for testing)
type DynamoDBClientInterface interface {
	PutItem(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error)
}

// dynamoClientGetter is a function that returns the DynamoDB client
var dynamoClientGetter = func() (DynamoDBClientInterface, error) {
	return clients.GetDynamoDB()
}

// codebuildClientGetter is a function that returns the CodeBuild client
var codebuildClientGetter = clients.GetCodeBuild

// uuidGenerator is a function that generates a new UUID
var uuidGenerator = func() string {
	return uuid.New().String()
}

// Handler handles POST /admin/mindmaps requests
func Handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Extract author ID from Cognito claims
	authorID := extractAuthorID(request)
	if authorID == "" {
		return errorResponse(401, "unauthorized")
	}

	// Parse request body
	var req domain.CreateMindmapRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return errorResponse(400, "invalid request body")
	}

	// Validate request
	if err := req.Validate(); err != nil {
		return errorResponse(400, err.Error())
	}

	// Check for TABLE_NAME
	tableName := os.Getenv("TABLE_NAME")
	if tableName == "" {
		return errorResponse(500, "server configuration error")
	}

	// Get DynamoDB client
	dynamoClient, err := dynamoClientGetter()
	if err != nil {
		return errorResponse(500, "server error")
	}

	// Generate UUID and timestamps
	mindmapID := uuidGenerator()
	now := time.Now().UTC().Format(time.RFC3339)

	// Determine publishedAt
	var publishedAt *string
	if req.PublishStatus == domain.PublishStatusPublished {
		publishedAt = &now
	}

	// Create mindmap entity
	mindmap := domain.Mindmap{
		ID:            mindmapID,
		Title:         req.Title,
		Nodes:         req.Nodes,
		PublishStatus: req.PublishStatus,
		AuthorID:      authorID,
		CreatedAt:     now,
		UpdatedAt:     now,
		PublishedAt:   publishedAt,
	}

	// Marshal to DynamoDB attribute value
	av, err := attributevalue.MarshalMap(mindmap)
	if err != nil {
		return errorResponse(500, "failed to marshal mindmap")
	}

	// Save to DynamoDB
	putInput := &dynamodb.PutItemInput{
		TableName: &tableName,
		Item:      av,
	}

	_, err = dynamoClient.PutItem(ctx, putInput)
	if err != nil {
		return errorResponse(500, "failed to create mindmap")
	}

	// Trigger CodeBuild if published
	if req.PublishStatus == domain.PublishStatusPublished {
		triggerSiteBuild(ctx)
	}

	return middleware.JSONResponse(201, mindmap)
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
