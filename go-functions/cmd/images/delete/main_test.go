// Package main provides tests for the DeleteImage Lambda function.
//
// Requirement 5.2: 画像削除 (DELETE /images/{key+})
//   - 認証付きの有効な削除リクエストを受信したとき、S3から画像を削除する
//   - リクエストユーザーが画像を所有していることを確認する（パスプレフィックスに基づく）
//   - ユーザーが画像を所有していない場合、HTTP 403を返す
//   - 有効な認証がない場合、HTTP 401を返す
//   - 削除が成功したとき、HTTP 204を返す
//   - パストラバーサルが検出された場合、HTTP 400を返す
//
// Requirement 12.4: セキュリティ
//   - パストラバーサル攻撃を防止
package main

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"serverless-blog/go-functions/internal/domain"
)

// Test constants
const (
	testBucketName = "test-bucket"
	testUserID     = "user123"
)

// MockS3Client is a mock implementation of S3ClientInterface for testing.
type MockS3Client struct {
	DeleteObjectFunc func(ctx context.Context, params *s3.DeleteObjectInput, optFns ...func(*s3.Options)) (*s3.DeleteObjectOutput, error)
}

func (m *MockS3Client) DeleteObject(ctx context.Context, params *s3.DeleteObjectInput, optFns ...func(*s3.Options)) (*s3.DeleteObjectOutput, error) {
	if m.DeleteObjectFunc != nil {
		return m.DeleteObjectFunc(ctx, params, optFns...)
	}
	return &s3.DeleteObjectOutput{}, nil
}

// testSetup saves original values and sets up test environment.
// Returns a cleanup function that should be deferred.
func testSetup(bucketName string, s3Mock S3ClientInterface) func() {
	originalBucketName := getBucketName
	originalS3Client := s3ClientGetter

	getBucketName = func() string { return bucketName }
	if s3Mock != nil {
		s3ClientGetter = func() (S3ClientInterface, error) {
			return s3Mock, nil
		}
	}

	return func() {
		getBucketName = originalBucketName
		s3ClientGetter = originalS3Client
	}
}

// assertErrorResponse checks that the response has the expected status code and error message.
func assertErrorResponse(t *testing.T, response events.APIGatewayProxyResponse, expectedStatus int, expectedMsg string) {
	t.Helper()

	if response.StatusCode != expectedStatus {
		t.Errorf("Expected status code %d, got %d", expectedStatus, response.StatusCode)
	}

	errResp, parseErr := parseErrorResponse(response.Body)
	if parseErr != nil {
		t.Fatalf("Failed to parse error response: %v", parseErr)
	}

	if errResp.Message != expectedMsg {
		t.Errorf("Expected message '%s', got '%s'", expectedMsg, errResp.Message)
	}
}

// Helper function to create a request with Cognito claims
//
//nolint:unparam // userID is variable in TestExtractUserID and TestUserOwnsImage tests
func createRequestWithClaims(pathParam, userID string) events.APIGatewayProxyRequest {
	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{
			"key": pathParam,
		},
	}

	if userID != "" {
		request.RequestContext = events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{
					"sub": userID,
				},
			},
		}
	}

	return request
}

// Helper function to create a request without authentication
func createUnauthenticatedRequest(pathParam string) events.APIGatewayProxyRequest {
	return events.APIGatewayProxyRequest{
		PathParameters: map[string]string{
			"key": pathParam,
		},
	}
}

// parseErrorResponse parses the response body as ErrorResponse
func parseErrorResponse(body string) (domain.ErrorResponse, error) {
	var resp domain.ErrorResponse
	err := json.Unmarshal([]byte(body), &resp)
	return resp, err
}

// ==================== Authentication Tests ====================

func TestHandler_MissingAuthentication_Returns401(t *testing.T) {
	cleanup := testSetup(testBucketName, nil)
	defer cleanup()

	tests := []struct {
		name    string
		request events.APIGatewayProxyRequest
	}{
		{
			name:    "no authorizer",
			request: createUnauthenticatedRequest(testUserID + "/image.jpg"),
		},
		{
			name: "nil authorizer",
			request: events.APIGatewayProxyRequest{
				PathParameters: map[string]string{"key": testUserID + "/image.jpg"},
				RequestContext: events.APIGatewayProxyRequestContext{
					Authorizer: nil,
				},
			},
		},
		{
			name: "no claims in authorizer",
			request: events.APIGatewayProxyRequest{
				PathParameters: map[string]string{"key": testUserID + "/image.jpg"},
				RequestContext: events.APIGatewayProxyRequestContext{
					Authorizer: map[string]interface{}{},
				},
			},
		},
		{
			name: "no sub in claims",
			request: events.APIGatewayProxyRequest{
				PathParameters: map[string]string{"key": testUserID + "/image.jpg"},
				RequestContext: events.APIGatewayProxyRequestContext{
					Authorizer: map[string]interface{}{
						"claims": map[string]interface{}{
							"email": "test@example.com",
						},
					},
				},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			response, err := Handler(context.Background(), tt.request)
			if err != nil {
				t.Fatalf("Handler returned unexpected error: %v", err)
			}

			assertErrorResponse(t, response, 401, "unauthorized")
		})
	}
}

