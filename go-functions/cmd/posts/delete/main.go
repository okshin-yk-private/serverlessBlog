// Package main provides the DeletePost Lambda function for deleting blog posts.
//
// Requirement 3.6: 記事削除 (DELETE /posts/:id)
//   - 認証付きの有効な記事削除リクエストを受信したとき、DeletePost LambdaはDynamoDBから記事を削除する
//   - 記事に関連画像がある場合、DeletePost LambdaはS3から画像を削除する
//   - 記事IDが存在しない場合、DeletePost LambdaはHTTP 404を返す
//   - リクエストに有効な認証がない場合、DeletePost LambdaはHTTP 401を返す
//   - 削除が成功したとき、DeletePost LambdaはHTTP 204 No Contentを返す
//
// Requirement 10.11: 公開済み記事削除時にCodeBuildトリガー
//   - 削除された記事がpublishStatus="published"の場合、CodeBuildプロジェクトを起動してサイトを再ビルドする
//   - ビルドは非同期で実行され、Lambda応答には影響しない
package main

import (
	"context"
	"log/slog"
	"net/url"
	"os"
	"strings"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"

	"serverless-blog/go-functions/internal/buildtrigger"
	"serverless-blog/go-functions/internal/clients"
	"serverless-blog/go-functions/internal/domain"
	"serverless-blog/go-functions/internal/middleware"
)

// DynamoDBClientInterface defines the interface for DynamoDB operations (for testing)
type DynamoDBClientInterface interface {
	GetItem(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error)
	DeleteItem(ctx context.Context, params *dynamodb.DeleteItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.DeleteItemOutput, error)
}

// S3ClientInterface defines the interface for S3 operations (for testing)
type S3ClientInterface interface {
	DeleteObjects(ctx context.Context, params *s3.DeleteObjectsInput, optFns ...func(*s3.Options)) (*s3.DeleteObjectsOutput, error)
}

// dynamoClientGetter is a function that returns the DynamoDB client
// This can be overridden in tests
var dynamoClientGetter = func() (DynamoDBClientInterface, error) {
	return clients.GetDynamoDB()
}

// s3ClientGetter is a function that returns the S3 client
// This can be overridden in tests
var s3ClientGetter = func() (S3ClientInterface, error) {
	return clients.GetS3()
}

// codebuildClientGetter is a function that returns the CodeBuild client
// This can be overridden in tests
var codebuildClientGetter = clients.GetCodeBuild

// Handler handles DELETE /posts/:id requests
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
	if unmarshalErr := attributevalue.UnmarshalMap(result.Item, &existingPost); unmarshalErr != nil {
		return errorResponse(500, "failed to parse post data")
	}

	// Security: Verify ownership - only the author can delete their post
	if existingPost.AuthorID != userID {
		return errorResponse(403, "forbidden: you can only delete your own posts")
	}

	// Delete associated images from S3 if any
	if errResp := deletePostImages(ctx, existingPost); errResp != nil {
		return *errResp, nil
	}

	// Delete post from DynamoDB
	deleteInput := &dynamodb.DeleteItemInput{
		TableName: &tableName,
		Key: map[string]types.AttributeValue{
			"id": &types.AttributeValueMemberS{Value: postID},
		},
	}

	_, err = dynamoClient.DeleteItem(ctx, deleteInput)
	if err != nil {
		return errorResponse(500, "failed to delete post")
	}

	// Trigger site rebuild if the deleted post was published
	// Requirement 10.11: Only trigger build for published posts
	if existingPost.PublishStatus == domain.PublishStatusPublished {
		triggerSiteBuild(ctx)
	}

	// Return 204 No Content
	return events.APIGatewayProxyResponse{
		StatusCode: 204,
		Headers:    middleware.CORSHeaders(),
		Body:       "",
	}, nil
}

// deletePostImages deletes associated images from S3
// Returns an error response if deletion fails, nil on success
func deletePostImages(ctx context.Context, post domain.BlogPost) *events.APIGatewayProxyResponse {
	if len(post.ImageURLs) == 0 {
		return nil
	}

	// Check for BUCKET_NAME
	bucketName := os.Getenv("BUCKET_NAME")
	if bucketName == "" {
		resp, _ := errorResponse(500, "server configuration error")
		return &resp
	}

	// Get S3 client
	s3Client, s3Err := s3ClientGetter()
	if s3Err != nil {
		resp, _ := errorResponse(500, "server error")
		return &resp
	}

	// Prepare objects to delete - only delete keys that belong to this user/post
	// Security: Validate S3 keys to prevent deletion of arbitrary objects
	objectsToDelete := make([]s3types.ObjectIdentifier, 0, len(post.ImageURLs))
	for _, imageURL := range post.ImageURLs {
		key := extractS3KeyFromURL(imageURL)
		// Only delete keys that are under the user's prefix or post's prefix
		// Expected formats: "{userId}/..." or "images/{postId}/..." or "{postId}/..."
		if !isValidS3KeyForDeletion(key, post.AuthorID, post.ID) {
			continue // Skip keys that don't match expected patterns
		}
		objectsToDelete = append(objectsToDelete, s3types.ObjectIdentifier{
			Key: &key,
		})
	}

	// Only proceed with deletion if there are valid objects to delete
	if len(objectsToDelete) > 0 {
		s3DeleteInput := &s3.DeleteObjectsInput{
			Bucket: &bucketName,
			Delete: &s3types.Delete{
				Objects: objectsToDelete,
				Quiet:   boolPtr(true),
			},
		}

		if _, s3DeleteErr := s3Client.DeleteObjects(ctx, s3DeleteInput); s3DeleteErr != nil {
			resp, _ := errorResponse(500, "failed to delete images")
			return &resp
		}
	}

	return nil
}

// triggerSiteBuild triggers the Astro SSG build via CodeBuild
// Requirement 10.11: Trigger CodeBuild when a published post is deleted
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

// extractS3KeyFromURL extracts the S3 key from a full URL
// If the input is already a key (not a URL), it returns it as is
func extractS3KeyFromURL(imageURL string) string {
	parsedURL, err := url.Parse(imageURL)
	if err != nil || parsedURL.Scheme == "" {
		// Not a valid URL, assume it's already a key
		return imageURL
	}

	// Remove leading slash from path
	return strings.TrimPrefix(parsedURL.Path, "/")
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

// boolPtr returns a pointer to a bool
func boolPtr(b bool) *bool {
	return &b
}

// isValidS3KeyForDeletion validates that an S3 key belongs to the specified user or post
// This prevents deletion of arbitrary S3 objects by validating the key prefix
// Valid patterns:
//   - {authorID}/...  (user-owned prefix)
//   - images/{authorID}/... (CloudFront URL pattern - user-owned prefix)
//   - images/{postID}/... (post-owned prefix)
//   - {postID}/... (post-owned prefix)
func isValidS3KeyForDeletion(key, authorID, postID string) bool {
	// Check if key starts with user's ID prefix
	if strings.HasPrefix(key, authorID+"/") {
		return true
	}
	// Check if key is under images/{authorID}/ prefix (CloudFront URL pattern)
	if strings.HasPrefix(key, "images/"+authorID+"/") {
		return true
	}
	// Check if key starts with post's ID prefix
	if strings.HasPrefix(key, postID+"/") {
		return true
	}
	// Check if key is under images/{postID}/ prefix
	if strings.HasPrefix(key, "images/"+postID+"/") {
		return true
	}
	return false
}

func main() {
	lambda.Start(Handler)
}
