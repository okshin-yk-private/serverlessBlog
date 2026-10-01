// Package main provides the GetUploadUrl Lambda function tests.
//
// Requirement 5.1: アップロードURL取得 (POST /images/upload-url)
// Requirement 7.1: APIパリティとテスト - 100%カバレッジ
// Requirement 7.4: テーブル駆動テスト
package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"serverless-blog/go-functions/internal/domain"
)

// MockPresignClient implements S3PresignerInterface for testing
type MockPresignClient struct {
	PresignPostObjectFunc func(ctx context.Context, params *s3.PutObjectInput, optFns ...func(*s3.PresignPostOptions)) (*s3.PresignedPostRequest, error)
}

func (m *MockPresignClient) PresignPostObject(ctx context.Context, params *s3.PutObjectInput, optFns ...func(*s3.PresignPostOptions)) (*s3.PresignedPostRequest, error) {
	// Execute the option functions to ensure they are covered in tests
	opts := &s3.PresignPostOptions{}
	for _, fn := range optFns {
		fn(opts)
	}

	if m.PresignPostObjectFunc != nil {
		return m.PresignPostObjectFunc(ctx, params, optFns...)
	}
	return &s3.PresignedPostRequest{
		URL: "https://test-bucket.s3.amazonaws.com/",
		Values: map[string]string{
			"key":    aws.ToString(params.Key),
			"policy": "test-policy",
		},
	}, nil
}

// Helper functions for creating test requests
func createAuthenticatedRequest(body string) events.APIGatewayProxyRequest {
	return events.APIGatewayProxyRequest{
		Body: body,
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{
				"claims": map[string]interface{}{
					"sub": "test-user-123",
				},
			},
		},
	}
}

func createUnauthenticatedRequest(body string) events.APIGatewayProxyRequest {
	return events.APIGatewayProxyRequest{
		Body: body,
	}
}

