// Package main provides the GetPublicPost Lambda function for retrieving published posts.
//
// Requirement 3.3: 公開記事取得 (GET /posts/:id - 公開)
//   - 有効な記事IDで公開記事取得リクエストを受信したとき、GetPublicPost Lambdaは
//     publishStatusが "published" の場合に記事を返す
//   - 記事が公開されていないか存在しない場合、GetPublicPost LambdaはHTTP 404を返す
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

// Handler handles GET /posts/:id requests (public)
func Handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
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

	// Check if the post is published (return 404 if not)
	if post.PublishStatus != domain.PublishStatusPublished {
		return errorResponse(404, "post not found")
	}

	return middleware.JSONResponse(200, post)
}

// errorResponse creates an error response with CORS headers
func errorResponse(statusCode int, message string) (events.APIGatewayProxyResponse, error) {
	return middleware.JSONResponse(statusCode, domain.ErrorResponse{Message: message})
}

func main() {
	lambda.Start(Handler)
}
