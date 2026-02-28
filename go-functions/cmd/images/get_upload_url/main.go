// Package main provides the GetUploadUrl Lambda function for generating presigned S3 upload URLs.
//
// Requirement 5.1: アップロードURL取得 (POST /images/upload-url)
//   - fileNameとcontentTypeを含む有効なリクエストを認証付きで受信したとき、
//     15分間有効なプリサインドS3 URLを生成する
//   - S3キーは {userId}/{uuid}.{extension} 形式で生成する
//   - ファイル拡張子が許可されていない場合、HTTP 400を返す
//   - コンテンツタイプが許可されていない場合、HTTP 400を返す
//   - 有効な認証がない場合、HTTP 401を返す
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/aws"
	v4 "github.com/aws/aws-sdk-go-v2/aws/signer/v4"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"

	"serverless-blog/go-functions/internal/clients"
	"serverless-blog/go-functions/internal/domain"
	"serverless-blog/go-functions/internal/middleware"
)

// presignExpiration defines the presigned URL expiration time (15 minutes)
const presignExpiration = 15 * time.Minute

// S3PresignerInterface defines the interface for S3 presign operations (for testing)
type S3PresignerInterface interface {
	PresignPutObject(ctx context.Context, params *s3.PutObjectInput, optFns ...func(*s3.PresignOptions)) (*v4.PresignedHTTPRequest, error)
}

// presignClientGetter is a function that returns the S3 Presign client
// This can be overridden in tests
var presignClientGetter = func() (S3PresignerInterface, error) {
	return clients.GetPresignClient()
}

// uuidGenerator is a function that generates a new UUID
// This can be overridden in tests
var uuidGenerator = func() string {
	return uuid.New().String()
}

// Handler handles POST /images/upload-url requests
func Handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Extract user ID from Cognito claims (authentication check)
	userID := extractUserID(request)
	if userID == "" {
		return errorResponse(401, "unauthorized")
	}

	// Parse request body
	var req domain.GetUploadURLRequest
	if err := json.Unmarshal([]byte(request.Body), &req); err != nil {
		return errorResponse(400, "invalid request body")
	}

	// Validate required fields and file type
	if err := req.Validate(); err != nil {
		return errorResponse(400, err.Error())
	}

	// Check for BUCKET_NAME environment variable
	bucketName := os.Getenv("BUCKET_NAME")
	if bucketName == "" {
		return errorResponse(500, "server configuration error")
	}

	// Get CloudFront domain (optional)
	cloudFrontDomain := os.Getenv("CLOUDFRONT_DOMAIN")

	// Get presign client
	presignClient, err := presignClientGetter()
	if err != nil {
		return errorResponse(500, "server error")
	}

	// Generate S3 key: {userId}/{uuid}.{extension}
	s3Key := generateS3Key(userID, req.FileName)

	// Generate presigned PUT URL
	putInput := &s3.PutObjectInput{
		Bucket:      aws.String(bucketName),
		Key:         aws.String(s3Key),
		ContentType: aws.String(req.ContentType),
	}

	presignedReq, err := presignClient.PresignPutObject(ctx, putInput, func(opts *s3.PresignOptions) {
		opts.Expires = presignExpiration
	})
	if err != nil {
		return errorResponse(500, "failed to generate upload URL")
	}

	// Generate image URL (CloudFront or direct S3)
	imageURL := generateImageURL(cloudFrontDomain, bucketName, s3Key)

	// Build response
	response := domain.GetUploadURLResponse{
		UploadURL: presignedReq.URL,
		Key:       s3Key,
		URL:       imageURL,
	}

	return middleware.JSONResponse(200, response)
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

// generateS3Key generates an S3 key in the format: {userId}/{uuid}.{extension}
// The extension is extracted from the original filename and converted to lowercase.
// Note: The key does NOT include the "images/" prefix because CloudFront
// strips "/images" from the path before routing to S3.
func generateS3Key(userID, fileName string) string {
	// Extract extension from filename (handles paths like "folder/image.jpg")
	ext := strings.ToLower(filepath.Ext(fileName))
	// Remove the leading dot from extension for the format {uuid}.{extension}
	if ext != "" {
		ext = ext[1:] // Remove "." prefix
	}

	// Generate UUID for unpredictable file path
	fileUUID := uuidGenerator()

	return fmt.Sprintf("%s/%s.%s", userID, fileUUID, ext)
}

// generateImageURL generates the public URL for accessing the uploaded image.
// If CloudFront domain is configured, uses CloudFront URL with /images/ prefix.
// Otherwise, falls back to direct S3 URL.
func generateImageURL(cloudFrontDomain, bucketName, key string) string {
	if cloudFrontDomain != "" {
		return fmt.Sprintf("%s/images/%s", cloudFrontDomain, key)
	}
	return fmt.Sprintf("https://%s.s3.amazonaws.com/%s", bucketName, key)
}

// errorResponse creates an error response with CORS headers
func errorResponse(statusCode int, message string) (events.APIGatewayProxyResponse, error) {
	return middleware.JSONResponse(statusCode, domain.ErrorResponse{Message: message})
}

func main() {
	lambda.Start(Handler)
}
