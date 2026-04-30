// Package main provides the UpdatePost Lambda function for updating blog posts.
//
// Requirement 3.5: 記事更新 (PUT /posts/:id)
//   - 認証付きの有効な記事更新リクエストを受信したとき、UpdatePost LambdaはDynamoDBで指定されたフィールドを更新する
//   - contentMarkdownが更新されたとき、UpdatePost LambdaはcontentHtmlを再生成する
//   - publishStatusが"draft"から"published"に変更されたとき、UpdatePost LambdaはpublishedAtタイムスタンプを設定する
//   - 記事IDが存在しない場合、UpdatePost LambdaはHTTP 404を返す
//   - リクエストに有効な認証がない場合、UpdatePost LambdaはHTTP 401を返す
//
// Requirement 10.1: 記事公開時にCodeBuildトリガー
//   - publishStatusが"published"に変更されたとき、CodeBuildプロジェクトを起動してサイトを再ビルドする
//   - ビルドは非同期で実行され、Lambda応答には影響しない
package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"serverless-blog/go-functions/internal/buildtrigger"
	"serverless-blog/go-functions/internal/clients"
	"serverless-blog/go-functions/internal/domain"
	"serverless-blog/go-functions/internal/markdown"
	"serverless-blog/go-functions/internal/middleware"
)

// DynamoDBClientInterface defines the interface for DynamoDB operations (for testing)
type DynamoDBClientInterface interface {
	GetItem(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error)
	PutItem(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error)
}

// dynamoClientGetter is a function that returns the DynamoDB client
// This can be overridden in tests
var dynamoClientGetter = func() (DynamoDBClientInterface, error) {
	return clients.GetDynamoDB()
}

// codebuildClientGetter is a function that returns the CodeBuild client
// This can be overridden in tests
var codebuildClientGetter = clients.GetCodeBuild

// markdownConverter is a function that converts markdown to HTML
// This can be overridden in tests
var markdownConverter = markdown.ConvertToHTML

// Handler handles PUT /posts/:id requests
func Handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Validate and parse request
	postID, req, userID, errResp := validateAndParseRequest(request)
	if errResp != nil {
		return *errResp, nil
	}

	// Get DynamoDB client and table name
	dynamoClient, tableName, errResp := getClientAndTable()
	if errResp != nil {
		return *errResp, nil
	}

	// Get existing post from DynamoDB
	existingPost, errResp := getExistingPost(ctx, dynamoClient, tableName, postID)
	if errResp != nil {
		return *errResp, nil
	}

	// Security: Verify ownership - only the author can update their post
	if existingPost.AuthorID != userID {
		return errorResponse(403, "forbidden: you can only update your own posts")
	}

	// Validate update fields
	if validateErr := validateUpdateRequest(req); validateErr != nil {
		return errorResponse(400, validateErr.Error())
	}

	// Build updated post
	updatedPost, errResp := buildUpdatedPost(existingPost, req)
	if errResp != nil {
		return *errResp, nil
	}

	// Save to DynamoDB
	if errResp := savePost(ctx, dynamoClient, tableName, updatedPost); errResp != nil {
		return *errResp, nil
	}

	// Trigger CodeBuild if publishStatus changed to "published"
	// Requirement 10.1: Trigger CodeBuild for site rebuild when post is published
	// Requirement 10.10: Handle CodeBuild API errors gracefully without affecting post update response
	if shouldTriggerBuild(existingPost, req) {
		triggerSiteBuild(ctx)
	}

	// Return updated post with 200 status
	return middleware.JSONResponse(200, updatedPost)
}

// validateAndParseRequest validates authentication and parses the request body
// Returns postID, request, userID, and error response
func validateAndParseRequest(request events.APIGatewayProxyRequest) (postID string, req *domain.UpdatePostRequest, userID string, errResp *events.APIGatewayProxyResponse) {
	// Validate authentication
	userID = getUserIDFromRequest(request)
	if userID == "" {
		resp, _ := errorResponse(401, "unauthorized")
		return "", nil, "", &resp
	}

	// Validate post ID
	postID = request.PathParameters["id"]
	if postID == "" {
		resp, _ := errorResponse(400, "post ID is required")
		return "", nil, "", &resp
	}

	// Validate request body is present
	if request.Body == "" {
		resp, _ := errorResponse(400, "request body is required")
		return "", nil, "", &resp
	}

	// Parse request body
	var parsedReq domain.UpdatePostRequest
	if err := json.Unmarshal([]byte(request.Body), &parsedReq); err != nil {
		resp, _ := errorResponse(400, "invalid JSON format")
		return "", nil, "", &resp
	}

	return postID, &parsedReq, userID, nil
}

