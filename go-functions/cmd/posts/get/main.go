// Package main provides the GetPost Lambda function for retrieving posts (authenticated).
//
// Requirement 3.2: 記事取得 (GET /posts/:id - 認証必須)
//   - 認証付きの有効な記事取得リクエストと有効な記事IDを受信したとき、GetPost LambdaはDynamoDBから記事を返す
//   - 記事IDがDynamoDBに存在しない場合、GetPost LambdaはHTTP 404を返す
//   - リクエストに有効な認証がない場合、GetPost LambdaはHTTP 401を返す
package main

import (
	"context"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"serverless-blog/go-functions/internal/clients"
	"serverless-blog/go-functions/internal/domain"
	"serverless-blog/go-functions/internal/middleware"
)

// DynamoDBClientInterface defines the interface for DynamoDB operations (for testing)
type DynamoDBClientInterface interface {
	GetItem(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error)
}

// dynamoClientGetter is a function that returns the DynamoDB client
// This can be overridden in tests
var dynamoClientGetter = func() (DynamoDBClientInterface, error) {
	return clients.GetDynamoDB()
}

// Handler handles GET /posts/:id requests (authenticated)
func Handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Validate authentication first
	userID := getUserIDFromRequest(request)
	if userID == "" {
		return errorResponse(401, "unauthorized")
	}

	// Validate post ID from path parameters
	postID := request.PathParameters["id"]
	if postID == "" {
		return errorResponse(400, "post ID is required")
	}

	// Check for TABLE_NAME
	tableName := os.Getenv("TABLE_NAME")
	if tableName == "" {
		return errorResponse(500, "server configuration error")
	}

	// Get DynamoDB client
	dynamoClient, err := dynamoClientGetter()
	if err != nil {
		return errorResponse(500, "server error")
	}

	// Get the post from DynamoDB
	getInput := &dynamodb.GetItemInput{
		TableName: &tableName,
		Key: map[string]types.AttributeValue{
			"id": &types.AttributeValueMemberS{Value: postID},
		},
	}

	result, err := dynamoClient.GetItem(ctx, getInput)
	if err != nil {
		return errorResponse(500, "failed to retrieve post")
	}

	// Check if item was found
	if len(result.Item) == 0 {
		return errorResponse(404, "post not found")
	}

	// Unmarshal the post
	var post domain.BlogPost
	if err := attributevalue.UnmarshalMap(result.Item, &post); err != nil {
		return errorResponse(500, "failed to parse post data")
	}

	// Note: Unlike GetPublicPost, authenticated users CAN access draft posts
	// No publish status check required here

	return middleware.JSONResponse(200, post)
}

// getUserIDFromRequest extracts the user ID from the request context
// Returns empty string if user is not authenticated
func getUserIDFromRequest(request events.APIGatewayProxyRequest) string {
	// Check if authorizer is present
	if request.RequestContext.Authorizer == nil {
		return ""
	}

	// Get claims from authorizer
	claims, ok := request.RequestContext.Authorizer["claims"]
	if !ok || claims == nil {
		return ""
	}

	// Type assert claims to map
	claimsMap, ok := claims.(map[string]interface{})
	if !ok {
		return ""
	}

	// Get sub (user ID) from claims
	sub, ok := claimsMap["sub"]
	if !ok {
		return ""
	}

	// Type assert sub to string
	userID, ok := sub.(string)
	if !ok || userID == "" {
		return ""
	}

	return userID
}

// errorResponse creates an error response with CORS headers
func errorResponse(statusCode int, message string) (events.APIGatewayProxyResponse, error) {
	return middleware.JSONResponse(statusCode, domain.ErrorResponse{Message: message})
}

func main() {
	lambda.Start(Handler)
}
