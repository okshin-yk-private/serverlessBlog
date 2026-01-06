// Package main provides the ListPosts Lambda function for retrieving paginated posts.
//
// Requirement 3.4: 記事一覧取得 (GET /posts)
//   - 記事一覧リクエストを受信したとき、ListPosts Lambdaは createdAt 降順でソートされたページネーション結果を返す
//   - category クエリパラメータが提供されたとき、ListPosts LambdaはCategoryIndex GSIを使用して結果をフィルタする
//   - limit クエリパラメータが提供されたとき、ListPosts Lambdaは指定された件数に結果を制限する（デフォルト: 10、最大: 100）
//   - nextToken クエリパラメータが提供されたとき、ListPosts Lambdaは指定されたカーソルからページネーションを継続する
package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
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

// Constants for pagination
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
// This can be overridden in tests
var dynamoClientGetter = func() (DynamoDBClientInterface, error) {
	return clients.GetDynamoDB()
}

// ListPostsResponseItem represents a post item in the list response (without contentMarkdown)
type ListPostsResponseItem struct {
	ID            string   `json:"id"`
	Title         string   `json:"title"`
	ContentHTML   string   `json:"contentHtml"`
	Category      string   `json:"category"`
	Tags          []string `json:"tags"`
	PublishStatus string   `json:"publishStatus"`
	AuthorID      string   `json:"authorId"`
	CreatedAt     string   `json:"createdAt"`
	UpdatedAt     string   `json:"updatedAt"`
	PublishedAt   *string  `json:"publishedAt,omitempty"`
	ImageURLs     []string `json:"imageUrls"`
}

// ListPostsResponseBody represents the response body for list posts
type ListPostsResponseBody struct {
	Items     []ListPostsResponseItem `json:"items"`
	NextToken *string                 `json:"nextToken,omitempty"`
}

// Handler handles GET /posts requests
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

	// Parse limit with validation
	limit := parseLimit(queryParams["limit"])

	// Parse category filter
	category := queryParams["category"]

	// Parse nextToken for pagination
	exclusiveStartKey := parseNextToken(queryParams["nextToken"])

	// Build DynamoDB Query input
	queryInput := buildQueryInput(tableName, limit, category, exclusiveStartKey)

	// Execute query
	result, err := dynamoClient.Query(ctx, queryInput)
	if err != nil {
		return errorResponse(500, "failed to retrieve posts")
	}

	// Process results - exclude contentMarkdown
	items := processResults(result.Items)

	// Generate next token if there are more results
	var nextToken *string
	if result.LastEvaluatedKey != nil {
		token := generateNextToken(result.LastEvaluatedKey)
		nextToken = &token
	}

	// Build response
	response := ListPostsResponseBody{
		Items:     items,
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

	return int32(limit)
}

// parseNextToken decodes the base64-encoded next token
func parseNextToken(nextToken string) map[string]types.AttributeValue {
	if nextToken == "" {
		return nil
	}

	// Decode base64
	decoded, err := base64.StdEncoding.DecodeString(nextToken)
	if err != nil {
		return nil // Invalid token, ignore
	}

	// Parse JSON
	var keyMap map[string]interface{}
	if err := json.Unmarshal(decoded, &keyMap); err != nil {
		return nil // Invalid JSON, ignore
	}

	// Convert to DynamoDB AttributeValue
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

// buildQueryInput builds the DynamoDB Query input based on parameters
func buildQueryInput(tableName string, limit int32, category string, exclusiveStartKey map[string]types.AttributeValue) *dynamodb.QueryInput {
	queryInput := &dynamodb.QueryInput{
		TableName:        aws.String(tableName),
		Limit:            aws.Int32(limit),
		ScanIndexForward: aws.Bool(false), // Descending order by createdAt
	}

	if category != "" {
		// Use CategoryIndex with filter for publishStatus
		queryInput.IndexName = aws.String("CategoryIndex")
		queryInput.KeyConditionExpression = aws.String("category = :category")
		queryInput.FilterExpression = aws.String("publishStatus = :publishStatus")
		queryInput.ExpressionAttributeValues = map[string]types.AttributeValue{
			":category":      &types.AttributeValueMemberS{Value: category},
			":publishStatus": &types.AttributeValueMemberS{Value: domain.PublishStatusPublished},
		}
	} else {
		// Use PublishStatusIndex to get only published posts
		queryInput.IndexName = aws.String("PublishStatusIndex")
		queryInput.KeyConditionExpression = aws.String("publishStatus = :publishStatus")
		queryInput.ExpressionAttributeValues = map[string]types.AttributeValue{
			":publishStatus": &types.AttributeValueMemberS{Value: domain.PublishStatusPublished},
		}
	}

	if exclusiveStartKey != nil {
		queryInput.ExclusiveStartKey = exclusiveStartKey
	}

	return queryInput
}

// processResults converts DynamoDB items to response items (excluding contentMarkdown)
func processResults(items []map[string]types.AttributeValue) []ListPostsResponseItem {
	result := make([]ListPostsResponseItem, 0, len(items))

	for _, item := range items {
		var post domain.BlogPost
		if err := attributevalue.UnmarshalMap(item, &post); err != nil {
			continue // Skip invalid items
		}

		// Convert to response item (without contentMarkdown)
		responseItem := ListPostsResponseItem{
			ID:            post.ID,
			Title:         post.Title,
			ContentHTML:   post.ContentHTML,
			Category:      post.Category,
			Tags:          post.Tags,
			PublishStatus: post.PublishStatus,
			AuthorID:      post.AuthorID,
			CreatedAt:     post.CreatedAt,
			UpdatedAt:     post.UpdatedAt,
			PublishedAt:   post.PublishedAt,
			ImageURLs:     post.ImageURLs,
		}

		// Ensure empty arrays are not nil
		if responseItem.Tags == nil {
			responseItem.Tags = []string{}
		}
		if responseItem.ImageURLs == nil {
			responseItem.ImageURLs = []string{}
		}

		result = append(result, responseItem)
	}

	return result
}

// generateNextToken generates a base64-encoded token from LastEvaluatedKey
func generateNextToken(lastKey map[string]types.AttributeValue) string {
	// Convert to simple map
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
func errorResponse(statusCode int, message string) (events.APIGatewayProxyResponse, error) {
	return middleware.JSONResponse(statusCode, domain.ErrorResponse{Message: message})
}

func main() {
	lambda.Start(Handler)
}