// Test table-driven tests for Handler
func TestHandler(t *testing.T) {
	tests := []struct {
		name               string
		request            events.APIGatewayProxyRequest
		bucketName         string
		cloudFrontDomain   string
		mockPresignClient  func() (S3PresignerInterface, error)
		mockUUIDGenerator  func() string
		expectedStatusCode int
		checkResponse      func(t *testing.T, resp events.APIGatewayProxyResponse)
	}{
		{
			name: "success - jpg file with CloudFront",
			request: createAuthenticatedRequest(`{
				"fileName": "test-image.jpg",
				"contentType": "image/jpeg"
			}`),
			bucketName:       "test-bucket",
			cloudFrontDomain: "https://cdn.example.com",
			mockPresignClient: func() (S3PresignerInterface, error) {
				return &MockPresignClient{
					PresignPostObjectFunc: func(ctx context.Context, params *s3.PutObjectInput, optFns ...func(*s3.PresignPostOptions)) (*s3.PresignedPostRequest, error) {
						// Verify bucket and key
						if aws.ToString(params.Bucket) != "test-bucket" {
							t.Errorf("unexpected bucket: %s", aws.ToString(params.Bucket))
						}
						if aws.ToString(params.ContentType) != "image/jpeg" {
							t.Errorf("unexpected content type: %s", aws.ToString(params.ContentType))
						}
						return &s3.PresignedPostRequest{
							URL:    "https://test-bucket.s3.amazonaws.com/presigned-url",
							Values: map[string]string{"key": aws.ToString(params.Key), "policy": "test-policy"},
						}, nil
					},
				}, nil
			},
			mockUUIDGenerator:  func() string { return "test-uuid-1234" },
			expectedStatusCode: 200,
			checkResponse: func(t *testing.T, resp events.APIGatewayProxyResponse) {
				var body domain.GetUploadURLResponse
				if err := json.Unmarshal([]byte(resp.Body), &body); err != nil {
					t.Fatalf("failed to unmarshal response: %v", err)
				}
				if body.UploadURL != "https://test-bucket.s3.amazonaws.com/presigned-url" {
					t.Errorf("unexpected uploadUrl: %s", body.UploadURL)
				}
				// Key format: {userId}/{uuid}.{extension}
				if body.Key != "test-user-123/test-uuid-1234.jpg" {
					t.Errorf("unexpected key: %s", body.Key)
				}
				// URL format with CloudFront: {cloudFrontDomain}/images/{key}
				if body.URL != "https://cdn.example.com/images/test-user-123/test-uuid-1234.jpg" {
					t.Errorf("unexpected url: %s", body.URL)
				}
			},
		},
		{
			name: "success - png file without CloudFront",
			request: createAuthenticatedRequest(`{
				"fileName": "photo.png",
				"contentType": "image/png"
			}`),
			bucketName:       "my-bucket",
			cloudFrontDomain: "",
			mockPresignClient: func() (S3PresignerInterface, error) {
				return &MockPresignClient{
					PresignPostObjectFunc: func(ctx context.Context, params *s3.PutObjectInput, optFns ...func(*s3.PresignPostOptions)) (*s3.PresignedPostRequest, error) {
						return &s3.PresignedPostRequest{
							URL:    "https://my-bucket.s3.amazonaws.com/presigned",
							Values: map[string]string{"key": aws.ToString(params.Key)},
						}, nil
					},
				}, nil
			},
			mockUUIDGenerator:  func() string { return "uuid-5678" },
			expectedStatusCode: 200,
			checkResponse: func(t *testing.T, resp events.APIGatewayProxyResponse) {
				var body domain.GetUploadURLResponse
				if err := json.Unmarshal([]byte(resp.Body), &body); err != nil {
					t.Fatalf("failed to unmarshal response: %v", err)
				}
				if body.Key != "test-user-123/uuid-5678.png" {
					t.Errorf("unexpected key: %s", body.Key)
				}
				// URL format without CloudFront: https://{bucket}.s3.amazonaws.com/{key}
				if body.URL != "https://my-bucket.s3.amazonaws.com/test-user-123/uuid-5678.png" {
					t.Errorf("unexpected url: %s", body.URL)
				}
			},
		},
		{
			name: "success - jpeg file",
			request: createAuthenticatedRequest(`{
				"fileName": "image.jpeg",
				"contentType": "image/jpeg"
			}`),
			bucketName:       "test-bucket",
			cloudFrontDomain: "",
			mockPresignClient: func() (S3PresignerInterface, error) {
				return &MockPresignClient{}, nil
			},
			mockUUIDGenerator:  func() string { return "uuid-jpeg" },
			expectedStatusCode: 200,
			checkResponse: func(t *testing.T, resp events.APIGatewayProxyResponse) {
				var body domain.GetUploadURLResponse
				if err := json.Unmarshal([]byte(resp.Body), &body); err != nil {
					t.Fatalf("failed to unmarshal response: %v", err)
				}
				if body.Key != "test-user-123/uuid-jpeg.jpeg" {
					t.Errorf("unexpected key: %s", body.Key)
				}
			},
		},
		{
			name: "success - gif file",
			request: createAuthenticatedRequest(`{
				"fileName": "animation.gif",
				"contentType": "image/gif"
			}`),
			bucketName:       "test-bucket",
			cloudFrontDomain: "",
			mockPresignClient: func() (S3PresignerInterface, error) {
				return &MockPresignClient{}, nil
			},
			mockUUIDGenerator:  func() string { return "uuid-gif" },
			expectedStatusCode: 200,
			checkResponse: func(t *testing.T, resp events.APIGatewayProxyResponse) {
				var body domain.GetUploadURLResponse
				if err := json.Unmarshal([]byte(resp.Body), &body); err != nil {
					t.Fatalf("failed to unmarshal response: %v", err)
				}
				if body.Key != "test-user-123/uuid-gif.gif" {
					t.Errorf("unexpected key: %s", body.Key)
				}
			},
		},
		{
			name: "success - webp file",
			request: createAuthenticatedRequest(`{
				"fileName": "modern.webp",
				"contentType": "image/webp"
			}`),
			bucketName:       "test-bucket",
			cloudFrontDomain: "",
			mockPresignClient: func() (S3PresignerInterface, error) {
				return &MockPresignClient{}, nil
			},
			mockUUIDGenerator:  func() string { return "uuid-webp" },
			expectedStatusCode: 200,
			checkResponse: func(t *testing.T, resp events.APIGatewayProxyResponse) {
				var body domain.GetUploadURLResponse
				if err := json.Unmarshal([]byte(resp.Body), &body); err != nil {
					t.Fatalf("failed to unmarshal response: %v", err)
				}
				if body.Key != "test-user-123/uuid-webp.webp" {
					t.Errorf("unexpected key: %s", body.Key)
				}
			},
		},
		{
			name: "success - uppercase extension",
			request: createAuthenticatedRequest(`{
				"fileName": "IMAGE.JPG",
				"contentType": "image/jpeg"
			}`),
			bucketName:       "test-bucket",
			cloudFrontDomain: "",
			mockPresignClient: func() (S3PresignerInterface, error) {
				return &MockPresignClient{}, nil
			},
			mockUUIDGenerator:  func() string { return "uuid-upper" },
			expectedStatusCode: 200,
			checkResponse: func(t *testing.T, resp events.APIGatewayProxyResponse) {
				var body domain.GetUploadURLResponse
				if err := json.Unmarshal([]byte(resp.Body), &body); err != nil {
					t.Fatalf("failed to unmarshal response: %v", err)
				}
				// Extension should be lowercase in key
				if body.Key != "test-user-123/uuid-upper.jpg" {
					t.Errorf("unexpected key: %s", body.Key)
				}
			},
		},
		{
			name:               "error - unauthenticated request",
			request:            createUnauthenticatedRequest(`{"fileName": "test.jpg", "contentType": "image/jpeg"}`),
			bucketName:         "test-bucket",
			cloudFrontDomain:   "",
			mockPresignClient:  nil,
			mockUUIDGenerator:  nil,
			expectedStatusCode: 401,
			checkResponse: func(t *testing.T, resp events.APIGatewayProxyResponse) {
				var body domain.ErrorResponse
				if err := json.Unmarshal([]byte(resp.Body), &body); err != nil {
					t.Fatalf("failed to unmarshal error response: %v", err)
				}
				if body.Message != "unauthorized" {
					t.Errorf("unexpected error message: %s", body.Message)
				}
			},
		},
		{
			name:               "error - empty authorizer claims",
			request:            events.APIGatewayProxyRequest{Body: `{"fileName": "test.jpg", "contentType": "image/jpeg"}`, RequestContext: events.APIGatewayProxyRequestContext{Authorizer: map[string]interface{}{}}},
			bucketName:         "test-bucket",
			cloudFrontDomain:   "",
			mockPresignClient:  nil,
			mockUUIDGenerator:  nil,
			expectedStatusCode: 401,
			checkResponse: func(t *testing.T, resp events.APIGatewayProxyResponse) {
				var body domain.ErrorResponse
				if err := json.Unmarshal([]byte(resp.Body), &body); err != nil {
					t.Fatalf("failed to unmarshal error response: %v", err)
				}
				if body.Message != "unauthorized" {
					t.Errorf("unexpected error message: %s", body.Message)
				}
			},
		},
		{
			name:               "error - invalid JSON body",
			request:            createAuthenticatedRequest(`{invalid json}`),
			bucketName:         "test-bucket",
			cloudFrontDomain:   "",
			mockPresignClient:  nil,
			mockUUIDGenerator:  nil,
			expectedStatusCode: 400,
			checkResponse: func(t *testing.T, resp events.APIGatewayProxyResponse) {
				var body domain.ErrorResponse
				if err := json.Unmarshal([]byte(resp.Body), &body); err != nil {
					t.Fatalf("failed to unmarshal error response: %v", err)
				}
				if body.Message != "invalid request body" {
					t.Errorf("unexpected error message: %s", body.Message)
				}
			},
		},
		{
			name:               "error - missing fileName",
			request:            createAuthenticatedRequest(`{"contentType": "image/jpeg"}`),
			bucketName:         "test-bucket",
			cloudFrontDomain:   "",
			mockPresignClient:  nil,
			mockUUIDGenerator:  nil,
			expectedStatusCode: 400,
			checkResponse: func(t *testing.T, resp events.APIGatewayProxyResponse) {
				var body domain.ErrorResponse
				if err := json.Unmarshal([]byte(resp.Body), &body); err != nil {
					t.Fatalf("failed to unmarshal error response: %v", err)
				}
				if body.Message != "fileName is required" {
					t.Errorf("unexpected error message: %s", body.Message)
				}
			},
		},
		{
			name:               "error - missing contentType",
			request:            createAuthenticatedRequest(`{"fileName": "test.jpg"}`),
			bucketName:         "test-bucket",
			cloudFrontDomain:   "",
			mockPresignClient:  nil,
			mockUUIDGenerator:  nil,
			expectedStatusCode: 400,
			checkResponse: func(t *testing.T, resp events.APIGatewayProxyResponse) {
				var body domain.ErrorResponse
				if err := json.Unmarshal([]byte(resp.Body), &body); err != nil {
					t.Fatalf("failed to unmarshal error response: %v", err)
				}
				if body.Message != "contentType is required" {
					t.Errorf("unexpected error message: %s", body.Message)
				}
			},
		},
		{
			name:               "error - invalid file extension",
			request:            createAuthenticatedRequest(`{"fileName": "document.pdf", "contentType": "application/pdf"}`),
			bucketName:         "test-bucket",
			cloudFrontDomain:   "",
			mockPresignClient:  nil,
			mockUUIDGenerator:  nil,
			expectedStatusCode: 400,
			checkResponse: func(t *testing.T, resp events.APIGatewayProxyResponse) {
				var body domain.ErrorResponse
				if err := json.Unmarshal([]byte(resp.Body), &body); err != nil {
					t.Fatalf("failed to unmarshal error response: %v", err)
				}
				if body.Message != "file extension is not allowed" {
					t.Errorf("unexpected error message: %s", body.Message)
				}
			},
		},
		{
			name:               "error - invalid content type",
			request:            createAuthenticatedRequest(`{"fileName": "test.jpg", "contentType": "application/octet-stream"}`),
			bucketName:         "test-bucket",
			cloudFrontDomain:   "",
			mockPresignClient:  nil,
			mockUUIDGenerator:  nil,
			expectedStatusCode: 400,
			checkResponse: func(t *testing.T, resp events.APIGatewayProxyResponse) {
				var body domain.ErrorResponse
				if err := json.Unmarshal([]byte(resp.Body), &body); err != nil {
					t.Fatalf("failed to unmarshal error response: %v", err)
				}
				if body.Message != "contentType is not allowed" {
					t.Errorf("unexpected error message: %s", body.Message)
				}
			},
		},
		{
			name:               "error - txt file extension",
			request:            createAuthenticatedRequest(`{"fileName": "test.txt", "contentType": "text/plain"}`),
			bucketName:         "test-bucket",
			cloudFrontDomain:   "",
			mockPresignClient:  nil,
			mockUUIDGenerator:  nil,
			expectedStatusCode: 400,
			checkResponse: func(t *testing.T, resp events.APIGatewayProxyResponse) {
				var body domain.ErrorResponse
				if err := json.Unmarshal([]byte(resp.Body), &body); err != nil {
					t.Fatalf("failed to unmarshal error response: %v", err)
				}
				if body.Message != "file extension is not allowed" {
					t.Errorf("unexpected error message: %s", body.Message)
				}
			},
		},
		{
			name:               "error - missing BUCKET_NAME",
			request:            createAuthenticatedRequest(`{"fileName": "test.jpg", "contentType": "image/jpeg"}`),
			bucketName:         "",
			cloudFrontDomain:   "",
			mockPresignClient:  nil,
			mockUUIDGenerator:  nil,
			expectedStatusCode: 500,
			checkResponse: func(t *testing.T, resp events.APIGatewayProxyResponse) {
				var body domain.ErrorResponse
				if err := json.Unmarshal([]byte(resp.Body), &body); err != nil {
					t.Fatalf("failed to unmarshal error response: %v", err)
				}
				if body.Message != "server configuration error" {
					t.Errorf("unexpected error message: %s", body.Message)
				}
			},
		},
		{
			name:             "error - presign client initialization error",
			request:          createAuthenticatedRequest(`{"fileName": "test.jpg", "contentType": "image/jpeg"}`),
			bucketName:       "test-bucket",
			cloudFrontDomain: "",
			mockPresignClient: func() (S3PresignerInterface, error) {
				return nil, errors.New("client initialization error")
			},
			mockUUIDGenerator:  func() string { return "uuid" },
			expectedStatusCode: 500,
			checkResponse: func(t *testing.T, resp events.APIGatewayProxyResponse) {
				var body domain.ErrorResponse
				if err := json.Unmarshal([]byte(resp.Body), &body); err != nil {
					t.Fatalf("failed to unmarshal error response: %v", err)
				}
				if body.Message != "server error" {
					t.Errorf("unexpected error message: %s", body.Message)
				}
			},
		},
		{
			name:             "error - presign operation error",
			request:          createAuthenticatedRequest(`{"fileName": "test.jpg", "contentType": "image/jpeg"}`),
			bucketName:       "test-bucket",
			cloudFrontDomain: "",
			mockPresignClient: func() (S3PresignerInterface, error) {
				return &MockPresignClient{
					PresignPostObjectFunc: func(ctx context.Context, params *s3.PutObjectInput, optFns ...func(*s3.PresignPostOptions)) (*s3.PresignedPostRequest, error) {
						return nil, errors.New("presign error")
					},
				}, nil
			},
			mockUUIDGenerator:  func() string { return "uuid" },
			expectedStatusCode: 500,
			checkResponse: func(t *testing.T, resp events.APIGatewayProxyResponse) {
				var body domain.ErrorResponse
				if err := json.Unmarshal([]byte(resp.Body), &body); err != nil {
					t.Fatalf("failed to unmarshal error response: %v", err)
				}
				if body.Message != "failed to generate upload URL" {
					t.Errorf("unexpected error message: %s", body.Message)
				}
			},
		},
		{
			name: "success - file with path in name",
			request: createAuthenticatedRequest(`{
				"fileName": "path/to/image.jpg",
				"contentType": "image/jpeg"
			}`),
			bucketName:       "test-bucket",
			cloudFrontDomain: "",
			mockPresignClient: func() (S3PresignerInterface, error) {
				return &MockPresignClient{}, nil
			},
			mockUUIDGenerator:  func() string { return "uuid-path" },
			expectedStatusCode: 200,
			checkResponse: func(t *testing.T, resp events.APIGatewayProxyResponse) {
				var body domain.GetUploadURLResponse
				if err := json.Unmarshal([]byte(resp.Body), &body); err != nil {
					t.Fatalf("failed to unmarshal response: %v", err)
				}
				// Key should use UUID, ignoring original path
				if body.Key != "test-user-123/uuid-path.jpg" {
					t.Errorf("unexpected key: %s", body.Key)
				}
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			// Setup environment
			t.Setenv("BUCKET_NAME", tc.bucketName)
			t.Setenv("CLOUDFRONT_DOMAIN", tc.cloudFrontDomain)

			// Setup mock client getter
			if tc.mockPresignClient != nil {
				presignClientGetter = tc.mockPresignClient
			} else {
				presignClientGetter = func() (S3PresignerInterface, error) {
					return &MockPresignClient{}, nil
				}
			}

			// Setup mock UUID generator
			if tc.mockUUIDGenerator != nil {
				uuidGenerator = tc.mockUUIDGenerator
			} else {
				uuidGenerator = func() string { return "test-uuid" }
			}

			// Execute handler
			resp, err := Handler(context.Background(), tc.request)
			if err != nil {
				t.Fatalf("Handler returned error: %v", err)
			}

			// Verify status code
			if resp.StatusCode != tc.expectedStatusCode {
				t.Errorf("expected status %d, got %d. Body: %s", tc.expectedStatusCode, resp.StatusCode, resp.Body)
			}

			// Verify response body
			if tc.checkResponse != nil {
				tc.checkResponse(t, resp)
			}

			// Verify CORS headers
			if resp.Headers["Content-Type"] != "application/json" {
				t.Errorf("expected Content-Type application/json, got %s", resp.Headers["Content-Type"])
			}
			if resp.Headers["Access-Control-Allow-Origin"] != "*" {
				t.Errorf("expected Access-Control-Allow-Origin *, got %s", resp.Headers["Access-Control-Allow-Origin"])
			}
		})
	}
}

