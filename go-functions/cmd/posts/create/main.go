// Package main provides the CreatePost Lambda function for creating blog posts.
//
// Requirement 3.1: 記事作成 (POST /posts)
//   - 認証付きの有効な記事作成リクエストを受信したとき、CreatePost Lambdaは
//     生成されたUUIDで新しい記事をDynamoDBに作成する
//   - リクエストにcontentMarkdownが含まれているとき、markdownパッケージを使用して
//     contentHtmlに変換する
//   - 必須フィールド（title、contentMarkdown）が欠けている場合、HTTP 400を返す
//   - 有効な認証がない場合、HTTP 401を返す
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
	"serverless-blog/go-functions/internal/markdown"
	"serverless-blog/go-functions/internal/middleware"
)

// DynamoDBClientInterface defines the interface for DynamoDB operations (for testing)
type DynamoDBClientInterface interface {
	PutItem(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error)
}

// dynamoClientGetter is a function that returns the DynamoDB client
// This can be overridden in tests
var dynamoClientGetter = func() (DynamoDBClientInterface, error) {
	return clients.GetDynamoDB()
}

// markdownConverter is a function that converts markdown to HTML
// This can be overridden in tests
var markdownConverter = markdown.ConvertToHTML

// codebuildClientGetter is a function that returns the CodeBuild client
// This can be overridden in tests
var codebuildClientGetter = clients.GetCodeBuild

// uuidGenerator is a function that generates a new UUID
// This can be overridden in tests
var uuidGenerator = func() string {
	return uuid.New().String()
}

// Handler handles POST /posts requests
func Handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Extract author ID from Cognito claims (authentication check)
	authorID := extractAuthorID(request)
	if authorID == "" {
		return errorResponse(401, "unauthorized")
	}

	// Parse request body
	var req domain.CreatePostRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return errorResponse(400, "invalid request body")
	}

	// Validate required fields
	if err := req.Validate(); err != nil {
		return errorResponse(400, err.Error())
	}

	// Check for TABLE_NAME
	tableName := os.Getenv("TABLE_NAME")
	if tableName == "" {
		return errorResponse(500, "server configuration error")
	}

	// Convert Markdown to HTML
	contentHTML, err := markdownConverter(req.ContentMarkdown)
	if err != nil {
		return errorResponse(500, "failed to convert markdown")
	}

	// Get DynamoDB client
	dynamoClient, err := dynamoClientGetter()
	if err != nil {
		return errorResponse(500, "server error")
	}

	// Generate UUID and timestamps
	postID := uuidGenerator()
	now := time.Now().UTC().Format(time.RFC3339)

	// Determine publish status and publishedAt
	publishStatus := domain.PublishStatusDraft
	var publishedAt *string
	if req.PublishStatus != nil && *req.PublishStatus == domain.PublishStatusPublished {
		publishStatus = domain.PublishStatusPublished
		publishedAt = &now
	}

	// Ensure tags and imageUrls are not nil (empty arrays for JSON serialization)
	tags := req.Tags
	if tags == nil {
		tags = []string{}
	}
	imageURLs := req.ImageURLs
	if imageURLs == nil {
		imageURLs = []string{}
	}

	// Create post entity
	post := domain.BlogPost{
		ID:              postID,
		Title:           req.Title,
		ContentMarkdown: req.ContentMarkdown,
		ContentHTML:     contentHTML,
		Category:        req.Category,
		Tags:            tags,
		PublishStatus:   publishStatus,
		AuthorID:        authorID,
		CreatedAt:       now,
		UpdatedAt:       now,
		PublishedAt:     publishedAt,
		ImageURLs:       imageURLs,
	}

	// Marshal to DynamoDB attribute value
	av, err := attributevalue.MarshalMap(post)
	if err != nil {
		return errorResponse(500, "failed to marshal post")
	}

	// Save to DynamoDB
	putInput := &dynamodb.PutItemInput{
		TableName: &tableName,
		Item:      av,
	}

	_, err = dynamoClient.PutItem(ctx, putInput)
	if err != nil {
		return errorResponse(500, "failed to create post")
	}

	// Trigger CodeBuild if post is created as published
	// Requirement 10.1: Trigger site rebuild when post is published
	if publishStatus == domain.PublishStatusPublished {
		triggerSiteBuild(ctx)
	}

	// Return created post with 201 status
	return middleware.JSONResponse(201, post)
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
// Requirement 10.1: Trigger CodeBuild when post is published
func triggerSiteBuild(ctx context.Context) {
	projectName := buildtrigger.SanitizeProjectName(os.Getenv("CODEBUILD_PROJECT_NAME"))
	if projectName == "" {
		slog.Warn("CODEBUILD_PROJECT_NAME not set or invalid, skipping build trigger")
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
