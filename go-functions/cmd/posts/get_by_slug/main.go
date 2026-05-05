// Package main provides the GetPublicPostBySlug Lambda function for retrieving
// published posts by their friendly slug.
//
// Route: GET /posts/by-slug/{slug} (public, no-auth)
// Requirement (PR7 of writer-experience refactor): Astro-side static routing
// at `/posts/[slug]` calls this endpoint to populate JSON-LD / hero / etc.
//
// Slug uniqueness is enforced on writes (cmd/posts/create + cmd/posts/update),
// so a SlugIndex Query is expected to return at most one item. If the matched
// post is in draft status, we return 404 to avoid leaking unpublished content
// through the public endpoint.
package main

import (
	"context"
	"os"

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

// DynamoDBClientInterface defines the interface for DynamoDB operations (for testing).
type DynamoDBClientInterface interface {
	Query(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error)
}

// dynamoClientGetter returns the DynamoDB client. Overridable in tests.
var dynamoClientGetter = func() (DynamoDBClientInterface, error) {
	return clients.GetDynamoDB()
}

// slugIndexName returns the SlugIndex GSI name. Overridable via env in tests
// (e.g. SLUG_INDEX_NAME=TestSlugIndex) so the Query inputs can be asserted.
func slugIndexName() string {
	if v := os.Getenv("SLUG_INDEX_NAME"); v != "" {
		return v
	}
	return "SlugIndex"
}

// Handler handles GET /posts/by-slug/{slug} (public).
func Handler(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	slug := request.PathParameters["slug"]
	if slug == "" {
		return errorResponse(400, "slug is required")
	}

	tableName := os.Getenv("TABLE_NAME")
	if tableName == "" {
		return errorResponse(500, "server configuration error")
	}

	dynamoClient, err := dynamoClientGetter()
	if err != nil {
		return errorResponse(500, "server error")
	}

	out, err := dynamoClient.Query(ctx, &dynamodb.QueryInput{
		TableName:              &tableName,
		IndexName:              aws.String(slugIndexName()),
		KeyConditionExpression: aws.String("slug = :slug"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":slug": &types.AttributeValueMemberS{Value: slug},
		},
		Limit: aws.Int32(1),
	})
	if err != nil {
		return errorResponse(500, "failed to retrieve post")
	}

	if out.Count == 0 || len(out.Items) == 0 {
		return errorResponse(404, "post not found")
	}

	var post domain.BlogPost
	if err := attributevalue.UnmarshalMap(out.Items[0], &post); err != nil {
		return errorResponse(500, "failed to parse post data")
	}

	// Hide drafts from the public endpoint.
	if post.PublishStatus != domain.PublishStatusPublished {
		return errorResponse(404, "post not found")
	}

	return middleware.JSONResponse(200, post)
}

// errorResponse creates an error response with CORS headers.
func errorResponse(statusCode int, message string) (events.APIGatewayProxyResponse, error) {
	return middleware.JSONResponse(statusCode, domain.ErrorResponse{Message: message})
}

func main() {
	lambda.Start(Handler)
}
