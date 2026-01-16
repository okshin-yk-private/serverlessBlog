// Package main provides the Login Lambda function for user authentication.
//
// Requirement 4.1: ログイン (POST /auth/login)
//   - 有効な認証情報（email、password）を受信したとき、Login LambdaはCognitoで認証し、
//     JWTトークン（accessToken、refreshToken、idToken）を返す
//   - 認証が成功したとき、Login Lambdaはレスポンスに expiresIn を含める
//   - 認証情報が無効な場合、Login LambdaはHTTP 401を返す
//   - ユーザーが確認されていない場合、Login Lambdaは適切なエラーメッセージと共にHTTP 401を返す
//   - 必須フィールド（email、password）が欠けている場合、Login LambdaはHTTP 400を返す
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

// Handler handles POST /auth/login requests
func Handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Validate request body is present
	if request.Body == "" {
		return errorResponse(400, "request body is required")
	}

	// Parse request body
	var loginReq domain.LoginRequest
	if err := json.Unmarshal([]byte(request.Body), &loginReq); err != nil {
		return errorResponse(400, "invalid request body")
	}

	// Validate request fields
	if err := loginReq.Validate(); err != nil {
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

	// Initiate authentication with Cognito
	authInput := &cognitoidentityprovider.InitiateAuthInput{
		AuthFlow: types.AuthFlowTypeUserPasswordAuth,
		ClientId: &clientID,
		AuthParameters: map[string]string{
			"USERNAME": loginReq.Email,
			"PASSWORD": loginReq.Password,
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
	tokenResp := domain.TokenResponse{
		AccessToken: *authOutput.AuthenticationResult.AccessToken,
		IDToken:     *authOutput.AuthenticationResult.IdToken,
		ExpiresIn:   int(authOutput.AuthenticationResult.ExpiresIn),
	}

	// Include refresh token if present
	if authOutput.AuthenticationResult.RefreshToken != nil {
		tokenResp.RefreshToken = authOutput.AuthenticationResult.RefreshToken
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
		return errorResponse(401, "invalid email or password")
	}

	var userNotFoundErr *types.UserNotFoundException
	if errors.As(err, &userNotFoundErr) {
		return errorResponse(401, "invalid email or password")
	}

	var userNotConfirmedErr *types.UserNotConfirmedException
	if errors.As(err, &userNotConfirmedErr) {
		// Return generic message to prevent user enumeration attacks
		return errorResponse(401, "invalid email or password")
	}

	// Generic server error for other cases
	return errorResponse(500, "authentication failed")
}

func main() {
	lambda.Start(Handler)
}