// getClientAndTable returns the DynamoDB client and table name
func getClientAndTable() (DynamoDBClientInterface, string, *events.APIGatewayProxyResponse) {
	tableName := os.Getenv("TABLE_NAME")
	if tableName == "" {
		resp, _ := errorResponse(500, "server configuration error")
		return nil, "", &resp
	}

	dynamoClient, err := dynamoClientGetter()
	if err != nil {
		resp, _ := errorResponse(500, "server error")
		return nil, "", &resp
	}

	return dynamoClient, tableName, nil
}

// getExistingPost retrieves the existing post from DynamoDB
func getExistingPost(ctx context.Context, client DynamoDBClientInterface, tableName, postID string) (*domain.BlogPost, *events.APIGatewayProxyResponse) {
	getInput := &dynamodb.GetItemInput{
		TableName: &tableName,
		Key: map[string]types.AttributeValue{
			"id": &types.AttributeValueMemberS{Value: postID},
		},
	}

	result, err := client.GetItem(ctx, getInput)
	if err != nil {
		resp, _ := errorResponse(500, "failed to retrieve post")
		return nil, &resp
	}

	if len(result.Item) == 0 {
		resp, _ := errorResponse(404, "post not found")
		return nil, &resp
	}

	var existingPost domain.BlogPost
	if err := attributevalue.UnmarshalMap(result.Item, &existingPost); err != nil {
		resp, _ := errorResponse(500, "failed to parse post data")
		return nil, &resp
	}

	return &existingPost, nil
}

// buildUpdatedPost applies updates and returns the updated post
func buildUpdatedPost(existingPost *domain.BlogPost, req *domain.UpdatePostRequest) (*domain.BlogPost, *events.APIGatewayProxyResponse) {
	updatedPost := applyUpdates(existingPost, req)

	// If contentMarkdown was updated, regenerate contentHtml
	if req.ContentMarkdown != nil {
		contentHTML, err := markdownConverter(*req.ContentMarkdown)
		if err != nil {
			resp, _ := errorResponse(500, "failed to convert markdown")
			return nil, &resp
		}
		updatedPost.ContentHTML = contentHTML
	}

	// Handle publishStatus transition (draft -> published)
	if shouldSetPublishedAt(existingPost, req) {
		now := time.Now().UTC().Format(time.RFC3339)
		updatedPost.PublishedAt = &now
	}

	// Update the updatedAt timestamp
	updatedPost.UpdatedAt = time.Now().UTC().Format(time.RFC3339)

	// Ensure immutable fields are not changed
	updatedPost.ID = existingPost.ID
	updatedPost.AuthorID = existingPost.AuthorID
	updatedPost.CreatedAt = existingPost.CreatedAt

	return &updatedPost, nil
}

// shouldSetPublishedAt checks if publishedAt should be set
func shouldSetPublishedAt(existingPost *domain.BlogPost, req *domain.UpdatePostRequest) bool {
	isTransitioningToPublished := req.PublishStatus != nil && *req.PublishStatus == domain.PublishStatusPublished
	isFirstPublish := existingPost.PublishStatus == domain.PublishStatusDraft && existingPost.PublishedAt == nil
	return isTransitioningToPublished && isFirstPublish
}

// shouldTriggerBuild checks if a site rebuild should be triggered
// Requirement 10.1: Trigger CodeBuild when post is published
// Note: existingPost parameter kept for future use (e.g., checking transition from draft)
func shouldTriggerBuild(_ *domain.BlogPost, req *domain.UpdatePostRequest) bool {
	// Only trigger if publishStatus is being set to "published"
	return req.PublishStatus != nil && *req.PublishStatus == domain.PublishStatusPublished
}