// Test extractUserID function
func TestExtractUserID(t *testing.T) {
	tests := []struct {
		name     string
		request  events.APIGatewayProxyRequest
		expected string
	}{
		{
			name: "valid sub claim",
			request: events.APIGatewayProxyRequest{
				RequestContext: events.APIGatewayProxyRequestContext{
					Authorizer: map[string]interface{}{
						"claims": map[string]interface{}{
							"sub": "user-123",
						},
					},
				},
			},
			expected: "user-123",
		},
		{
			name: "nil authorizer",
			request: events.APIGatewayProxyRequest{
				RequestContext: events.APIGatewayProxyRequestContext{},
			},
			expected: "",
		},
		{
			name: "empty authorizer",
			request: events.APIGatewayProxyRequest{
				RequestContext: events.APIGatewayProxyRequestContext{
					Authorizer: map[string]interface{}{},
				},
			},
			expected: "",
		},
		{
			name: "no claims",
			request: events.APIGatewayProxyRequest{
				RequestContext: events.APIGatewayProxyRequestContext{
					Authorizer: map[string]interface{}{
						"other": "value",
					},
				},
			},
			expected: "",
		},
		{
			name: "claims not a map",
			request: events.APIGatewayProxyRequest{
				RequestContext: events.APIGatewayProxyRequestContext{
					Authorizer: map[string]interface{}{
						"claims": "not a map",
					},
				},
			},
			expected: "",
		},
		{
			name: "no sub in claims",
			request: events.APIGatewayProxyRequest{
				RequestContext: events.APIGatewayProxyRequestContext{
					Authorizer: map[string]interface{}{
						"claims": map[string]interface{}{
							"email": "test@example.com",
						},
					},
				},
			},
			expected: "",
		},
		{
			name: "sub not a string",
			request: events.APIGatewayProxyRequest{
				RequestContext: events.APIGatewayProxyRequestContext{
					Authorizer: map[string]interface{}{
						"claims": map[string]interface{}{
							"sub": 12345,
						},
					},
				},
			},
			expected: "",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := extractUserID(tc.request)
			if result != tc.expected {
				t.Errorf("expected %q, got %q", tc.expected, result)
			}
		})
	}
}

