// Package main provides the GetPublicMindmap Lambda function for retrieving published mindmaps.
//
// Requirement 8.7: GET /public/mindmaps/:id エンドポイント（認証不要）
//   - publishStatus=publishedのマインドマップのみ返却
//   - 非公開または存在しない場合は404を返却
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
var dynamoClientGetter = func() (DynamoDBClientInterface, error) {
	return clients.GetDynamoDB()
}

// Handler handles GET /public/mindmaps/:id requests (no auth required)
func Handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Validate mindmap ID
	mindmapID := request.PathParameters["id"]
	if mindmapID == "" {
		return errorResponse(400, "mindmap ID is required")
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

	// Get the mindmap from DynamoDB
	getInput := &dynamodb.GetItemInput{
		TableName: &tableName,
		Key: map[string]types.AttributeValue{
			"id": &types.AttributeValueMemberS{Value: mindmapID},
		},
	}

	result, err := dynamoClient.GetItem(ctx, getInput)
	if err != nil {
		return errorResponse(500, "failed to retrieve mindmap")
	}

	if len(result.Item) == 0 {
		return errorResponse(404, "mindmap not found")
	}

	var mindmap domain.Mindmap
	if err := attributevalue.UnmarshalMap(result.Item, &mindmap); err != nil {
		return errorResponse(500, "failed to parse mindmap data")
	}

	// Only return published mindmaps
	if mindmap.PublishStatus != domain.PublishStatusPublished {
		return errorResponse(404, "mindmap not found")
	}

	return middleware.JSONResponse(200, mindmap)
}

// errorResponse creates an error response with CORS headers
func errorResponse(statusCode int, message string) (events.APIGatewayProxyResponse, error) {
	return middleware.JSONResponse(statusCode, domain.ErrorResponse{Message: message})
}

func main() {
	lambda.Start(Handler)
}
