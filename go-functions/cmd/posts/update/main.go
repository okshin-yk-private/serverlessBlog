// Package main provides the UpdatePost Lambda function for updating blog posts.
//
// Requirement 3.5: 記事更新 (PUT /posts/:id)
//   - 認証付きの有効な記事更新リクエストを受信したとき、UpdatePost LambdaはDynamoDBで指定されたフィールドを更新する
//   - contentMarkdownが更新されたとき、UpdatePost LambdaはcontentHtmlを再生成する
//   - publishStatusが"draft"から"published"に変更されたとき、UpdatePost LambdaはpublishedAtタイムスタンプを設定する
//   - 記事IDが存在しない場合、UpdatePost LambdaはHTTP 404を返す
//   - リクエストに有効な認証がない場合、UpdatePost LambdaはHTTP 401を返す
package main

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

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

// markdownConverter is a function that converts markdown to HTML
// This can be overridden in tests
var markdownConverter = func(md string) (string, error) {
	return markdown.ConvertToHTML(md)
}

// Handler handles PUT /posts/:id requests
func Handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Validate authentication first
	userID := getUserIDFromRequest(request)
	if userID == "" {
		return errorResponse(401, "unauthorized")
	}

	// Validate post ID from path parameters
	postID := request.PathParameters["id"]
	if postID == "" {
		return errorResponse(400, "post ID is required")
	}

	// Validate request body is present
	if request.Body == "" {
		return errorResponse(400, "request body is required")
	}

	// Parse request body
	var req domain.UpdatePostRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return errorResponse(400, "invalid JSON format")
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

	// Get existing post from DynamoDB
	getInput := &dynamodb.GetItemInput{
		TableName: &tableName,
		Key: map[string]types.AttributeValue{
			"id": &types.AttributeValueMemberS{Value: postID},
		},
	}

	result, err := dynamoClient.GetItem(ctx, getInput)
	if err != nil {
		return errorResponse(500, "failed to retrieve post")
	}

	// Check if item was found
	if len(result.Item) == 0 {
		return errorResponse(404, "post not found")
	}

	// Unmarshal the existing post
	var existingPost domain.BlogPost
	if err := attributevalue.UnmarshalMap(result.Item, &existingPost); err != nil {
		return errorResponse(500, "failed to parse post data")
	}

	// Validate update fields
	if err := validateUpdateRequest(&req); err != nil {
		return errorResponse(400, err.Error())
	}

	// Apply updates to the post
	updatedPost := applyUpdates(&existingPost, &req)

	// If contentMarkdown was updated, regenerate contentHtml
	if req.ContentMarkdown != nil {
		contentHTML, err := markdownConverter(*req.ContentMarkdown)
		if err != nil {
			return errorResponse(500, "failed to convert markdown")
		}
		updatedPost.ContentHTML = contentHTML
	}

	// Handle publishStatus transition (draft -> published)
	if req.PublishStatus != nil && *req.PublishStatus == domain.PublishStatusPublished {
		if existingPost.PublishStatus == domain.PublishStatusDraft && existingPost.PublishedAt == nil {
			now := time.Now().UTC().Format(time.RFC3339)
			updatedPost.PublishedAt = &now
		}
	}

	// Update the updatedAt timestamp
	updatedPost.UpdatedAt = time.Now().UTC().Format(time.RFC3339)

	// Ensure immutable fields are not changed
	updatedPost.ID = existingPost.ID
	updatedPost.AuthorID = existingPost.AuthorID
	updatedPost.CreatedAt = existingPost.CreatedAt

	// Marshal to DynamoDB attribute value
	av, err := attributevalue.MarshalMap(updatedPost)
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
		return errorResponse(500, "failed to update post")
	}

	// Return updated post with 200 status
	return middleware.JSONResponse(200, updatedPost)
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
