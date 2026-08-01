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
	"errors"
	"os"
	"strconv"
	"strings"
	"unicode/utf8"

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

// SearchQueryMaxLength bounds the "q" search parameter (issue #491).
// 200 runes is well beyond a realistic search phrase.
//
// An over-long query is rejected rather than ignored: silently dropping the
// filter would answer a request to narrow the list by returning every post,
// which reads as "search is broken". That differs from limit, where falling
// back to a default still honors what the caller asked for.
const SearchQueryMaxLength = 200

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
	Count     *int64                  `json:"count,omitempty"` // Total count (admin only)
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

	// Parse search query, rejecting one that exceeds the maximum length
	searchQuery, err := sanitizeSearchQuery(queryParams["q"])
	if err != nil {
		return errorResponse(400, "search query is too long")
	}

	// Parse nextToken for pagination
	exclusiveStartKey := parseNextToken(queryParams["nextToken"])

	// Parse publishStatus (defaults to "published" for backward compatibility)
	// Security: Unauthenticated users can ONLY access published posts
	publishStatus := domain.PublishStatusPublished
	if queryParams["publishStatus"] != "" {
		// Only authenticated users can query non-published posts
		if !isAuthenticated(request) {
			// Security: Force published status for unauthenticated requests
			// Ignore any publishStatus parameter from unauthenticated users
			publishStatus = domain.PublishStatusPublished
		} else {
			var parseErr error
			publishStatus, parseErr = parsePublishStatus(queryParams["publishStatus"])
			if parseErr != nil {
				return errorResponse(400, "invalid publishStatus value")
			}
		}
	}

	// Normalize the search query the same way matchesSearch/filterBySearch
	// do: a whitespace-only "q" is treated as "no search" so it takes the
	// plain single-page path below, matching filterBySearch's historical
	// behavior of returning every item unfiltered in that case.
	searchLower := strings.ToLower(strings.TrimSpace(searchQuery))

	var items []ListPostsResponseItem
	var lastEvaluatedKey map[string]types.AttributeValue

	if searchLower != "" {
		// Bug fix (issue #489): "q" previously only filtered the single
		// DynamoDB page fetched for this request, so matches on later pages
		// were invisible and a page full of non-matches came back as an
		// (incorrectly) short or empty result. executeSearchQuery walks
		// pages on the caller's behalf until it has `limit` matches, runs
		// out of data, or hits the page-walk cap - see its doc comment and
		// maxSearchPages for the exact contract.
		var searchErr error
		items, lastEvaluatedKey, searchErr = executeSearchQuery(ctx, dynamoClient, tableName, limit, category, publishStatus, searchLower, exclusiveStartKey)
		if searchErr != nil {
			return errorResponse(500, "failed to retrieve posts")
		}
	} else {
		// Build DynamoDB Query input
		queryInput := buildQueryInput(tableName, limit, category, publishStatus, exclusiveStartKey)

		// Execute query
		result, err := dynamoClient.Query(ctx, queryInput)
		if err != nil {
			return errorResponse(500, "failed to retrieve posts")
		}

		// Process results - exclude contentMarkdown
		items = processResults(result.Items)
		lastEvaluatedKey = result.LastEvaluatedKey
	}

	// Generate next token if there are more results
	var nextToken *string
	if lastEvaluatedKey != nil {
		token := generateNextToken(lastEvaluatedKey)
		nextToken = &token
	}

	// Build response
	response := ListPostsResponseBody{
		Items:     items,
		NextToken: nextToken,
	}

	// For authenticated (admin) requests, execute count query and include count in response
	if isAuthenticated(request) {
		count, err := executeCountQuery(ctx, dynamoClient, tableName, publishStatus)
		if err != nil {
			return errorResponse(500, "failed to retrieve posts")
		}
		response.Count = &count

		// This endpoint is mounted both publicly and under /admin. An
		// authenticated response can contain drafts, so it must not be
		// cacheable even though the public one is.
		return middleware.JSONResponse(200, response)
	}

	return middleware.PublicJSONResponse(200, response)
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

	//nolint:gosec // G109: limit is bounded by MaxLimit (100), safe for int32
	return int32(limit)
}

// sanitizeSearchQuery rejects a "q" parameter that exceeds SearchQueryMaxLength
// runes by returning ErrSearchQueryTooLong, which the caller turns into a 400
// response, rather than silently dropping the filter. This bounds the work
// done by matchesSearch's per-item string scan; see SearchQueryMaxLength for
// why an oversized query is rejected instead of ignored.
func sanitizeSearchQuery(q string) (string, error) {
	if utf8.RuneCountInString(q) > SearchQueryMaxLength {
		return "", ErrSearchQueryTooLong
	}
	return q, nil
}