// Test generateS3Key function
func TestGenerateS3Key(t *testing.T) {
	tests := []struct {
		name     string
		userID   string
		fileName string
		uuid     string
		expected string
	}{
		{
			name:     "simple jpg file",
			userID:   "user-123",
			fileName: "photo.jpg",
			uuid:     "uuid-abc",
			expected: "user-123/uuid-abc.jpg",
		},
		{
			name:     "uppercase extension",
			userID:   "user-456",
			fileName: "IMAGE.PNG",
			uuid:     "uuid-def",
			expected: "user-456/uuid-def.png",
		},
		{
			name:     "file with path",
			userID:   "user-789",
			fileName: "folder/subfolder/image.gif",
			uuid:     "uuid-ghi",
			expected: "user-789/uuid-ghi.gif",
		},
		{
			name:     "mixed case extension",
			userID:   "user-123",
			fileName: "Test.JpEg",
			uuid:     "uuid-jkl",
			expected: "user-123/uuid-jkl.jpeg",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			// Override UUID generator for deterministic testing
			uuidGenerator = func() string { return tc.uuid }

			result := generateS3Key(tc.userID, tc.fileName)
			if result != tc.expected {
				t.Errorf("expected %q, got %q", tc.expected, result)
			}
		})
	}
}

// Test generateImageURL function
func TestGenerateImageURL(t *testing.T) {
	tests := []struct {
		name             string
		cloudFrontDomain string
		bucketName       string
		key              string
		expected         string
	}{
		{
			name:             "with CloudFront domain",
			cloudFrontDomain: "https://cdn.example.com",
			bucketName:       "my-bucket",
			key:              "user-123/uuid.jpg",
			expected:         "https://cdn.example.com/images/user-123/uuid.jpg",
		},
		{
			name:             "without CloudFront domain",
			cloudFrontDomain: "",
			bucketName:       "my-bucket",
			key:              "user-123/uuid.jpg",
			expected:         "https://my-bucket.s3.amazonaws.com/user-123/uuid.jpg",
		},
		{
			name:             "CloudFront without trailing slash",
			cloudFrontDomain: "https://cdn.example.com",
			bucketName:       "bucket",
			key:              "path/to/file.png",
			expected:         "https://cdn.example.com/images/path/to/file.png",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			result := generateImageURL(tc.cloudFrontDomain, tc.bucketName, tc.key)
			if result != tc.expected {
				t.Errorf("expected %q, got %q", tc.expected, result)
			}
		})
	}
}