// ==================== Validation Tests ====================

func TestHandler_MissingKey_Returns400(t *testing.T) {
	cleanup := testSetup(testBucketName, nil)
	defer cleanup()

	request := createRequestWithClaims("", testUserID)

	response, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	assertErrorResponse(t, response, 400, "image key is required")
}

func TestHandler_PathTraversal_Returns400(t *testing.T) {
	cleanup := testSetup(testBucketName, nil)
	defer cleanup()

	tests := []struct {
		name    string
		pathKey string
	}{
		{name: "parent directory traversal", pathKey: testUserID + "/../other/file.jpg"},
		{name: "root traversal", pathKey: "../../../etc/passwd"},
		{name: "ending with parent ref", pathKey: testUserID + "/.."},
		{name: "just parent ref", pathKey: ".."},
		{name: "URL encoded traversal", pathKey: testUserID + "%2F..%2Fother%2Ffile.jpg"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			request := createRequestWithClaims(tt.pathKey, testUserID)

			response, err := Handler(context.Background(), request)
			if err != nil {
				t.Fatalf("Handler returned unexpected error: %v", err)
			}

			assertErrorResponse(t, response, 400, "invalid key")
		})
	}
}

// ==================== Authorization Tests ====================

func TestHandler_OtherUserImage_Returns403(t *testing.T) {
	cleanup := testSetup(testBucketName, nil)
	defer cleanup()

	tests := []struct {
		name    string
		pathKey string
	}{
		{name: "different user prefix", pathKey: "other-user/image.jpg"},
		{name: "no user prefix", pathKey: "image.jpg"},
		{name: "user ID without slash", pathKey: testUserID + "image.jpg"},
		{name: "partial user ID match", pathKey: "user12/image.jpg"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			request := createRequestWithClaims(tt.pathKey, testUserID)

			response, err := Handler(context.Background(), request)
			if err != nil {
				t.Fatalf("Handler returned unexpected error: %v", err)
			}

			assertErrorResponse(t, response, 403, "forbidden")
		})
	}
}

// ==================== Server Configuration Tests ====================

func TestHandler_MissingBucketName_Returns500(t *testing.T) {
	cleanup := testSetup("", nil) // Empty bucket name
	defer cleanup()

	request := createRequestWithClaims(testUserID+"/image.jpg", testUserID)

	response, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	assertErrorResponse(t, response, 500, "server configuration error")
}

// ==================== S3 Delete Tests ====================

func TestHandler_S3DeleteError_Returns500(t *testing.T) {
	mockS3 := &MockS3Client{
		DeleteObjectFunc: func(ctx context.Context, params *s3.DeleteObjectInput, optFns ...func(*s3.Options)) (*s3.DeleteObjectOutput, error) {
			return nil, errors.New("S3 error")
		},
	}
	cleanup := testSetup(testBucketName, mockS3)
	defer cleanup()

	request := createRequestWithClaims(testUserID+"/image.jpg", testUserID)

	response, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	assertErrorResponse(t, response, 500, "failed to delete image")
}

func TestHandler_S3ClientError_Returns500(t *testing.T) {
	// Use custom setup for s3Client error
	originalBucketName := getBucketName
	originalS3Client := s3ClientGetter

	getBucketName = func() string { return testBucketName }
	s3ClientGetter = func() (S3ClientInterface, error) {
		return nil, errors.New("failed to get S3 client")
	}
	defer func() {
		getBucketName = originalBucketName
		s3ClientGetter = originalS3Client
	}()

	request := createRequestWithClaims(testUserID+"/image.jpg", testUserID)

	response, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	assertErrorResponse(t, response, 500, "server error")
}

// ==================== Success Tests ====================

