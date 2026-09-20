// Package main provides the DeleteImage Lambda function for deleting images from S3.
//
// Requirement 5.2: 画像削除 (DELETE /images/{key+})
//   - 認証付きの有効な削除リクエストを受信したとき、S3から画像を削除する
//   - リクエストユーザーが画像を所有していることを確認する（パスプレフィックスに基づく）
//   - ユーザーが画像を所有していない場合、HTTP 403を返す
//   - 有効な認証がない場合、HTTP 401を返す
//   - 削除が成功したとき、HTTP 204を返す
//
// Requirement 12.4: セキュリティ
//   - パストラバーサルが検出された場合、HTTP 400を返す
package main

import (
	"context"
	"errors"
	"net/url"
	"os"
	"strings"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"serverless-blog/go-functions/internal/clients"
	"serverless-blog/go-functions/internal/middleware"
)

// S3ClientInterface defines the interface for S3 delete operations (for testing)
type S3ClientInterface interface {
	DeleteObject(ctx context.Context, params *s3.DeleteObjectInput, optFns ...func(*s3.Options)) (*s3.DeleteObjectOutput, error)
}

// s3ClientGetter is a function that returns the S3 client
// This can be overridden in tests
var s3ClientGetter = func() (S3ClientInterface, error) {
	return clients.GetS3()
}

// getBucketName is a function that returns the bucket name from environment
// This can be overridden in tests
var getBucketName = func() string {
	return os.Getenv("BUCKET_NAME")
}

// Handler handles DELETE /images/{key+} requests
func Handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	return middleware.HandleRequest(ctx, request, handleRequest)
}

func handleRequest(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Extract user ID from Cognito claims (authentication check)
	userID := extractUserID(request)
	if userID == "" {
		return middleware.MessageResponse(401, "unauthorized")
	}

	// Get key from path parameters
	key := request.PathParameters["key"]
	if key == "" {
		return middleware.MessageResponse(400, "image key is required")
	}

	// URL decode the key
	decodedKey, err := url.QueryUnescape(key)
	if err != nil {
		return middleware.MessageResponse(400, "invalid key")
	}

	// Check for path traversal attacks
	if isPathTraversal(decodedKey) {
		return middleware.MessageResponse(400, "invalid key")
	}

	// Verify user owns the image
	if !userOwnsImage(decodedKey, userID) {
		return middleware.MessageResponse(403, "forbidden")
	}

	// Get bucket name from environment
	bucketName := getBucketName()
	if bucketName == "" {
		return middleware.ServerError(ctx, "server configuration error", errors.New("BUCKET_NAME is not configured"))
	}

	// Get S3 client
	s3Client, err := s3ClientGetter()
	if err != nil {
		return middleware.ServerError(ctx, "server error", err)
	}

	// Delete from S3
	_, err = s3Client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(bucketName),
		Key:    aws.String(decodedKey),
	})
	if err != nil {
		return middleware.ServerError(ctx, "failed to delete image", err)
	}

	// Return 204 No Content
	return noContentResponse()
}

// extractUserID extracts the user ID (Cognito sub claim) from API Gateway authorizer context
func extractUserID(request events.APIGatewayProxyRequest) string {
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

// isPathTraversal checks for path traversal attempts in the key.
func isPathTraversal(key string) bool {
	return strings.Contains(key, "..")
}

// userOwnsImage validates that the user owns the image by checking the key prefix.
func userOwnsImage(key, userID string) bool {
	return strings.HasPrefix(key, userID+"/")
}

// noContentResponse creates a 204 No Content response with CORS headers
func noContentResponse() (events.APIGatewayProxyResponse, error) {
	return events.APIGatewayProxyResponse{
		StatusCode: 204,
		Headers:    middleware.CORSHeaders(),
		Body:       "",
	}, nil
}

func main() {
	lambda.Start(Handler)
}