// triggerSiteBuild triggers the Astro SSG build via CodeBuild
// Requirement 10.1, 10.2, 10.10: Trigger CodeBuild, handle errors gracefully
func triggerSiteBuild(ctx context.Context) {
	// Get CodeBuild project name from environment, sanitized at the trust boundary
	projectName := buildtrigger.SanitizeProjectName(os.Getenv("CODEBUILD_PROJECT_NAME"))
	if projectName == "" {
		slog.Warn("CODEBUILD_PROJECT_NAME not set or invalid, skipping build trigger")
		return
	}

	// Get CodeBuild client
	client, err := codebuildClientGetter()
	if err != nil {
		slog.Error("failed to get CodeBuild client", "error", err)
		return
	}

	// Create and use build trigger
	trigger := buildtrigger.NewBuildTrigger(client, projectName)

	if err := trigger.TriggerBuild(ctx); err != nil {
		// Requirement 10.10: Handle CodeBuild API errors gracefully
		//nolint:gosec // G706: projectName already passed buildtrigger.SanitizeProjectName regex validation, so no log-injection vector
		slog.Error("failed to trigger site build", "error", err, "project", projectName)
		return
	}

	//nolint:gosec // G706: see above — projectName is regex-validated.
	slog.Info("site build triggered successfully", "project", projectName)
}

// savePost saves the updated post to DynamoDB
func savePost(ctx context.Context, client DynamoDBClientInterface, tableName string, post *domain.BlogPost) *events.APIGatewayProxyResponse {
	av, err := attributevalue.MarshalMap(post)
	if err != nil {
		resp, _ := errorResponse(500, "failed to marshal post")
		return &resp
	}

	putInput := &dynamodb.PutItemInput{
		TableName: &tableName,
		Item:      av,
	}

	_, err = client.PutItem(ctx, putInput)
	if err != nil {
		resp, _ := errorResponse(500, "failed to update post")
		return &resp
	}

	return nil
}

// validateUpdateRequest validates the update request fields
func validateUpdateRequest(req *domain.UpdatePostRequest) error {
	// If title is provided, it must not be empty
	if req.Title != nil && strings.TrimSpace(*req.Title) == "" {
		return &validationError{message: "title cannot be empty"}
	}

	// If contentMarkdown is provided, it must not be empty
	if req.ContentMarkdown != nil && strings.TrimSpace(*req.ContentMarkdown) == "" {
		return &validationError{message: "contentMarkdown cannot be empty"}
	}

	// If category is provided, it must not be empty
	if req.Category != nil && strings.TrimSpace(*req.Category) == "" {
		return &validationError{message: "category cannot be empty"}
	}

	// If publishStatus is provided, it must be valid
	if req.PublishStatus != nil {
		if *req.PublishStatus != domain.PublishStatusDraft && *req.PublishStatus != domain.PublishStatusPublished {
			return &validationError{message: "publishStatus must be 'draft' or 'published'"}
		}
	}

	return nil
}

// applyUpdates applies the update request fields to the existing post
func applyUpdates(existing *domain.BlogPost, req *domain.UpdatePostRequest) domain.BlogPost {
	updated := *existing

	// Apply title update
	if req.Title != nil {
		updated.Title = strings.TrimSpace(*req.Title)
	}

	// Apply contentMarkdown update (HTML will be regenerated later)
	if req.ContentMarkdown != nil {
		updated.ContentMarkdown = *req.ContentMarkdown
	}

	// Apply category update
	if req.Category != nil {
		updated.Category = strings.TrimSpace(*req.Category)
	}

	// Apply tags update
	if req.Tags != nil {
		updated.Tags = req.Tags
	}

	// Apply imageUrls update
	if req.ImageURLs != nil {
		updated.ImageURLs = req.ImageURLs
	}

	// Apply publishStatus update
	if req.PublishStatus != nil {
		updated.PublishStatus = *req.PublishStatus
	}

	return updated
}

// validationError represents a validation error
type validationError struct {
	message string
}

func (e *validationError) Error() string {
	return e.message
}

// getUserIDFromRequest extracts the user ID from the request context
// Returns empty string if user is not authenticated
func getUserIDFromRequest(request events.APIGatewayProxyRequest) string {
	// Check if authorizer is present
	if request.RequestContext.Authorizer == nil {
		return ""
	}

	// Get claims from authorizer
	claims, ok := request.RequestContext.Authorizer["claims"]
	if !ok || claims == nil {
		return ""
	}

	// Type assert claims to map
	claimsMap, ok := claims.(map[string]interface{})
	if !ok {
		return ""
	}

	// Get sub (user ID) from claims
	sub, ok := claimsMap["sub"]
	if !ok {
		return ""
	}

	// Type assert sub to string
	userID, ok := sub.(string)
	if !ok || userID == "" {
		return ""
	}

	return userID
}

// errorResponse creates an error response with CORS headers
func errorResponse(statusCode int, message string) (events.APIGatewayProxyResponse, error) {
	return middleware.JSONResponse(statusCode, domain.ErrorResponse{Message: message})
}

func main() {
	lambda.Start(Handler)
}
