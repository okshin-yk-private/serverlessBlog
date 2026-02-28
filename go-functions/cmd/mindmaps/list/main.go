// Package main provides the ListMindmaps Lambda function for listing mindmaps (authenticated).
//
// Requirement 1.2: マインドマップ一覧取得 (GET /admin/mindmaps)
// Requirement 8.2: GET /mindmaps エンドポイント（認証必須）
//   - ページネーション対応（limit、nextToken）
//   - Cognito認証必須、全ステータスのマインドマップを返却
package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"log/slog"
	"os"
	"strconv"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"

	"serverless-blog/go-functions/internal/clients"
	"serverless-blog/go-functions/internal/domain"
	"serverless-blog/go-functions/internal/middleware"
)

// Pagination constants
const (
	DefaultLimit = 10
	MaxLimit     = 100
	MinLimit     = 1
)

// DynamoDBClientInterface defines the interface for DynamoDB operations (for testing)
type DynamoDBClientInterface interface {
	Scan(ctx context.Context, params *dynamodb.ScanInput, optFns ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error)
}

// dynamoClientGetter is a function that returns the DynamoDB client
var dynamoClientGetter = func() (DynamoDBClientInterface, error) {
	return clients.GetDynamoDB()
}

// Handler handles GET /admin/mindmaps requests
func Handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Validate authentication
	userID := extractAuthorID(request)
	if userID == "" {
		return errorResponse(401, "unauthorized")
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

	// Parse query parameters
	queryParams := request.QueryStringParameters
	if queryParams == nil {
		queryParams = map[string]string{}
	}

	limit := parseLimit(queryParams["limit"])
	exclusiveStartKey := parseNextToken(queryParams["nextToken"])

	// Build scan input (filtered by author - users only see their own mindmaps)
	scanInput := &dynamodb.ScanInput{
		TableName:        aws.String(tableName),
		Limit:            aws.Int32(limit),
		FilterExpression: aws.String("authorId = :authorId"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":authorId": &types.AttributeValueMemberS{Value: userID},
		},
	}

	if exclusiveStartKey != nil {
		scanInput.ExclusiveStartKey = exclusiveStartKey
	}

	// Execute scan
	result, err := dynamoClient.Scan(ctx, scanInput)
	if err != nil {
		return errorResponse(500, "failed to retrieve mindmaps")
	}

	// Unmarshal items
	items := make([]domain.Mindmap, 0, len(result.Items))
	for _, item := range result.Items {
		var mindmap domain.Mindmap
		if err := attributevalue.UnmarshalMap(item, &mindmap); err != nil {
			slog.Error("failed to unmarshal mindmap item", "error", err)
			return errorResponse(500, "failed to parse mindmap data")
		}
		items = append(items, mindmap)
	}

	// Generate next token
	var nextToken *string
	if result.LastEvaluatedKey != nil {
		token := generateNextToken(result.LastEvaluatedKey)
		nextToken = &token
	}

	response := domain.ListMindmapsResponse{
		Items:     items,
		Count:     len(items),
		NextToken: nextToken,
	}

	return middleware.JSONResponse(200, response)
}

// parseLimit parses and validates the limit parameter
func parseLimit(limitParam string) int32 {
	if limitParam == "" {
		return DefaultLimit
	}
	limit, err := strconv.Atoi(limitParam)
	if err != nil || limit < MinLimit || limit > MaxLimit {
		return DefaultLimit
	}
	//nolint:gosec // limit is bounded by MaxLimit (100), safe for int32
	return int32(limit)
}

// parseNextToken decodes the base64-encoded next token
func parseNextToken(nextToken string) map[string]types.AttributeValue {
	if nextToken == "" {
		return nil
	}
	decoded, err := base64.StdEncoding.DecodeString(nextToken)
	if err != nil {
		return nil
	}
	var keyMap map[string]interface{}
	if err := json.Unmarshal(decoded, &keyMap); err != nil {
		return nil
	}
	exclusiveStartKey := make(map[string]types.AttributeValue)
	for k, v := range keyMap {
		if strVal, ok := v.(string); ok {
			exclusiveStartKey[k] = &types.AttributeValueMemberS{Value: strVal}
		}
	}
	if len(exclusiveStartKey) == 0 {
		return nil
	}
	return exclusiveStartKey
}

// generateNextToken generates a base64-encoded token from LastEvaluatedKey
func generateNextToken(lastKey map[string]types.AttributeValue) string {
	keyMap := make(map[string]string)
	for k, v := range lastKey {
		if s, ok := v.(*types.AttributeValueMemberS); ok {
			keyMap[k] = s.Value
		}
	}
	jsonBytes, err := json.Marshal(keyMap)
	if err != nil {
		return ""
	}
	return base64.StdEncoding.EncodeToString(jsonBytes)
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
