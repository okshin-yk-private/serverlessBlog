// Package main provides the seed categories Lambda function.
// Requirement 8: Category Migration and Seeding
// This Lambda function seeds initial categories into the DynamoDB Categories table.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/feature/dynamodb/attributevalue"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb/types"
	"github.com/google/uuid"

	"serverless-blog/go-functions/internal/domain"
)

// DynamoDBClient defines the interface for DynamoDB operations needed by this handler.
type DynamoDBClient interface {
	PutItem(ctx context.Context, params *dynamodb.PutItemInput, optFns ...func(*dynamodb.Options)) (*dynamodb.PutItemOutput, error)
	Query(ctx context.Context, params *dynamodb.QueryInput, optFns ...func(*dynamodb.Options)) (*dynamodb.QueryOutput, error)
	TransactWriteItems(ctx context.Context, params *dynamodb.TransactWriteItemsInput, optFns ...func(*dynamodb.Options)) (*dynamodb.TransactWriteItemsOutput, error)
}

// SeedCategory represents a category to be seeded.
// Requirement 8.2: Migration script shall create specified categories with exact values.
type SeedCategory struct {
	Name      string
	Slug      string
	SortOrder int
}

// SeedHandler handles the category seeding process.
type SeedHandler struct {
	client    DynamoDBClient
	tableName string
	logger    *slog.Logger
}

// NewSeedHandler creates a new SeedHandler with the given DynamoDB client and table name.
func NewSeedHandler(client DynamoDBClient, tableName string) *SeedHandler {
	return &SeedHandler{
		client:    client,
		tableName: tableName,
		logger:    slog.Default(),
	}
}

// SeedResult represents the result of the seeding operation.
type SeedResult struct {
	Seeded  int      `json:"seeded"`
	Skipped int      `json:"skipped"`
	Message string   `json:"message"`
	Details []string `json:"details,omitempty"`
}

// HandleRequest processes the seed categories request.
// Requirement 8.1: One-time migration script to seed initial categories.
// Requirement 8.3: Idempotent operation - running multiple times shall not create duplicates.
func (h *SeedHandler) HandleRequest(ctx context.Context, event events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	h.logger.Info("Starting category seeding")

	// Requirement 8.2: Define the initial categories with exact values
	seedCategories := []SeedCategory{
		{Name: "テクノロジー", Slug: "tech", SortOrder: 1},
		{Name: "ライフスタイル", Slug: "life", SortOrder: 2},
		{Name: "ビジネス", Slug: "business", SortOrder: 3},
		{Name: "その他", Slug: "other", SortOrder: 4},
	}

	result := SeedResult{
		Seeded:  0,
		Skipped: 0,
		Details: make([]string, 0),
	}

	for _, seedCat := range seedCategories {
		// Requirement 8.3: Check slug existence before insertion
		exists, err := h.checkSlugExists(ctx, seedCat.Slug)
		if err != nil {
			h.logger.Error("Failed to check slug existence", "slug", seedCat.Slug, "error", err)
			return h.errorResponse(500, fmt.Sprintf("Failed to check slug existence: %v", err))
		}

		if exists {
			h.logger.Info("Category already exists, skipping", "slug", seedCat.Slug)
			result.Skipped++
			result.Details = append(result.Details, fmt.Sprintf("Skipped: %s (%s)", seedCat.Name, seedCat.Slug))
			continue
		}

		// Create new category
		err = h.createCategory(ctx, seedCat)
		if err != nil {
			h.logger.Error("Failed to create category", "slug", seedCat.Slug, "error", err)
			return h.errorResponse(500, fmt.Sprintf("Failed to create category: %v", err))
		}

		h.logger.Info("Category seeded successfully", "slug", seedCat.Slug, "name", seedCat.Name)
		result.Seeded++
		result.Details = append(result.Details, fmt.Sprintf("Seeded: %s (%s)", seedCat.Name, seedCat.Slug))
	}

	result.Message = fmt.Sprintf("Category seeding completed: %d seeded, %d skipped", result.Seeded, result.Skipped)
	h.logger.Info("Category seeding completed", "seeded", result.Seeded, "skipped", result.Skipped)

	return h.successResponse(200, result)
}

// checkSlugExists checks if a category with the given slug already exists.
// Requirement 8.3: Idempotency ensured by checking slug existence before insertion.
func (h *SeedHandler) checkSlugExists(ctx context.Context, slug string) (bool, error) {
	input := &dynamodb.QueryInput{
		TableName:              aws.String(h.tableName),
		IndexName:              aws.String("SlugIndex"),
		KeyConditionExpression: aws.String("slug = :slug"),
		ExpressionAttributeValues: map[string]types.AttributeValue{
			":slug": &types.AttributeValueMemberS{Value: slug},
		},
		Limit: aws.Int32(1),
	}

	output, err := h.client.Query(ctx, input)
	if err != nil {
		return false, err
	}

	return output.Count > 0, nil
}

