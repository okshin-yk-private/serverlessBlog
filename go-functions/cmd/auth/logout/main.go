// Package main provides the Logout Lambda function for user session invalidation.
//
// Requirement 4.2: ログアウト (POST /auth/logout)
//   - 有効なアクセストークンが提供されたとき、Logout LambdaはCognito GlobalSignOutを実行する
//   - ログアウトが成功したとき、Logout LambdaはHTTP 200を返す
//   - アクセストークンが無効または期限切れの場合、Logout LambdaはHTTP 401を返す
package main

import (
	"context"
	"encoding/json"
	"errors"

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
	GlobalSignOut(ctx context.Context, params *cognitoidentityprovider.GlobalSignOutInput, optFns ...func(*cognitoidentityprovider.Options)) (*cognitoidentityprovider.GlobalSignOutOutput, error)
}

// cognitoClientGetter is a function that returns the Cognito client
// This can be overridden in tests
var cognitoClientGetter = func() (CognitoClientInterface, error) {
	return clients.GetCognito()
}

// Handler handles POST /auth/logout requests
func Handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Validate request body is present
	if request.Body == "" {
		return errorResponse(400, "request body is required")
	}

	// Parse request body
	var logoutReq domain.LogoutRequest
	if err := json.Unmarshal([]byte(request.Body), &logoutReq); err != nil {
		return errorResponse(400, "invalid request body")
	}

	// Validate request fields
	if err := logoutReq.Validate(); err != nil {
		return errorResponse(400, err.Error())
	}

	// Get Cognito client
	cognitoClient, err := cognitoClientGetter()
	if err != nil {
		return errorResponse(500, "server error")
	}

	// Execute global sign out with Cognito
	signOutInput := &cognitoidentityprovider.GlobalSignOutInput{
		AccessToken: &logoutReq.AccessToken,
	}

	_, err = cognitoClient.GlobalSignOut(ctx, signOutInput)
	if err != nil {
		return handleCognitoError(err)
	}

	// Return success response
	return middleware.JSONResponse(200, map[string]string{
		"message": "logged out successfully",
	})
}

// errorResponse creates an error response with CORS headers
func errorResponse(statusCode int, message string) (events.APIGatewayProxyResponse, error) {
	return middleware.JSONResponse(statusCode, domain.ErrorResponse{Message: message})
}

// handleCognitoError maps Cognito errors to appropriate HTTP responses
func handleCognitoError(err error) (events.APIGatewayProxyResponse, error) {
	// Check for specific Cognito exceptions
	var notAuthErr *types.NotAuthorizedException
	if errors.As(err, &notAuthErr) {
		return errorResponse(401, "invalid or expired access token")
	}

	// Generic server error for other cases
	return errorResponse(500, "logout failed")
}

func main() {
	lambda.Start(Handler)
}