func TestHandler_SuccessfulDeletion_Returns204(t *testing.T) {
	var deletedBucket, deletedKey string
	mockS3 := &MockS3Client{
		DeleteObjectFunc: func(ctx context.Context, params *s3.DeleteObjectInput, optFns ...func(*s3.Options)) (*s3.DeleteObjectOutput, error) {
			deletedBucket = *params.Bucket
			deletedKey = *params.Key
			return &s3.DeleteObjectOutput{}, nil
		},
	}
	cleanup := testSetup(testBucketName, mockS3)
	defer cleanup()

	request := createRequestWithClaims(testUserID+"/image.jpg", testUserID)

	response, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if response.StatusCode != 204 {
		t.Errorf("Expected status code 204, got %d", response.StatusCode)
	}

	// Body should be empty for 204 No Content
	if response.Body != "" {
		t.Errorf("Expected empty body for 204, got '%s'", response.Body)
	}

	// Verify S3 delete was called with correct parameters
	if deletedBucket != testBucketName {
		t.Errorf("Expected bucket '%s', got '%s'", testBucketName, deletedBucket)
	}
	if deletedKey != testUserID+"/image.jpg" {
		t.Errorf("Expected key '%s/image.jpg', got '%s'", testUserID, deletedKey)
	}
}

func TestHandler_SuccessfulDeletion_WithSubdirectory(t *testing.T) {
	var deletedKey string
	mockS3 := &MockS3Client{
		DeleteObjectFunc: func(ctx context.Context, params *s3.DeleteObjectInput, optFns ...func(*s3.Options)) (*s3.DeleteObjectOutput, error) {
			deletedKey = *params.Key
			return &s3.DeleteObjectOutput{}, nil
		},
	}
	cleanup := testSetup(testBucketName, mockS3)
	defer cleanup()

	request := createRequestWithClaims(testUserID+"/subdir/image.jpg", testUserID)

	response, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if response.StatusCode != 204 {
		t.Errorf("Expected status code 204, got %d", response.StatusCode)
	}

	expectedKey := testUserID + "/subdir/image.jpg"
	if deletedKey != expectedKey {
		t.Errorf("Expected key '%s', got '%s'", expectedKey, deletedKey)
	}
}

// ==================== URL Decoding Tests ====================

func TestHandler_URLEncodedKey_IsDecoded(t *testing.T) {
	var deletedKey string
	mockS3 := &MockS3Client{
		DeleteObjectFunc: func(ctx context.Context, params *s3.DeleteObjectInput, optFns ...func(*s3.Options)) (*s3.DeleteObjectOutput, error) {
			deletedKey = *params.Key
			return &s3.DeleteObjectOutput{}, nil
		},
	}
	cleanup := testSetup(testBucketName, mockS3)
	defer cleanup()

	tests := []struct {
		name        string
		encodedKey  string
		expectedKey string
	}{
		{name: "space encoded", encodedKey: testUserID + "/my%20image.jpg", expectedKey: testUserID + "/my image.jpg"},
		{name: "plus sign encoded", encodedKey: testUserID + "/my%2Bimage.jpg", expectedKey: testUserID + "/my+image.jpg"},
		{name: "special characters encoded", encodedKey: testUserID + "/%E3%83%86%E3%82%B9%E3%83%88.jpg", expectedKey: testUserID + "/テスト.jpg"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			request := createRequestWithClaims(tt.encodedKey, testUserID)

			response, err := Handler(context.Background(), request)
			if err != nil {
				t.Fatalf("Handler returned unexpected error: %v", err)
			}

			if response.StatusCode != 204 {
				t.Errorf("Expected status code 204, got %d", response.StatusCode)
			}

			if deletedKey != tt.expectedKey {
				t.Errorf("Expected key '%s', got '%s'", tt.expectedKey, deletedKey)
			}
		})
	}
}

// ==================== CORS Headers Tests ====================

func TestHandler_ResponseHasCORSHeaders(t *testing.T) {
	mockS3 := &MockS3Client{}
	cleanup := testSetup(testBucketName, mockS3)
	defer cleanup()

	request := createRequestWithClaims(testUserID+"/image.jpg", testUserID)

	response, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	// Check CORS headers
	if response.Headers["Access-Control-Allow-Origin"] != "*" {
		t.Errorf("Expected CORS header '*', got '%s'", response.Headers["Access-Control-Allow-Origin"])
	}
}

func TestHandler_ErrorResponseHasCORSHeaders(t *testing.T) {
	cleanup := testSetup(testBucketName, nil)
	defer cleanup()

	request := createUnauthenticatedRequest(testUserID + "/image.jpg")

	response, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	// Check CORS headers on error response
	if response.Headers["Access-Control-Allow-Origin"] != "*" {
		t.Errorf("Expected CORS header '*', got '%s'", response.Headers["Access-Control-Allow-Origin"])
	}
}

// ==================== Helper Function Tests ====================

