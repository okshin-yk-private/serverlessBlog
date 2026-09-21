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
	"errors"
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
	return middleware.HandleRequest(ctx, request, handleRequest)
}

func handleRequest(ctx context.Context, request events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	slug := request.PathParameters["slug"]
	if slug == "" {
		return middleware.MessageResponse(400, "slug is required")
	}

	tableName := os.Getenv("TABLE_NAME")
	if tableName == "" {
		return middleware.ServerError(ctx, "server configuration error", errors.New("TABLE_NAME is not configured"))
	}

	dynamoClient, err := dynamoClientGetter()
	if err != nil {
		return middleware.ServerError(ctx, "server error", err)
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
		return middleware.ServerError(ctx, "failed to retrieve post", err)
	}

	if out.Count == 0 || len(out.Items) == 0 {
		return middleware.MessageResponse(404, "post not found")
	}

	var post domain.BlogPost
	if err := attributevalue.UnmarshalMap(out.Items[0], &post); err != nil {
		return middleware.ServerError(ctx, "failed to parse post data", err)
	}

	// Hide drafts from the public endpoint.
	if post.PublishStatus != domain.PublishStatusPublished {
		return middleware.MessageResponse(404, "post not found")
	}

	return middleware.PublicJSONResponse(200, post)
}

func main() {
	lambda.Start(Handler)
}
