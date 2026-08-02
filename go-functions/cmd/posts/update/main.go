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
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"serverless-blog/go-functions/internal/auth"
	"serverless-blog/go-functions/internal/buildtrigger"
	"serverless-blog/go-functions/internal/clients"
	"serverless-blog/go-functions/internal/domain"
	"serverless-blog/go-functions/internal/markdown"
	"serverless-blog/go-functions/internal/middleware"
	"serverless-blog/go-functions/internal/sitebuild"
)

// DynamoDBClientInterface defines the interface for DynamoDB operations (for testing)
type DynamoDBClientInterface interface {
	GetItem(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error)
	PutItem(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error)
	UpdateItem(ctx context.Context, params *dynamodb.UpdateItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.UpdateItemOutput, error)
	TransactWriteItems(ctx context.Context, params *dynamodb.TransactWriteItemsInput, optFns ...func(*dynamodb.Options)) (*dynamodb.TransactWriteItemsOutput, error)
	Query(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error)
}

type postMutationResponse struct {
	domain.BlogPost
	SiteBuild *sitebuild.Request `json:"siteBuild,omitempty"`
}

const (
	errTitleCannotBeEmpty           = "title cannot be empty"
	errContentMarkdownCannotBeEmpty = "contentMarkdown cannot be empty"
)

// slugIndexName returns the SlugIndex GSI name (overridable via env for tests).
func slugIndexName() string {
	if v := os.Getenv("SLUG_INDEX_NAME"); v != "" {
		return v
	}
	return "SlugIndex"
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

// Handler handles PUT /posts/:id requests.
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
	normalizeAutosaveRequest(req)

	// Validate update fields
	if validateErr := validateUpdateRequest(req); validateErr != nil {
		return errorResponse(400, validateErr.Error())
	}

	// PR6: domain-level validation (slug regex/format)
	if validateErr := req.Validate(); validateErr != nil {
		return errorResponse(400, validateErr.Error())
	}

	// PR6: enforce slug uniqueness across other posts when slug changes.
	if shouldCheckSlug(existingPost, req) {
		exists, err := checkSlugExistsForOther(ctx, dynamoClient, tableName, *req.Slug, postID)
		if err != nil {
			return errorResponse(500, "failed to check slug uniqueness")
		}
		if exists {
			return errorResponse(409, "post with this slug already exists")
		}
	}

	// Build updated post
	updatedPost, errResp := buildUpdatedPost(existingPost, req)
	if errResp != nil {
		return *errResp, nil
	}

	requiresBuild := shouldTriggerBuild(existingPost, req)
	if errResp := savePost(ctx, dynamoClient, tableName, updatedPost, requiresBuild); errResp != nil {
		return *errResp, nil
	}

	var siteBuildRequest *sitebuild.Request
	if requiresBuild {
		request := triggerSiteBuild(ctx, dynamoClient, tableName)
		siteBuildRequest = &request
	}

	// Return updated post with 200 status
	return middleware.JSONResponse(200, postMutationResponse{BlogPost: *updatedPost, SiteBuild: siteBuildRequest})
}

func normalizeAutosaveRequest(req *domain.UpdatePostRequest) {
	if req.SaveMode != domain.SaveModeAutosave {
		return
	}
	req.PublishStatus = nil
	if req.Category != nil && strings.TrimSpace(*req.Category) == "" {
		req.Category = nil
	}
}

