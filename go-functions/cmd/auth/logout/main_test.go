package main

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider"
	"github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider/types"

	"serverless-blog/go-functions/internal/domain"
)

// MockCognitoClient is a mock implementation of CognitoClientInterface
type MockCognitoClient struct {
	GlobalSignOutFunc func(ctx context.Context, params *cognitoidentityprovider.GlobalSignOutInput, optFns ...func(*cognitoidentityprovider.Options)) (*cognitoidentityprovider.GlobalSignOutOutput, error)
}

func (m *MockCognitoClient) GlobalSignOut(ctx context.Context, params *cognitoidentityprovider.GlobalSignOutInput, optFns ...func(*cognitoidentityprovider.Options)) (*cognitoidentityprovider.GlobalSignOutOutput, error) {
	if m.GlobalSignOutFunc != nil {
		return m.GlobalSignOutFunc(ctx, params, optFns...)
	}
	return nil, errors.New("GlobalSignOutFunc not set")
}

func setupTest(t *testing.T) func() {
	t.Helper()
	t.Setenv("AWS_REGION", "ap-northeast-1")

	// Store original getter
	originalGetter := cognitoClientGetter

	// Restore after test
	return func() {
		cognitoClientGetter = originalGetter
	}
}

func TestHandler_ValidationErrors(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	tests := []struct {
		name           string
		body           string
		expectedStatus int
		expectedError  string
	}{
		{
			name:           "missing request body",
			body:           "",
			expectedStatus: 400,
			expectedError:  "request body is required",
		},
		{
			name:           "invalid JSON",
			body:           "not-json",
			expectedStatus: 400,
			expectedError:  "invalid request body",
		},
		{
			name:           "missing accessToken",
			body:           `{}`,
			expectedStatus: 400,
			expectedError:  "accessToken is required",
		},
		{
			name:           "empty accessToken",
			body:           `{"accessToken":""}`,
			expectedStatus: 400,
			expectedError:  "accessToken is required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			request := events.APIGatewayProxyRequest{
				Body: tt.body,
			}

			resp, err := Handler(context.Background(), request)
			if err != nil {
				t.Fatalf("Handler returned unexpected error: %v", err)
			}

			if resp.StatusCode != tt.expectedStatus {
				t.Errorf("expected status %d, got %d", tt.expectedStatus, resp.StatusCode)
			}

			var errResp domain.ErrorResponse
			if err := json.Unmarshal([]byte(resp.Body), &errResp); err != nil {
				t.Fatalf("failed to unmarshal response: %v", err)
			}

			if errResp.Message != tt.expectedError {
				t.Errorf("expected error message %q, got %q", tt.expectedError, errResp.Message)
			}
		})
	}
}

func TestHandler_CORSHeaders(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	request := events.APIGatewayProxyRequest{
		Body: `{"accessToken":"valid-token"}`,
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	// Check CORS headers are present
	if resp.Headers["Access-Control-Allow-Origin"] != "*" {
		t.Errorf("expected Access-Control-Allow-Origin header to be *, got %q", resp.Headers["Access-Control-Allow-Origin"])
	}

	if resp.Headers["Content-Type"] != "application/json" {
		t.Errorf("expected Content-Type header to be application/json, got %q", resp.Headers["Content-Type"])
	}
}

func TestHandler_SuccessfulLogout(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	// Mock Cognito client for successful logout
	mockClient := &MockCognitoClient{
		GlobalSignOutFunc: func(ctx context.Context, params *cognitoidentityprovider.GlobalSignOutInput, optFns ...func(*cognitoidentityprovider.Options)) (*cognitoidentityprovider.GlobalSignOutOutput, error) {
			// Verify the input parameters
			if params.AccessToken == nil || *params.AccessToken != "valid-access-token" {
				t.Errorf("expected AccessToken to be valid-access-token, got %v", params.AccessToken)
			}

			return &cognitoidentityprovider.GlobalSignOutOutput{}, nil
		},
	}

	cognitoClientGetter = func() (CognitoClientInterface, error) {
		return mockClient, nil
	}

	request := events.APIGatewayProxyRequest{
		Body: `{"accessToken":"valid-access-token"}`,
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var msgResp map[string]string
	if err := json.Unmarshal([]byte(resp.Body), &msgResp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if msgResp["message"] != "logged out successfully" {
		t.Errorf("expected message %q, got %q", "logged out successfully", msgResp["message"])
	}
}

// TestHandler_CognitoErrors tests various Cognito error scenarios using table-driven tests
func TestHandler_CognitoErrors(t *testing.T) {
	tests := []struct {
		name           string
		cognitoErr     error
		expectedStatus int
		expectedError  string
	}{
		{
			name:           "NotAuthorizedException - invalid token",
			cognitoErr:     &types.NotAuthorizedException{Message: ptrString("Access Token has been revoked")},
			expectedStatus: 401,
			expectedError:  "invalid or expired access token",
		},
		{
			name:           "generic Cognito error",
			cognitoErr:     errors.New("some cognito error"),
			expectedStatus: 500,
			expectedError:  "logout failed",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cleanup := setupTest(t)
			defer cleanup()

			mockClient := &MockCognitoClient{
				GlobalSignOutFunc: func(ctx context.Context, params *cognitoidentityprovider.GlobalSignOutInput, optFns ...func(*cognitoidentityprovider.Options)) (*cognitoidentityprovider.GlobalSignOutOutput, error) {
					return nil, tt.cognitoErr
				},
			}

			cognitoClientGetter = func() (CognitoClientInterface, error) {
				return mockClient, nil
			}

			request := events.APIGatewayProxyRequest{
				Body: `{"accessToken":"some-token"}`,
			}

			resp, err := Handler(context.Background(), request)
			if err != nil {
				t.Fatalf("Handler returned unexpected error: %v", err)
			}

			if resp.StatusCode != tt.expectedStatus {
				t.Errorf("expected status %d, got %d", tt.expectedStatus, resp.StatusCode)
			}

			var errResp domain.ErrorResponse
			if err := json.Unmarshal([]byte(resp.Body), &errResp); err != nil {
				t.Fatalf("failed to unmarshal response: %v", err)
			}

			if errResp.Message != tt.expectedError {
				t.Errorf("expected error message %q, got %q", tt.expectedError, errResp.Message)
			}
		})
	}
}

func TestHandler_CognitoClientInitError(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	// Mock Cognito client getter to return an error
	cognitoClientGetter = func() (CognitoClientInterface, error) {
		return nil, errors.New("failed to initialize cognito client")
	}

	request := events.APIGatewayProxyRequest{
		Body: `{"accessToken":"some-token"}`,
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 500 {
		t.Errorf("expected status 500, got %d", resp.StatusCode)
	}

	var errResp domain.ErrorResponse
	if err := json.Unmarshal([]byte(resp.Body), &errResp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if errResp.Message != "server error" {
		t.Errorf("expected error message %q, got %q", "server error", errResp.Message)
	}
}

func TestHandler_ResponseStructure(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	// For error responses, verify they have the correct structure
	request := events.APIGatewayProxyRequest{
		Body: "", // Missing body to trigger validation error
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	// Verify error response structure has "message" field
	var errResp map[string]interface{}
	if err := json.Unmarshal([]byte(resp.Body), &errResp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if _, ok := errResp["message"]; !ok {
		t.Error("error response should have 'message' field")
	}
}

// Helper function to create a pointer to a string
func ptrString(s string) *string {
	return &s
}