// Test presigned URL expiration
func TestPresignExpiration(t *testing.T) {
	// Verify the constant is 15 minutes (900 seconds)
	expected := 15 * time.Minute
	if presignExpiration != expected {
		t.Errorf("expected presign expiration to be %v, got %v", expected, presignExpiration)
	}
}

// Test the 5 MiB upload size cap constant (issue #684 item 1), which must
// match MAX_IMAGE_BYTES in frontend/admin/src/utils/imageValidation.ts
// (cross-checked by tests/config).
func TestMaxUploadSizeBytes(t *testing.T) {
	const expected = 5 * 1024 * 1024
	if maxUploadSizeBytes != expected {
		t.Errorf("expected maxUploadSizeBytes to be %d, got %d", expected, maxUploadSizeBytes)
	}
}

// Test buildUploadConditions returns the exact Content-Type and
// content-length-range conditions expected by the POST policy.
func TestBuildUploadConditions(t *testing.T) {
	conditions := buildUploadConditions("image/png")

	if len(conditions) != 2 {
		t.Fatalf("expected 2 conditions, got %d: %#v", len(conditions), conditions)
	}

	contentTypeCond, ok := conditions[0].(map[string]string)
	if !ok {
		t.Fatalf("expected first condition to be map[string]string, got %T", conditions[0])
	}
	if contentTypeCond["Content-Type"] != "image/png" {
		t.Errorf("expected Content-Type condition %q, got %q", "image/png", contentTypeCond["Content-Type"])
	}

	rangeCond, ok := conditions[1].([]any)
	if !ok {
		t.Fatalf("expected second condition to be []any, got %T", conditions[1])
	}
	if len(rangeCond) != 3 || rangeCond[0] != contentLengthRangeCondition || rangeCond[1] != 1 || rangeCond[2] != maxUploadSizeBytes {
		t.Errorf("unexpected content-length-range condition: %#v", rangeCond)
	}
}

