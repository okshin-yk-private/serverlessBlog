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
	InitiateAuthFunc func(ctx context.Context, params *cognitoidentityprovider.InitiateAuthInput, optFns ...func(*cognitoidentityprovider.Options)) (*cognitoidentityprovider.InitiateAuthOutput, error)
}

func (m *MockCognitoClient) InitiateAuth(ctx context.Context, params *cognitoidentityprovider.InitiateAuthInput, optFns ...func(*cognitoidentityprovider.Options)) (*cognitoidentityprovider.InitiateAuthOutput, error) {
	if m.InitiateAuthFunc != nil {
		return m.InitiateAuthFunc(ctx, params, optFns...)
	}
	return nil, errors.New("InitiateAuthFunc not set")
}

func setupTest(t *testing.T) func() {
	t.Helper()
	t.Setenv("USER_POOL_CLIENT_ID", "test-client-id")
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
			name:           "missing email",
			body:           `{"password":"password123"}`,
			expectedStatus: 400,
			expectedError:  "email is required",
		},
		{
			name:           "missing password",
			body:           `{"email":"test@example.com"}`,
			expectedStatus: 400,
			expectedError:  "password is required",
		},
		{
			name:           "empty email",
			body:           `{"email":"","password":"password123"}`,
			expectedStatus: 400,
			expectedError:  "email is required",
		},
		{
			name:           "empty password",
			body:           `{"email":"test@example.com","password":""}`,
			expectedStatus: 400,
			expectedError:  "password is required",
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

func TestHandler_MissingClientID(t *testing.T) {
	// Unset the environment variable
	t.Setenv("USER_POOL_CLIENT_ID", "")

	request := events.APIGatewayProxyRequest{
		Body: `{"email":"test@example.com","password":"password123"}`,
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

	if errResp.Message != "server configuration error" {
		t.Errorf("expected error message %q, got %q", "server configuration error", errResp.Message)
	}
}

func TestHandler_CORSHeaders(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	request := events.APIGatewayProxyRequest{
		Body: `{"email":"test@example.com","password":"password123"}`,
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

func TestHandler_SuccessfulLogin(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	// Mock Cognito client for successful authentication
	accessToken := "mock-access-token"
	idToken := "mock-id-token"
	refreshToken := "mock-refresh-token"
	expiresIn := int32(3600)

	mockClient := &MockCognitoClient{
		InitiateAuthFunc: func(ctx context.Context, params *cognitoidentityprovider.InitiateAuthInput, optFns ...func(*cognitoidentityprovider.Options)) (*cognitoidentityprovider.InitiateAuthOutput, error) {
			// Verify the input parameters
			if params.AuthParameters["USERNAME"] != "test@example.com" {
				t.Errorf("expected USERNAME to be test@example.com, got %s", params.AuthParameters["USERNAME"])
			}
			if params.AuthParameters["PASSWORD"] != "password123" {
				t.Errorf("expected PASSWORD to be password123, got %s", params.AuthParameters["PASSWORD"])
			}

			return &cognitoidentityprovider.InitiateAuthOutput{
				AuthenticationResult: &types.AuthenticationResultType{
					AccessToken:  &accessToken,
					IdToken:      &idToken,
					RefreshToken: &refreshToken,
					ExpiresIn:    expiresIn,
				},
			}, nil
		},
	}

	cognitoClientGetter = func() (CognitoClientInterface, error) {
		return mockClient, nil
	}

	request := events.APIGatewayProxyRequest{
		Body: `{"email":"test@example.com","password":"password123"}`,
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var tokenResp domain.TokenResponse
	if err := json.Unmarshal([]byte(resp.Body), &tokenResp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if tokenResp.AccessToken != accessToken {
		t.Errorf("expected accessToken %q, got %q", accessToken, tokenResp.AccessToken)
	}

	if tokenResp.IDToken != idToken {
		t.Errorf("expected idToken %q, got %q", idToken, tokenResp.IDToken)
	}

	if tokenResp.RefreshToken == nil || *tokenResp.RefreshToken != refreshToken {
		t.Errorf("expected refreshToken %q, got %v", refreshToken, tokenResp.RefreshToken)
	}

	if tokenResp.ExpiresIn != int(expiresIn) {
		t.Errorf("expected expiresIn %d, got %d", expiresIn, tokenResp.ExpiresIn)
	}
}

func TestHandler_SuccessfulLoginWithoutRefreshToken(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	// Mock Cognito client for successful authentication without refresh token
	accessToken := "mock-access-token"
	idToken := "mock-id-token"
	expiresIn := int32(3600)

	mockClient := &MockCognitoClient{
		InitiateAuthFunc: func(ctx context.Context, params *cognitoidentityprovider.InitiateAuthInput, optFns ...func(*cognitoidentityprovider.Options)) (*cognitoidentityprovider.InitiateAuthOutput, error) {
			return &cognitoidentityprovider.InitiateAuthOutput{
				AuthenticationResult: &types.AuthenticationResultType{
					AccessToken:  &accessToken,
					IdToken:      &idToken,
					RefreshToken: nil, // No refresh token
					ExpiresIn:    expiresIn,
				},
			}, nil
		},
	}

	cognitoClientGetter = func() (CognitoClientInterface, error) {
		return mockClient, nil
	}

	request := events.APIGatewayProxyRequest{
		Body: `{"email":"test@example.com","password":"password123"}`,
	}

	resp, err := Handler(context.Background(), request)
	if err != nil {
		t.Fatalf("Handler returned unexpected error: %v", err)
	}

	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}

	var tokenResp domain.TokenResponse
	if err := json.Unmarshal([]byte(resp.Body), &tokenResp); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if tokenResp.RefreshToken != nil {
		t.Errorf("expected refreshToken to be nil, got %v", tokenResp.RefreshToken)
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
			name:           "NotAuthorizedException",
			cognitoErr:     &types.NotAuthorizedException{Message: ptrString("Invalid username or password")},
			expectedStatus: 401,
			expectedError:  "invalid email or password",
		},
		{
			name:           "UserNotFoundException",
			cognitoErr:     &types.UserNotFoundException{Message: ptrString("User not found")},
			expectedStatus: 401,
			expectedError:  "invalid email or password",
		},
		{
			name:           "UserNotConfirmedException",
			cognitoErr:     &types.UserNotConfirmedException{Message: ptrString("User is not confirmed")},
			expectedStatus: 401,
			expectedError:  "user is not confirmed",
		},
		{
			name:           "generic Cognito error",
			cognitoErr:     errors.New("some cognito error"),
			expectedStatus: 500,
			expectedError:  "authentication failed",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cleanup := setupTest(t)
			defer cleanup()

			mockClient := &MockCognitoClient{
				InitiateAuthFunc: func(ctx context.Context, params *cognitoidentityprovider.InitiateAuthInput, optFns ...func(*cognitoidentityprovider.Options)) (*cognitoidentityprovider.InitiateAuthOutput, error) {
					return nil, tt.cognitoErr
				},
			}

			cognitoClientGetter = func() (CognitoClientInterface, error) {
				return mockClient, nil
			}

			request := events.APIGatewayProxyRequest{
				Body: `{"email":"test@example.com","password":"password123"}`,
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

func TestHandler_NilAuthenticationResult(t *testing.T) {
	cleanup := setupTest(t)
	defer cleanup()

	// Mock Cognito client to return nil AuthenticationResult
	mockClient := &MockCognitoClient{
		InitiateAuthFunc: func(ctx context.Context, params *cognitoidentityprovider.InitiateAuthInput, optFns ...func(*cognitoidentityprovider.Options)) (*cognitoidentityprovider.InitiateAuthOutput, error) {
			return &cognitoidentityprovider.InitiateAuthOutput{
				AuthenticationResult: nil,
			}, nil
		},
	}

	cognitoClientGetter = func() (CognitoClientInterface, error) {
		return mockClient, nil
	}

	request := events.APIGatewayProxyRequest{
		Body: `{"email":"test@example.com","password":"password123"}`,
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

	if errResp.Message != "authentication result not available" {
		t.Errorf("expected error message %q, got %q", "authentication result not available", errResp.Message)
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
		Body: `{"email":"test@example.com","password":"password123"}`,
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
