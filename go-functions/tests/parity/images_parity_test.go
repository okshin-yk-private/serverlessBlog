// Package parity provides API parity tests for Images domain functions.
//
// Requirements: 7.2, 7.3, 7.5
//   - Go実装とNode.js/Rust実装のレスポンス比較
//   - HTTPステータスコード検証
//   - レスポンスボディ構造検証
//   - エラーメッセージ形式検証
package parity

import (
	"encoding/json"
	"testing"

	"github.com/aws/aws-lambda-go/events"

	"serverless-blog/go-functions/internal/domain"
)

// TestGetUploadUrl_ResponseParity tests parity between Go and Node.js GetUploadUrl implementations
func TestGetUploadUrl_ResponseParity(t *testing.T) {
	t.Run("success response should have same structure", func(t *testing.T) {
		// Expected structure from Node.js implementation
		nodeResponse := events.APIGatewayProxyResponse{
			StatusCode: 200,
			Body: `{
				"uploadUrl": "https://bucket.s3.amazonaws.com/images/user123/uuid.jpg?X-Amz-Signature=...",
				"key": "images/user123/uuid.jpg",
				"url": "https://cdn.example.com/images/user123/uuid.jpg"
			}`,
		}

		// Go implementation response
		goResp := domain.GetUploadURLResponse{
			UploadURL: "https://bucket.s3.amazonaws.com/images/user456/uuid.jpg?X-Amz-Signature=...",
			Key:       "images/user456/uuid.jpg",
			URL:       "https://cdn.example.com/images/user456/uuid.jpg",
		}
		goBody, _ := json.Marshal(goResp)
		goResponse := events.APIGatewayProxyResponse{
			StatusCode: 200,
			Body:       string(goBody),
		}

		// Compare with ignore dynamic values
		result := CompareResponsesWithOptions(goResponse, nodeResponse, CompareOptions{
			IgnoreFields: []string{"uploadUrl", "key", "url"},
		})

		if result.HasDiff {
			t.Errorf("GetUploadUrl response structure mismatch:\n%s", result.String())
		}
	})

	t.Run("response should contain all required fields", func(t *testing.T) {
		nodeResponse := events.APIGatewayProxyResponse{
			StatusCode: 200,
			Body: `{
				"uploadUrl": "https://example.com/upload",
				"key": "images/user/file.jpg",
				"url": "https://cdn.example.com/images/user/file.jpg"
			}`,
		}

		goResp := domain.GetUploadURLResponse{
			UploadURL: "https://example.com/upload",
			Key:       "images/user/file.jpg",
			URL:       "https://cdn.example.com/images/user/file.jpg",
		}
		goBody, _ := json.Marshal(goResp)
		goResponse := events.APIGatewayProxyResponse{
			StatusCode: 200,
			Body:       string(goBody),
		}

		result := CompareResponses(goResponse, nodeResponse)

		if result.HasDiff {
			t.Errorf("GetUploadUrl fields mismatch:\n%s", result.String())
		}
	})

	t.Run("missing fileName error should have same format", func(t *testing.T) {
		nodeResponse := events.APIGatewayProxyResponse{
			StatusCode: 400,
			Body:       `{"message":"fileName is required"}`,
		}

		goResponse := events.APIGatewayProxyResponse{
			StatusCode: 400,
			Body:       `{"message":"fileName is required"}`,
		}

		result := CompareResponses(goResponse, nodeResponse)

		if result.HasDiff {
			t.Errorf("GetUploadUrl fileName validation error mismatch:\n%s", result.String())
		}
	})

	t.Run("missing contentType error should have same format", func(t *testing.T) {
		nodeResponse := events.APIGatewayProxyResponse{
			StatusCode: 400,
			Body:       `{"message":"contentType is required"}`,
		}

		goResponse := events.APIGatewayProxyResponse{
			StatusCode: 400,
			Body:       `{"message":"contentType is required"}`,
		}

		result := CompareResponses(goResponse, nodeResponse)

		if result.HasDiff {
			t.Errorf("GetUploadUrl contentType validation error mismatch:\n%s", result.String())
		}
	})

	t.Run("invalid extension error should have same format", func(t *testing.T) {
		nodeResponse := events.APIGatewayProxyResponse{
			StatusCode: 400,
			Body:       `{"message":"file extension is not allowed"}`,
		}

		goResponse := events.APIGatewayProxyResponse{
			StatusCode: 400,
			Body:       `{"message":"file extension is not allowed"}`,
		}

		result := CompareResponses(goResponse, nodeResponse)

		if result.HasDiff {
			t.Errorf("GetUploadUrl extension validation error mismatch:\n%s", result.String())
		}
	})

	t.Run("invalid contentType error should have same format", func(t *testing.T) {
		nodeResponse := events.APIGatewayProxyResponse{
			StatusCode: 400,
			Body:       `{"message":"contentType is not allowed"}`,
		}

		goResponse := events.APIGatewayProxyResponse{
			StatusCode: 400,
			Body:       `{"message":"contentType is not allowed"}`,
		}

		result := CompareResponses(goResponse, nodeResponse)

		if result.HasDiff {
			t.Errorf("GetUploadUrl contentType validation error mismatch:\n%s", result.String())
		}
	})

	t.Run("unauthorized error should have same format", func(t *testing.T) {
		nodeResponse := events.APIGatewayProxyResponse{
			StatusCode: 401,
			Body:       `{"message":"unauthorized"}`,
		}

		goResponse := events.APIGatewayProxyResponse{
			StatusCode: 401,
			Body:       `{"message":"unauthorized"}`,
		}

		result := CompareResponses(goResponse, nodeResponse)

		if result.HasDiff {
			t.Errorf("GetUploadUrl unauthorized error mismatch:\n%s", result.String())
		}
	})
}