// s3PolicyDocument mirrors the shape of the base64-decoded S3 POST policy
// document, enough to assert on its "conditions" list.
type s3PolicyDocument struct {
	Conditions []any `json:"conditions"`
}

// decodePolicy base64-decodes and JSON-unmarshals the "policy" field the SDK
// returns in PresignedPostRequest.Values.
func decodePolicy(t *testing.T, values map[string]string) s3PolicyDocument {
	t.Helper()
	raw, ok := values["policy"]
	if !ok {
		t.Fatalf("presigned POST values missing policy field: %#v", values)
	}
	decoded, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		t.Fatalf("failed to base64-decode policy: %v", err)
	}
	var doc s3PolicyDocument
	if err := json.Unmarshal(decoded, &doc); err != nil {
		t.Fatalf("failed to unmarshal policy JSON: %v", err)
	}
	return doc
}

// policyHasCondition reports whether the policy's conditions list contains a
// condition deep-equal to want, after round-tripping both through JSON so
// numeric and map/slice representations compare consistently.
func policyHasCondition(t *testing.T, conditions []any, want any) bool {
	t.Helper()
	wantJSON, err := json.Marshal(want)
	if err != nil {
		t.Fatalf("failed to marshal expected condition: %v", err)
	}
	for _, c := range conditions {
		gotJSON, err := json.Marshal(c)
		if err != nil {
			t.Fatalf("failed to marshal actual condition: %v", err)
		}
		if string(gotJSON) == string(wantJSON) {
			return true
		}
	}
	return false
}

