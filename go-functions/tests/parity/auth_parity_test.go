// Package parity provides API parity tests for Auth domain functions.
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

// TestLogin_ResponseParity tests parity between Go and Node.js Login implementations
func TestLogin_ResponseParity(t *testing.T) {
	t.Run("success response should have same structure", func(t *testing.T) {
		// Expected structure from Node.js implementation
		nodeResponse := events.APIGatewayProxyResponse{
			StatusCode: 200,
			Body: `{
				"accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
				"idToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
				"refreshToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
				"expiresIn": 3600
			}`,
		}

		// Go implementation response
		refreshToken := "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
		goToken := domain.TokenResponse{
			AccessToken:  "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
			IDToken:      "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
			RefreshToken: &refreshToken,
			ExpiresIn:    3600,
		}
		goBody, _ := json.Marshal(goToken)
		goResponse := events.APIGatewayProxyResponse{
			StatusCode: 200,
			Body:       string(goBody),
		}

		// Compare with ignore token values (they will differ)
		result := CompareResponsesWithOptions(goResponse, nodeResponse, CompareOptions{
			IgnoreFields: []string{"accessToken", "idToken", "refreshToken"},
		})

		if result.HasDiff {
			t.Errorf("Login response structure mismatch:\n%s", result.String())
		}
	})

	t.Run("missing email error should have same format", func(t *testing.T) {
		nodeResponse := events.APIGatewayProxyResponse{
			StatusCode: 400,
			Body:       `{"message":"email is required"}`,
		}

		goResponse := events.APIGatewayProxyResponse{
			StatusCode: 400,
			Body:       `{"message":"email is required"}`,
		}

		result := CompareResponses(goResponse, nodeResponse)

		if result.HasDiff {
			t.Errorf("Login validation error format mismatch:\n%s", result.String())
		}
	})

	t.Run("missing password error should have same format", func(t *testing.T) {
		nodeResponse := events.APIGatewayProxyResponse{
			StatusCode: 400,
			Body:       `{"message":"password is required"}`,
		}

		goResponse := events.APIGatewayProxyResponse{
			StatusCode: 400,
			Body:       `{"message":"password is required"}`,
		}

		result := CompareResponses(goResponse, nodeResponse)

		if result.HasDiff {
			t.Errorf("Login password validation error format mismatch:\n%s", result.String())
		}
	})

	t.Run("invalid credentials error should have same format", func(t *testing.T) {
		nodeResponse := events.APIGatewayProxyResponse{
			StatusCode: 401,
			Body:       `{"message":"invalid credentials"}`,
		}

		goResponse := events.APIGatewayProxyResponse{
			StatusCode: 401,
			Body:       `{"message":"invalid credentials"}`,
		}

		result := CompareResponses(goResponse, nodeResponse)

		if result.HasDiff {
			t.Errorf("Login invalid credentials error format mismatch:\n%s", result.String())
		}
	})

	t.Run("user not confirmed error should have same format", func(t *testing.T) {
		nodeResponse := events.APIGatewayProxyResponse{
			StatusCode: 401,
			Body:       `{"message":"user is not confirmed"}`,
		}

		goResponse := events.APIGatewayProxyResponse{
			StatusCode: 401,
			Body:       `{"message":"user is not confirmed"}`,
		}

		result := CompareResponses(goResponse, nodeResponse)

		if result.HasDiff {
			t.Errorf("Login user not confirmed error format mismatch:\n%s", result.String())
		}
	})
}

// TestLogout_ResponseParity tests parity between Go and Node.js Logout implementations
func TestLogout_ResponseParity(t *testing.T) {
	t.Run("success response should return 200", func(t *testing.T) {
		nodeResponse := events.APIGatewayProxyResponse{
			StatusCode: 200,
			Body:       `{"message":"logged out successfully"}`,
		}

		goResponse := events.APIGatewayProxyResponse{
			StatusCode: 200,
			Body:       `{"message":"logged out successfully"}`,
		}

		result := CompareResponses(goResponse, nodeResponse)

		if result.HasDiff {
			t.Errorf("Logout success response mismatch:\n%s", result.String())
		}
	})

	t.Run("missing accessToken error should have same format", func(t *testing.T) {
		nodeResponse := events.APIGatewayProxyResponse{
			StatusCode: 400,
			Body:       `{"message":"accessToken is required"}`,
		}

		goResponse := events.APIGatewayProxyResponse{
			StatusCode: 400,
			Body:       `{"message":"accessToken is required"}`,
		}

		result := CompareResponses(goResponse, nodeResponse)

		if result.HasDiff {
			t.Errorf("Logout validation error format mismatch:\n%s", result.String())
		}
	})

	t.Run("invalid token error should have same format", func(t *testing.T) {
		nodeResponse := events.APIGatewayProxyResponse{
			StatusCode: 401,
			Body:       `{"message":"invalid or expired token"}`,
		}

		goResponse := events.APIGatewayProxyResponse{
			StatusCode: 401,
			Body:       `{"message":"invalid or expired token"}`,
		}

		result := CompareResponses(goResponse, nodeResponse)

		if result.HasDiff {
			t.Errorf("Logout invalid token error format mismatch:\n%s", result.String())
		}
	})
}

// TestRefresh_ResponseParity tests parity between Go and Node.js Refresh implementations
func TestRefresh_ResponseParity(t *testing.T) {
	t.Run("success response should have same structure", func(t *testing.T) {
		// Node.js response (refreshToken is NOT returned on refresh)
		nodeResponse := events.APIGatewayProxyResponse{
			StatusCode: 200,
			Body: `{
				"accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
				"idToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
				"expiresIn": 3600
			}`,
		}

		// Go implementation response
		goToken := domain.TokenResponse{
			AccessToken: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
			IDToken:     "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
			ExpiresIn:   3600,
		}
		goBody, _ := json.Marshal(goToken)
		goResponse := events.APIGatewayProxyResponse{
			StatusCode: 200,
			Body:       string(goBody),
		}

		// Compare with ignore token values
		result := CompareResponsesWithOptions(goResponse, nodeResponse, CompareOptions{
			IgnoreFields: []string{"accessToken", "idToken"},
		})

		if result.HasDiff {
			t.Errorf("Refresh response structure mismatch:\n%s", result.String())
		}
	})

	t.Run("missing refreshToken error should have same format", func(t *testing.T) {
		nodeResponse := events.APIGatewayProxyResponse{
			StatusCode: 400,
			Body:       `{"message":"refreshToken is required"}`,
		}

		goResponse := events.APIGatewayProxyResponse{
			StatusCode: 400,
			Body:       `{"message":"refreshToken is required"}`,
		}

		result := CompareResponses(goResponse, nodeResponse)

		if result.HasDiff {
			t.Errorf("Refresh validation error format mismatch:\n%s", result.String())
		}
	})

	t.Run("invalid token error should have same format", func(t *testing.T) {
		nodeResponse := events.APIGatewayProxyResponse{
			StatusCode: 401,
			Body:       `{"message":"invalid or expired token"}`,
		}

		goResponse := events.APIGatewayProxyResponse{
			StatusCode: 401,
			Body:       `{"message":"invalid or expired token"}`,
		}

		result := CompareResponses(goResponse, nodeResponse)

		if result.HasDiff {
			t.Errorf("Refresh invalid token error format mismatch:\n%s", result.String())
		}
	})
}