// createCategory creates a new category in DynamoDB with slug reservation.
// Requirement 8.2: Create category with exact values.
// Requirement 8.4: Assign sortOrder values as specified.
// Uses TransactWriteItems to atomically create both the category and slug reservation item.
func (h *SeedHandler) createCategory(ctx context.Context, seedCat SeedCategory) error {
	now := time.Now().UTC().Format(time.RFC3339)
	id := uuid.New().String()

	category := domain.Category{
		ID:        id,
		Name:      seedCat.Name,
		Slug:      seedCat.Slug,
		SortOrder: seedCat.SortOrder,
		CreatedAt: now,
		UpdatedAt: now,
	}

	item, err := attributevalue.MarshalMap(category)
	if err != nil {
		return fmt.Errorf("failed to marshal category: %w", err)
	}

	// Use TransactWriteItems to atomically create category and slug reservation
	slugReservationID := "SLUG#" + seedCat.Slug
	transactInput := &dynamodb.TransactWriteItemsInput{
		TransactItems: []types.TransactWriteItem{
			{
				// Put the category item
				Put: &types.Put{
					TableName:           aws.String(h.tableName),
					Item:                item,
					ConditionExpression: aws.String("attribute_not_exists(id)"),
				},
			},
			{
				// Put slug reservation item to ensure uniqueness atomically
				Put: &types.Put{
					TableName: aws.String(h.tableName),
					Item: map[string]types.AttributeValue{
						"id":         &types.AttributeValueMemberS{Value: slugReservationID},
						"slug":       &types.AttributeValueMemberS{Value: seedCat.Slug},
						"categoryId": &types.AttributeValueMemberS{Value: id},
						"itemType":   &types.AttributeValueMemberS{Value: "SLUG_RESERVATION"},
					},
					ConditionExpression: aws.String("attribute_not_exists(id)"),
				},
			},
		},
	}

	_, err = h.client.TransactWriteItems(ctx, transactInput)
	if err != nil {
		return fmt.Errorf("failed to create category with transaction: %w", err)
	}

	return nil
}

// successResponse creates a successful HTTP response.
func (h *SeedHandler) successResponse(statusCode int, body any) (events.APIGatewayProxyResponse, error) {
	jsonBody, err := json.Marshal(body)
	if err != nil {
		return h.errorResponse(500, "Failed to marshal response")
	}

	return events.APIGatewayProxyResponse{
		StatusCode: statusCode,
		Headers: map[string]string{
			"Content-Type":                "application/json",
			"Access-Control-Allow-Origin": "*",
		},
		Body: string(jsonBody),
	}, nil
}

// errorResponse creates an error HTTP response.
func (h *SeedHandler) errorResponse(statusCode int, message string) (events.APIGatewayProxyResponse, error) {
	body := domain.ErrorResponse{Message: message}
	jsonBody, _ := json.Marshal(body)

	return events.APIGatewayProxyResponse{
		StatusCode: statusCode,
		Headers: map[string]string{
			"Content-Type":                "application/json",
			"Access-Control-Allow-Origin": "*",
		},
		Body: string(jsonBody),
	}, nil
}

// Global handler instance
var handler *SeedHandler

//nolint:gochecknoinits // Lambda requires init for handler setup
func init() {
	// Setup structured logging
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})))

	tableName := os.Getenv("CATEGORIES_TABLE_NAME")
	if tableName == "" {
		tableName = "Categories"
	}

	// Load AWS config
	cfg, err := config.LoadDefaultConfig(context.Background())
	if err != nil {
		slog.Error("Failed to load AWS config", "error", err)
		panic(err)
	}

	// Check for custom DynamoDB endpoint (LocalStack support)
	dynamoEndpoint := os.Getenv("DYNAMODB_ENDPOINT")
	var client *dynamodb.Client
	if dynamoEndpoint != "" {
		client = dynamodb.NewFromConfig(cfg, func(o *dynamodb.Options) {
			o.BaseEndpoint = aws.String(dynamoEndpoint)
		})
	} else {
		client = dynamodb.NewFromConfig(cfg)
	}

	handler = NewSeedHandler(client, tableName)
}

func main() {
	lambda.Start(handler.HandleRequest)
}