// realPresignClient builds a real *s3.PresignClient with static (fake)
// credentials. Presigning a POST policy is a pure local computation (no
// network call is made), so this exercises the actual SDK policy-building
// logic (createPolicyDocument in presign_post.go) without hitting AWS.
func realPresignClient(t *testing.T) *s3.PresignClient {
	t.Helper()
	client := s3.New(s3.Options{
		Region:      "us-east-1",
		Credentials: credentials.NewStaticCredentialsProvider("AKIAFAKE", "secretfakefakefakefakefakefakefake", ""),
	})
	return s3.NewPresignClient(client)
}

// TestPresignPostObject_PolicyConditions verifies, against the real SDK
// presigner, that the policy document produced for our conditions contains
// the content-length-range (1..5 MiB), an exact key match, and the exact
// Content-Type condition. This guards against a future change to
// buildUploadConditions or the conditions wiring silently losing the size
// cap that motivated issue #684 item 1.
func TestPresignPostObject_PolicyConditions(t *testing.T) {
	client := realPresignClient(t)

	putInput := &s3.PutObjectInput{
		Bucket:      aws.String("test-bucket"),
		Key:         aws.String("user-123/uuid.png"),
		ContentType: aws.String("image/png"),
	}

	presignedReq, err := client.PresignPostObject(context.Background(), putInput, func(opts *s3.PresignPostOptions) {
		opts.Expires = presignExpiration
		opts.Conditions = buildUploadConditions("image/png")
	})
	if err != nil {
		t.Fatalf("PresignPostObject returned error: %v", err)
	}

	doc := decodePolicy(t, presignedReq.Values)

	if !policyHasCondition(t, doc.Conditions, []any{contentLengthRangeCondition, 1, maxUploadSizeBytes}) {
		t.Errorf("policy conditions missing content-length-range 1..%d: %#v", maxUploadSizeBytes, doc.Conditions)
	}
	if !policyHasCondition(t, doc.Conditions, map[string]string{"Content-Type": "image/png"}) {
		t.Errorf("policy conditions missing exact Content-Type match: %#v", doc.Conditions)
	}
	if !policyHasCondition(t, doc.Conditions, map[string]string{"key": "user-123/uuid.png"}) {
		t.Errorf("policy conditions missing exact key match: %#v", doc.Conditions)
	}

	if _, ok := presignedReq.Values["key"]; !ok {
		t.Errorf("presigned POST values missing key form field: %#v", presignedReq.Values)
	}
}