// validateAndParseRequest validates authentication and parses the request body
// Returns postID, request, userID, and error response
func validateAndParseRequest(request events.APIGatewayProxyRequest) (postID string, req *domain.UpdatePostRequest, userID string, errResp *events.APIGatewayProxyResponse) {
	// Validate authentication
	userID = auth.UserID(request)
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
func shouldTriggerBuild(existingPost *domain.BlogPost, req *domain.UpdatePostRequest) bool {
	if req.SaveMode == domain.SaveModeAutosave {
		return false
	}
	if existingPost.PublishStatus == domain.PublishStatusPublished {
		return true
	}
	return req.PublishStatus != nil && *req.PublishStatus == domain.PublishStatusPublished
}

// triggerSiteBuild triggers the Astro SSG build via CodeBuild
// Requirement 10.1, 10.2, 10.10: Trigger CodeBuild, handle errors gracefully
func triggerSiteBuild(ctx context.Context, dynamoClient DynamoDBClientInterface, tableName string) sitebuild.Request {
	// Get CodeBuild project name from environment, sanitized at the trust boundary
	projectName := buildtrigger.SanitizeProjectName(os.Getenv("CODEBUILD_PROJECT_NAME"))
	if projectName == "" {
		slog.Warn("CODEBUILD_PROJECT_NAME not set or invalid, skipping build trigger")
		return sitebuild.CurrentRequest(ctx, dynamoClient, tableName)
	}

	// Get CodeBuild client
	client, err := codebuildClientGetter()
	if err != nil {
		slog.Error("failed to get CodeBuild client", "error", err)
		return sitebuild.CurrentRequest(ctx, dynamoClient, tableName)
	}

	// Create and use build trigger
	coordinator := sitebuild.NewCoordinator(dynamoClient, client, tableName, projectName)
	request, err := coordinator.StartPending(ctx)
	if err != nil {
		// Requirement 10.10: Handle CodeBuild API errors gracefully
		slog.Error("failed to trigger site build", "error", err, "project", projectName)
		state, stateErr := coordinator.GetState(ctx)
		if stateErr == nil {
			return sitebuild.RequestForState(state, state.DesiredRevision)
		}
		return sitebuild.Request{Status: sitebuild.StatusFailed}
	}

	slog.Info("site build triggered successfully", "project", projectName)
	return request
}

// savePost saves the updated post to DynamoDB
func savePost(ctx context.Context, client DynamoDBClientInterface, tableName string, post *domain.BlogPost, requestBuild bool) *events.APIGatewayProxyResponse {
	av, err := attributevalue.MarshalMap(post)
	if err != nil {
		resp, _ := errorResponse(500, "failed to marshal post")
		return &resp
	}

	if requestBuild {
		_, err = client.TransactWriteItems(ctx, &dynamodb.TransactWriteItemsInput{TransactItems: []types.TransactWriteItem{
			{Put: &types.Put{TableName: &tableName, Item: av}},
			sitebuild.RequestUpdate(tableName, time.Now()),
		}})
	} else {
		_, err = client.PutItem(ctx, &dynamodb.PutItemInput{TableName: &tableName, Item: av})
	}
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
		return &validationError{message: errTitleCannotBeEmpty}
	}

	// If contentMarkdown is provided, it must not be empty
	if req.ContentMarkdown != nil && strings.TrimSpace(*req.ContentMarkdown) == "" {
		return &validationError{message: errContentMarkdownCannotBeEmpty}
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

	// PR6: writer-experience metadata. Pointers are forwarded as-is so
	// "explicit empty string" is rejected upstream by domain.UpdatePostRequest.Validate
	// for slug, while excerpt/coverImageUrl accept any string (including empty
	// to clear a value — pointer-nil leaves the existing value untouched).
	if req.Slug != nil {
		updated.Slug = req.Slug
	}
	if req.Excerpt != nil {
		updated.Excerpt = req.Excerpt
	}
	if req.CoverImageURL != nil {
		updated.CoverImageURL = req.CoverImageURL
	}

	return updated
}

// shouldCheckSlug reports whether the request changes the slug to a non-current
// value. If the request's slug equals the existing slug, no Query is needed.
func shouldCheckSlug(existing *domain.BlogPost, req *domain.UpdatePostRequest) bool {
	if req.Slug == nil {
		return false
	}
	if existing.Slug != nil && *existing.Slug == *req.Slug {
		return false
	}
	return true
}

// checkSlugExistsForOther returns true if a different BlogPost (id != currentPostID)
// already owns the given slug. Uses the SlugIndex GSI.
func checkSlugExistsForOther(ctx context.Context, client DynamoDBClientInterface, tableName, slug, currentPostID string) (bool, error) {
	out, err := client.Query(ctx, &dynamodb.QueryInput{
		TableName:              aws.String(tableName),
		IndexName:              aws.String(slugIndexName()),
		KeyConditionExpression: aws.String("slug = :slug"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":slug": &types.AttributeValueMemberS{Value: slug},
		},
		// We need to inspect items to compare id; cap to a small page since slug
		// is intended-unique (Limit:2 lets us detect a duplicate without paging).
		Limit: aws.Int32(2),
	})
	if err != nil {
		return false, err
	}
	if out.Count == 0 {
		return false, nil
	}
	for _, item := range out.Items {
		var bp domain.BlogPost
		if err := attributevalue.UnmarshalMap(item, &bp); err != nil {
			continue
		}
		if bp.ID != currentPostID {
			return true, nil
		}
	}
	return false, nil
}

// validationError represents a validation error
type validationError struct {
	message string
}

func (e *validationError) Error() string {
	return e.message
}

// errorResponse creates an error response with CORS headers
func errorResponse(statusCode int, message string) (events.APIGatewayProxyResponse, error) {
	return middleware.JSONResponse(statusCode, domain.ErrorResponse{Message: message})
}

func main() {
	lambda.Start(Handler)
}
