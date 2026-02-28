// Package main provides the GetUploadUrl Lambda function tests.
//
// Requirement 5.1: アップロードURL取得 (POST /images/upload-url)
// Requirement 7.1: APIパリティとテスト - 100%カバレッジ
// Requirement 7.4: テーブル駆動テスト
package main

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-sdk-go-v2/aws"
	v4 "github.com/aws/aws-sdk-go-v2/aws/signer/v4"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"serverless-blog/go-functions/internal/domain"
)

// MockPresignClient implements S3PresignerInterface for testing
type MockPresignClient struct {
	PresignPutObjectFunc func(ctx context.Context, params *s3.PutObjectInput, optFns ...func(*s3.PresignOptions)) (*v4.PresignedHTTPRequest, error)
}

func (m *MockPresignClient) PresignPutObject(ctx context.Context, params *s3.PutObjectInput, optFns ...func(*s3.PresignOptions)) (*v4.PresignedHTTPRequest, error) {
	// Execute the option functions to ensure they are covered in tests
	opts := &s3.PresignOptions{}
	for _, fn := range optFns {
		fn(opts)
	}

	if m.PresignPutObjectFunc != nil {
		return m.PresignPutObjectFunc(ctx, params, optFns...)
	}
	return &v4.PresignedHTTPRequest{
		URL: "https://test-bucket.s3.amazonaws.com/test-key?presigned",
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
					PresignPutObjectFunc: func(ctx context.Context, params *s3.PutObjectInput, optFns ...func(*s3.PresignOptions)) (*v4.PresignedHTTPRequest, error) {
						// Verify bucket and key
						if aws.ToString(params.Bucket) != "test-bucket" {
							t.Errorf("unexpected bucket: %s", aws.ToString(params.Bucket))
						}
						if aws.ToString(params.ContentType) != "image/jpeg" {
							t.Errorf("unexpected content type: %s", aws.ToString(params.ContentType))
						}
						return &v4.PresignedHTTPRequest{
							URL: "https://test-bucket.s3.amazonaws.com/presigned-url",
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
					PresignPutObjectFunc: func(ctx context.Context, params *s3.PutObjectInput, optFns ...func(*s3.PresignOptions)) (*v4.PresignedHTTPRequest, error) {
						return &v4.PresignedHTTPRequest{
							URL: "https://my-bucket.s3.amazonaws.com/presigned",
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
					PresignPutObjectFunc: func(ctx context.Context, params *s3.PutObjectInput, optFns ...func(*s3.PresignOptions)) (*v4.PresignedHTTPRequest, error) {
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
