// Package main provides the Refresh Lambda function for token refresh.
//
// Requirement 4.3: トークン更新 (POST /auth/refresh)
//   - 有効なリフレッシュトークンが提供されたとき、Refresh LambdaはCognitoから新しいアクセストークンとIDトークンを取得する
//   - トークン更新が成功したとき、Refresh Lambdaは expiresIn と共に新しいトークンを返す
//   - リフレッシュトークンが無効または期限切れの場合、Refresh LambdaはHTTP 401を返す
package main

import (
	"context"
	"encoding/json"
	"errors"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider"
	"github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider/types"

	"serverless-blog/go-functions/internal/clients"
	"serverless-blog/go-functions/internal/domain"
	"serverless-blog/go-functions/internal/middleware"
)

// CognitoClientInterface defines the interface for Cognito operations (for testing)
type CognitoClientInterface interface {
	InitiateAuth(ctx context.Context, params *cognitoidentityprovider.InitiateAuthInput, optFns ...func(*cognitoidentityprovider.Options)) (*cognitoidentityprovider.InitiateAuthOutput, error)
}

// cognitoClientGetter is a function that returns the Cognito client
// This can be overridden in tests
var cognitoClientGetter = func() (CognitoClientInterface, error) {
	return clients.GetCognito()
}

// Handler handles POST /auth/refresh requests
func Handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Validate request body is present
	if request.Body == "" {
		return errorResponse(400, "request body is required")
	}

	// Parse request body
	var refreshReq domain.RefreshRequest
	if err := json.Unmarshal([]byte(request.Body), &refreshReq); err != nil {
		return errorResponse(400, "invalid request body")
	}

	// Validate request fields
	if err := refreshReq.Validate(); err != nil {
		return errorResponse(400, err.Error())
	}

	// Check for USER_POOL_CLIENT_ID
	clientID := os.Getenv("USER_POOL_CLIENT_ID")
	if clientID == "" {
		return errorResponse(500, "server configuration error")
	}

	// Get Cognito client
	cognitoClient, err := cognitoClientGetter()
	if err != nil {
		return errorResponse(500, "server error")
	}

	// Initiate token refresh with Cognito using REFRESH_TOKEN_AUTH flow
	authInput := &cognitoidentityprovider.InitiateAuthInput{
		AuthFlow: types.AuthFlowTypeRefreshTokenAuth,
		ClientId: &clientID,
		AuthParameters: map[string]string{
			"REFRESH_TOKEN": refreshReq.RefreshToken,
		},
	}

	authOutput, err := cognitoClient.InitiateAuth(ctx, authInput)
	if err != nil {
		return handleCognitoError(err)
	}

	// Validate authentication result
	if authOutput.AuthenticationResult == nil {
		return errorResponse(500, "authentication result not available")
	}

	// Build successful response
	// Note: REFRESH_TOKEN_AUTH does not return a new refresh token
	tokenResp := domain.TokenResponse{
		AccessToken: *authOutput.AuthenticationResult.AccessToken,
		IDToken:     *authOutput.AuthenticationResult.IdToken,
		ExpiresIn:   int(authOutput.AuthenticationResult.ExpiresIn),
	}

	return tokenResponseWithNoCache(200, tokenResp)
}

// errorResponse creates an error response with CORS headers
func errorResponse(statusCode int, message string) (events.APIGatewayProxyResponse, error) {
	return middleware.JSONResponse(statusCode, domain.ErrorResponse{Message: message})
}

// tokenResponseWithNoCache creates a JSON response with Cache-Control: no-store header
// to prevent tokens from being cached by browsers or intermediaries
func tokenResponseWithNoCache(statusCode int, body interface{}) (events.APIGatewayProxyResponse, error) {
	jsonBody, err := json.Marshal(body)
	if err != nil {
		return events.APIGatewayProxyResponse{
			StatusCode: 500,
			Headers:    middleware.CORSHeaders(),
			Body:       `{"error":"Failed to marshal response"}`,
		}, err
	}

	headers := middleware.CORSHeaders()
	headers["Cache-Control"] = "no-store"
	headers["Pragma"] = "no-cache"

	return events.APIGatewayProxyResponse{
		StatusCode: statusCode,
		Headers:    headers,
		Body:       string(jsonBody),
	}, nil
}

// handleCognitoError maps Cognito errors to appropriate HTTP responses
func handleCognitoError(err error) (events.APIGatewayProxyResponse, error) {
	// Check for specific Cognito exceptions
	var notAuthErr *types.NotAuthorizedException
	if errors.As(err, &notAuthErr) {
		return errorResponse(401, "invalid or expired refresh token")
	}

	// Generic server error for other cases
	return errorResponse(500, "token refresh failed")
}

func main() {
	lambda.Start(Handler)
}
