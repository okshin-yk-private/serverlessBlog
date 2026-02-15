// Package main provides the GetMindmap Lambda function for retrieving mindmaps (authenticated).
//
// Requirement 1.3: マインドマップ詳細取得 (GET /admin/mindmaps/:id)
// Requirement 8.3: GET /mindmaps/:id エンドポイント（認証必須）
// Requirement 8.8: 存在しないIDの場合は404を返却
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

// Handler handles GET /admin/mindmaps/:id requests (authenticated)
func Handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Validate authentication
	userID := extractAuthorID(request)
	if userID == "" {
		return errorResponse(401, "unauthorized")
	}

	// Validate mindmap ID from path parameters
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

	// Security: Draft mindmaps can only be accessed by their author
	// Published mindmaps can be accessed by any authenticated user
	if mindmap.PublishStatus == domain.PublishStatusDraft && mindmap.AuthorID != userID {
		return errorResponse(403, "forbidden: you can only access your own draft mindmaps")
	}

	return middleware.JSONResponse(200, mindmap)
}

// extractAuthorID extracts the user ID from Cognito authorizer claims
func extractAuthorID(request events.APIGatewayProxyRequest) string {
	if request.RequestContext.Authorizer == nil {
		return ""
	}
	claims, ok := request.RequestContext.Authorizer["claims"]
	if !ok {
		return ""
	}
	claimsMap, ok := claims.(map[string]interface{})
	if !ok {
		return ""
	}
	sub, ok := claimsMap["sub"]
	if !ok {
		return ""
	}
	subStr, ok := sub.(string)
	if !ok {
		return ""
	}
	return subStr
}

// errorResponse creates an error response with CORS headers
func errorResponse(statusCode int, message string) (events.APIGatewayProxyResponse, error) {
	return middleware.JSONResponse(statusCode, domain.ErrorResponse{Message: message})
}

func main() {
	lambda.Start(Handler)
}