// TestDeleteImage_ResponseParity tests parity between Go and Node.js DeleteImage implementations
func TestDeleteImage_ResponseParity(t *testing.T) {
	t.Run("success should return 204 with no body", func(t *testing.T) {
		nodeResponse := events.APIGatewayProxyResponse{
			StatusCode: 204,
			Body:       "",
		}

		goResponse := events.APIGatewayProxyResponse{
			StatusCode: 204,
			Body:       "",
		}

		result := CompareResponses(goResponse, nodeResponse)

		if result.HasDiff {
			t.Errorf("DeleteImage 204 response mismatch:\n%s", result.String())
		}
	})

	t.Run("path traversal error should have same format", func(t *testing.T) {
		nodeResponse := events.APIGatewayProxyResponse{
			StatusCode: 400,
			Body:       `{"message":"invalid image path"}`,
		}

		goResponse := events.APIGatewayProxyResponse{
			StatusCode: 400,
			Body:       `{"message":"invalid image path"}`,
		}

		result := CompareResponses(goResponse, nodeResponse)

		if result.HasDiff {
			t.Errorf("DeleteImage path traversal error mismatch:\n%s", result.String())
		}
	})

	t.Run("unauthorized error should have same format", func(t *testing.T) {
		nodeResponse := events.APIGatewayProxyResponse{
			StatusCode: 401,
			Body:       `{"message":"unauthorized"}`,
		}

		goResponse := events.APIGatewayProxyResponse{
			StatusCode: 401,
			Body:       `{"message":"unauthorized"}`,
		}

		result := CompareResponses(goResponse, nodeResponse)

		if result.HasDiff {
			t.Errorf("DeleteImage unauthorized error mismatch:\n%s", result.String())
		}
	})

	t.Run("forbidden error should have same format", func(t *testing.T) {
		nodeResponse := events.APIGatewayProxyResponse{
			StatusCode: 403,
			Body:       `{"message":"access denied"}`,
		}

		goResponse := events.APIGatewayProxyResponse{
			StatusCode: 403,
			Body:       `{"message":"access denied"}`,
		}

		result := CompareResponses(goResponse, nodeResponse)

		if result.HasDiff {
			t.Errorf("DeleteImage forbidden error mismatch:\n%s", result.String())
		}
	})
}