// TestHandler_FieldsSatisfyPolicyConditions verifies, end to end against the
// real SDK presigner, that every exact-match condition in the signed policy
// has a matching form field in the response. S3 rejects a POST whose form
// does not satisfy every condition with 403 AccessDenied ("Invalid according
// to Policy"), and the admin UI only sends the fields we return (plus file).
// The SDK does not turn PutObjectInput.ContentType into a form field, so a
// Content-Type condition without a Content-Type field broke every upload.
func TestHandler_FieldsSatisfyPolicyConditions(t *testing.T) {
	t.Setenv("BUCKET_NAME", "test-bucket")
	t.Setenv("CLOUDFRONT_DOMAIN", "")
	origGetter, origUUID := presignClientGetter, uuidGenerator
	t.Cleanup(func() { presignClientGetter, uuidGenerator = origGetter, origUUID })
	presignClientGetter = func() (S3PresignerInterface, error) { return realPresignClient(t), nil }
	uuidGenerator = func() string { return "uuid" }

	resp, err := Handler(context.Background(), createAuthenticatedRequest(`{"fileName": "photo.png", "contentType": "image/png"}`))
	if err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Fatalf("expected status 200, got %d. Body: %s", resp.StatusCode, resp.Body)
	}
	var body domain.GetUploadURLResponse
	if err := json.Unmarshal([]byte(resp.Body), &body); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	doc := decodePolicy(t, body.Fields)
	for _, c := range doc.Conditions {
		var name, want string
		switch cond := c.(type) {
		case map[string]any:
			for k, v := range cond {
				name, want = k, fmt.Sprint(v)
			}
		case []any:
			if len(cond) != 3 || cond[0] != "eq" {
				continue // content-length-range / starts-with are not exact field matches
			}
			name, want = strings.TrimPrefix(fmt.Sprint(cond[1]), "$"), fmt.Sprint(cond[2])
		default:
			t.Fatalf("unexpected policy condition shape %T: %#v", c, c)
		}
		// S3 checks the bucket condition against the request URL, not a form field.
		if name == "bucket" {
			continue
		}
		if got, ok := body.Fields[name]; !ok || got != want {
			t.Errorf("policy requires %q = %q but response fields have %q (present: %t)", name, want, got, ok)
		}
	}
}

// TestPresignPostObject_RejectsUnsupportedContentType documents that
// unsupported content types never reach the presigner: domain.Validate
// rejects them before buildUploadConditions/PresignPostObject are called.
// See TestHandler's "error - invalid content type" and
// "error - invalid file extension" cases for the end-to-end behavior.
func TestPresignPostObject_RejectsUnsupportedContentType(t *testing.T) {
	req := domain.GetUploadURLRequest{FileName: "test.pdf", ContentType: "application/pdf"}
	if err := req.Validate(); err == nil {
		t.Fatal("expected Validate to reject an unsupported content type before any presign call")
	}
}
