// Package main provides the DeleteMindmap Lambda function for deleting mindmaps.
//
// Requirement 1.5: マインドマップ削除 (DELETE /admin/mindmaps/:id)
// Requirement 8.5: DELETE /mindmaps/:id エンドポイント（認証必須）
// Requirement 8.8: 存在しないIDの場合は404を返却
package main

import (
	"context"
	"log/slog"
	"os"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"serverless-blog/go-functions/internal/buildtrigger"
	"serverless-blog/go-functions/internal/clients"
	"serverless-blog/go-functions/internal/domain"
	"serverless-blog/go-functions/internal/middleware"
)

// DynamoDBClientInterface defines the interface for DynamoDB operations (for testing)
type DynamoDBClientInterface interface {
	GetItem(ctx context.Context, params *dynamodb.GetItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.GetItemOutput, error)
	DeleteItem(ctx context.Context, params *dynamodb.DeleteItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.DeleteItemOutput, error)
}

// dynamoClientGetter is a function that returns the DynamoDB client
var dynamoClientGetter = func() (DynamoDBClientInterface, error) {
	return clients.GetDynamoDB()
}

// codebuildClientGetter is a function that returns the CodeBuild client
var codebuildClientGetter = clients.GetCodeBuild

// Handler handles DELETE /admin/mindmaps/:id requests
func Handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Validate authentication
	userID := extractAuthorID(request)
	if userID == "" {
		return errorResponse(401, "unauthorized")
	}

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

	// Get existing mindmap to check existence and status
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

	// Unmarshal to check publish status
	var existing domain.Mindmap
	if err = attributevalue.UnmarshalMap(result.Item, &existing); err != nil {
		return errorResponse(500, "failed to parse mindmap data")
	}

	// Security: Verify ownership - only the author can delete their mindmap
	if existing.AuthorID != userID {
		return errorResponse(403, "forbidden: you can only delete your own mindmaps")
	}

	// Delete from DynamoDB
	deleteInput := &dynamodb.DeleteItemInput{
		TableName: &tableName,
		Key: map[string]types.AttributeValue{
			"id": &types.AttributeValueMemberS{Value: mindmapID},
		},
	}
	_, err = dynamoClient.DeleteItem(ctx, deleteInput)
	if err != nil {
		return errorResponse(500, "failed to delete mindmap")
	}

	// Trigger build if the deleted mindmap was published
	if existing.PublishStatus == domain.PublishStatusPublished {
		triggerSiteBuild(ctx)
	}

	return events.APIGatewayProxyResponse{
		StatusCode: 204,
		Headers:    middleware.CORSHeaders(),
		Body:       "",
	}, nil
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

// triggerSiteBuild triggers the Astro SSG build via CodeBuild
func triggerSiteBuild(ctx context.Context) {
	projectName := os.Getenv("CODEBUILD_PROJECT_NAME")
	if projectName == "" {
		slog.Warn("CODEBUILD_PROJECT_NAME not set, skipping build trigger")
		return
	}
	client, err := codebuildClientGetter()
	if err != nil {
		slog.Error("failed to get CodeBuild client", "error", err)
		return
	}
	trigger := buildtrigger.NewBuildTrigger(client, projectName)
	if err := trigger.TriggerBuild(ctx); err != nil {
		slog.Error("failed to trigger site build", "error", err, "project", projectName)
		return
	}
	slog.Info("site build triggered successfully", "project", projectName)
}

func main() {
	lambda.Start(Handler)
}