func TestExtractUserID(t *testing.T) {
	tests := []struct {
		name     string
		request  events.APIGatewayProxyRequest
		expected string
	}{
		{
			name:     "valid claims",
			request:  createRequestWithClaims("key", "user123"),
			expected: "user123",
		},
		{
			name:     "no authorizer",
			request:  createUnauthenticatedRequest("key"),
			expected: "",
		},
		{
			name: "nil authorizer",
			request: events.APIGatewayProxyRequest{
				RequestContext: events.APIGatewayProxyRequestContext{
					Authorizer: nil,
				},
			},
			expected: "",
		},
		{
			name: "empty claims",
			request: events.APIGatewayProxyRequest{
				RequestContext: events.APIGatewayProxyRequestContext{
					Authorizer: map[string]interface{}{
						"claims": map[string]interface{}{},
					},
				},
			},
			expected: "",
		},
		{
			name: "invalid sub type",
			request: events.APIGatewayProxyRequest{
				RequestContext: events.APIGatewayProxyRequestContext{
					Authorizer: map[string]interface{}{
						"claims": map[string]interface{}{
							"sub": 123, // not a string
						},
					},
				},
			},
			expected: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := extractUserID(tt.request)
			if result != tt.expected {
				t.Errorf("Expected '%s', got '%s'", tt.expected, result)
			}
		})
	}
}

func TestIsPathTraversal(t *testing.T) {
	tests := []struct {
		name     string
		key      string
		expected bool
	}{
		{
			name:     "parent directory traversal",
			key:      "user123/../other/file.jpg",
			expected: true,
		},
		{
			name:     "root traversal",
			key:      "../../../etc/passwd",
			expected: true,
		},
		{
			name:     "ending with parent ref",
			key:      "user123/..",
			expected: true,
		},
		{
			name:     "just parent ref",
			key:      "..",
			expected: true,
		},
		{
			name:     "normal path",
			key:      "user123/image.jpg",
			expected: false,
		},
		{
			name:     "normal path with uuid",
			key:      "user123/uuid.png",
			expected: false,
		},
		{
			name:     "normal path with subdirectory",
			key:      "abc123/subdir/test-image.webp",
			expected: false,
		},
		{
			name:     "single dot is safe",
			key:      "user123/./image.jpg",
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := isPathTraversal(tt.key)
			if result != tt.expected {
				t.Errorf("Expected %v for '%s', got %v", tt.expected, tt.key, result)
			}
		})
	}
}

func TestUserOwnsImage(t *testing.T) {
	tests := []struct {
		name     string
		key      string
		userID   string
		expected bool
	}{
		{
			name:     "user owns image",
			key:      "user123/image.jpg",
			userID:   "user123",
			expected: true,
		},
		{
			name:     "user owns image with subdirectory",
			key:      "user123/subdir/image.jpg",
			userID:   "user123",
			expected: true,
		},
		{
			name:     "user with UUID owns image",
			key:      "abc-def-123/test.png",
			userID:   "abc-def-123",
			expected: true,
		},
		{
			name:     "other user's image",
			key:      "other-user/image.jpg",
			userID:   "user123",
			expected: false,
		},
		{
			name:     "no user prefix",
			key:      "image.jpg",
			userID:   "user123",
			expected: false,
		},
		{
			name:     "user ID without slash after",
			key:      "user123image.jpg",
			userID:   "user123",
			expected: false,
		},
		{
			name:     "empty key",
			key:      "",
			userID:   "user123",
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := userOwnsImage(tt.key, tt.userID)
			if result != tt.expected {
				t.Errorf("Expected %v for key='%s' and userID='%s', got %v", tt.expected, tt.key, tt.userID, result)
			}
		})
	}
}

// ==================== Additional Claims Type Tests ====================

func TestExtractUserID_ClaimsNotMap_ReturnsEmpty(t *testing.T) {
	request := events.APIGatewayProxyRequest{
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": "invalid string type", // claims is a string, not a map
			},
		},
	}

	result := extractUserID(request)
	if result != "" {
		t.Errorf("Expected empty string, got '%s'", result)
	}
}

// ==================== Invalid URL Encoding Tests ====================

func TestHandler_InvalidURLEncoding_Returns400(t *testing.T) {
	cleanup := testSetup(testBucketName, nil)
	defer cleanup()

	// %ZZ is an invalid URL encoding sequence
	request := createRequestWithClaims(testUserID+"/%ZZinvalid", testUserID)

	response, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	assertErrorResponse(t, response, 400, "invalid key")
}

// ==================== Edge Case Tests ====================

func TestHandler_NoPathParameters_Returns400(t *testing.T) {
	cleanup := testSetup(testBucketName, nil)
	defer cleanup()

	request := events.APIGatewayProxyRequest{
		PathParameters: nil,
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{
					"sub": testUserID,
				},
			},
		},
	}

	response, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	assertErrorResponse(t, response, 400, "image key is required")
}