// ErrSearchQueryTooLong is returned when the "q" parameter exceeds
// SearchQueryMaxLength runes.
var ErrSearchQueryTooLong = errors.New("search query is too long")

// ErrInvalidPublishStatus is returned when an invalid publishStatus value is provided
var ErrInvalidPublishStatus = errors.New("invalid publishStatus value")

// parsePublishStatus parses and validates the publishStatus query parameter
// Valid values: "published", "draft"
// Empty string defaults to "published" for backward compatibility
func parsePublishStatus(param string) (string, error) {
	if param == "" {
		return domain.PublishStatusPublished, nil
	}

	if param == domain.PublishStatusPublished || param == domain.PublishStatusDraft {
		return param, nil
	}

	return "", ErrInvalidPublishStatus
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
func buildQueryInput(tableName string, limit int32, category, publishStatus string, exclusiveStartKey map[string]types.AttributeValue) *dynamodb.QueryInput {
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
			":publishStatus": &types.AttributeValueMemberS{Value: publishStatus},
		}
	} else {
		// Use PublishStatusIndex to query by publishStatus
		queryInput.IndexName = aws.String("PublishStatusIndex")
		queryInput.KeyConditionExpression = aws.String("publishStatus = :publishStatus")
		queryInput.ExpressionAttributeValues = map[string]types.AttributeValue{
			":publishStatus": &types.AttributeValueMemberS{Value: publishStatus},
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

// filterBySearch filters posts by search query (title and tags)
// Performs case-insensitive partial matching on title and tags
func filterBySearch(items []ListPostsResponseItem, searchQuery string) []ListPostsResponseItem {
	if searchQuery == "" {
		return items
	}

	searchLower := strings.ToLower(strings.TrimSpace(searchQuery))
	if searchLower == "" {
		return items
	}

	filtered := make([]ListPostsResponseItem, 0)

	for i := range items {
		if matchesSearch(items[i], searchLower) {
			filtered = append(filtered, items[i])
		}
	}

	return filtered
}

// matchesSearch reports whether item's title or any tag contains searchLower
// (case-insensitive partial match). searchLower must already be lower-cased
// and trimmed by the caller (see filterBySearch and executeSearchQuery).
func matchesSearch(item ListPostsResponseItem, searchLower string) bool {
	if strings.Contains(strings.ToLower(item.Title), searchLower) {
		return true
	}
	for _, tag := range item.Tags {
		if strings.Contains(strings.ToLower(tag), searchLower) {
			return true
		}
	}
	return false
}

// maxSearchPages bounds how many DynamoDB pages executeSearchQuery will fetch
// while trying to accumulate `limit` search matches for a "q" query.
//
// Each page holds at most `limit` raw items (`limit` is itself capped at
// MaxLimit = 100), so this caps a single request at roughly
// maxSearchPages * MaxLimit = 2000 items scanned - enough to make search
// feel like it covers the whole table in ordinary use, while keeping worst
// case (a query that matches rarely or never across a huge table) well
// inside the Lambda's timeout instead of walking indefinitely.
//
// nextToken contract when the cap is reached: executeSearchQuery returns
// whatever matches it already accumulated (possibly fewer than `limit`,
// including zero) together with a non-nil cursor for the next page it would
// have fetched, as long as DynamoDB still has more data. The caller (see
// Handler) turns that cursor into nextToken exactly like the non-search
// path, so a client that keeps requesting nextToken will eventually walk
// through the whole table in maxSearchPages-sized strides. Only when
// DynamoDB itself reports no more data (LastEvaluatedKey == nil) does
// executeSearchQuery return a nil cursor.
const maxSearchPages = 20

// executeSearchQuery walks DynamoDB pages (via buildQueryInput, so it uses
// the same index/filter selection as the non-search path) applying
// matchesSearch to each item, until it has collected `limit` matches,
// DynamoDB reports no more data, or maxSearchPages pages have been fetched
// (see maxSearchPages for the exact cap and nextToken contract in each
// case). This fixes issue #489: search previously only ever looked at the
// single page already fetched for the response, so matches on later pages
// were never found and a page with too few (or zero) matches made the
// response come back short of `limit` even though more matches existed.
//
// searchLower must already be lower-cased and trimmed (non-empty) - the
// Handler only calls this when there is an active search term.
//
// When a page yields more matches than needed to fill out `limit`, the
// returned cursor is derived from the *last included* item's own key
// attributes (see exclusiveStartKeyFromItem) rather than the whole page's
// LastEvaluatedKey. Using the page boundary there would skip every
// unclaimed match later in that same page on the next request, since the
// next Query would start after the whole page instead of after the last
// item actually returned.
func executeSearchQuery(
	ctx context.Context,
	client DynamoDBClientInterface,
	tableName string,
	limit int32,
	category, publishStatus, searchLower string,
	exclusiveStartKey map[string]types.AttributeValue,
) ([]ListPostsResponseItem, map[string]types.AttributeValue, error) {
	matched := make([]ListPostsResponseItem, 0, limit)
	currentKey := exclusiveStartKey
	var resumeKey map[string]types.AttributeValue

	for page := 0; page < maxSearchPages; page++ {
		queryInput := buildQueryInput(tableName, limit, category, publishStatus, currentKey)

		result, err := client.Query(ctx, queryInput)
		if err != nil {
			return nil, nil, err
		}

		for _, rawItem := range result.Items {
			converted := processResults([]map[string]types.AttributeValue{rawItem})
			if len(converted) == 0 {
				continue // malformed item; processResults already skipped it
			}
			if !matchesSearch(converted[0], searchLower) {
				continue
			}

			matched = append(matched, converted[0])
			// Widen limit (int32, bounded by MaxLimit=100) to int rather
			// than narrowing len(matched) to int32, so this comparison
			// never needs a gosec G115 suppression for a theoretical
			// overflow that can't happen at these sizes.
			if len(matched) >= int(limit) {
				return matched, exclusiveStartKeyFromItem(rawItem, category), nil
			}
		}

		if result.LastEvaluatedKey == nil {
			// DynamoDB has no more data at all; nothing more to find.
			return matched, nil, nil
		}
		currentKey = result.LastEvaluatedKey
		resumeKey = result.LastEvaluatedKey
	}

	// maxSearchPages reached without filling `limit` or exhausting the
	// table. resumeKey is the LastEvaluatedKey of the last fully-consumed
	// page (every item on it was already checked and, if matching,
	// included), so it is a safe page-boundary cursor for the next request.
	return matched, resumeKey, nil
}

// exclusiveStartKeyFromItem builds a DynamoDB ExclusiveStartKey from a raw
// item's own key attributes, so pagination can resume immediately after that
// specific item rather than after the whole page it came from.
//
// The base table's only primary key attribute is "id" (no sort key); both
// GSIs used by this handler (CategoryIndex, PublishStatusIndex) add
// "createdAt" as their sort key, with "category" or "publishStatus"
// respectively as their partition key. Both indexes project ALL attributes,
// so every raw item already carries all of these regardless of which index
// was queried.
func exclusiveStartKeyFromItem(item map[string]types.AttributeValue, category string) map[string]types.AttributeValue {
	key := make(map[string]types.AttributeValue)

	if v, ok := item["id"]; ok {
		key["id"] = v
	}
	if v, ok := item["createdAt"]; ok {
		key["createdAt"] = v
	}
	if category != "" {
		if v, ok := item["category"]; ok {
			key["category"] = v
		}
	} else if v, ok := item["publishStatus"]; ok {
		key["publishStatus"] = v
	}

	return key
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

// isAuthenticated checks if the request has valid Cognito authorization
// This is used to differentiate between public and admin requests
func isAuthenticated(request events.APIGatewayProxyRequest) bool {
	if request.RequestContext.Authorizer == nil {
		return false
	}
	claims, ok := request.RequestContext.Authorizer["claims"]
	return ok && claims != nil
}

// executeCountQuery executes a count query on PublishStatusIndex for the given publishStatus
// This is used to get the total count of articles for admin dashboard statistics
// Uses pagination to ensure accurate count even when data exceeds 1MB per query.
func executeCountQuery(ctx context.Context, client DynamoDBClientInterface, tableName, publishStatus string) (int64, error) {
	var totalCount int64
	var lastEvaluatedKey map[string]types.AttributeValue

	for {
		queryInput := &dynamodb.QueryInput{
			TableName:              aws.String(tableName),
			IndexName:              aws.String("PublishStatusIndex"),
			KeyConditionExpression: aws.String("publishStatus = :publishStatus"),
			ExpressionAttributeValues: map[string]types.AttributeValue{
				":publishStatus": &types.AttributeValueMemberS{Value: publishStatus},
			},
			Select:            types.SelectCount,
			ExclusiveStartKey: lastEvaluatedKey,
		}

		result, err := client.Query(ctx, queryInput)
		if err != nil {
			return 0, err
		}

		totalCount += int64(result.Count)

		// Check if there are more pages
		if result.LastEvaluatedKey == nil {
			break
		}
		lastEvaluatedKey = result.LastEvaluatedKey
	}

	return totalCount, nil
}

// errorResponse creates an error response with CORS headers
func errorResponse(statusCode int, message string) (events.APIGatewayProxyResponse, error) {
	return middleware.JSONResponse(statusCode, domain.ErrorResponse{Message: message})
}

func main() {
	lambda.Start(Handler)
}
