// Package main provides the ListPublicMindmaps Lambda function for listing published mindmaps.
//
// Requirement 8.6: GET /public/mindmaps エンドポイント（認証不要）
//   - PublishStatusIndex GSIでpublishStatus=publishedをクエリ
//   - ページネーション対応（limit、nextToken）
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
	Query(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error)
}

// dynamoClientGetter is a function that returns the DynamoDB client
var dynamoClientGetter = func() (DynamoDBClientInterface, error) {
	return clients.GetDynamoDB()
}

// Handler handles GET /public/mindmaps requests (no auth required)
func Handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
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

	// Query PublishStatusIndex for published mindmaps
	queryInput := &dynamodb.QueryInput{
		TableName:              aws.String(tableName),
		IndexName:              aws.String("PublishStatusIndex"),
		KeyConditionExpression: aws.String("publishStatus = :publishStatus"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":publishStatus": &types.AttributeValueMemberS{Value: domain.PublishStatusPublished},
		},
		Limit:            aws.Int32(limit),
		ScanIndexForward: aws.Bool(false), // Descending by createdAt
	}

	if exclusiveStartKey != nil {
		queryInput.ExclusiveStartKey = exclusiveStartKey
	}

	result, err := dynamoClient.Query(ctx, queryInput)
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

// errorResponse creates an error response with CORS headers
//
//nolint:unparam // statusCode is always 500 for this public endpoint (no auth/404 errors)
func errorResponse(statusCode int, message string) (events.APIGatewayProxyResponse, error) {
	return middleware.JSONResponse(statusCode, domain.ErrorResponse{Message: message})
}

func main() {
	lambda.Start(Handler)
}
