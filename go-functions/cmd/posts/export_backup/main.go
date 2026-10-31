// Package main exports posts and categories as a Markdown snapshot to the
// cross-region backup bucket. It is invoked once a day by EventBridge Scheduler.
package main

import (
	"context"
	"errors"
	"fmt"
	"os"

	"github.com/aws/aws-lambda-go/lambda"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"serverless-blog/go-functions/internal/clients"
	"serverless-blog/go-functions/internal/contentbackup"
	"serverless-blog/go-functions/internal/middleware"
)

var dynamoClientGetter = func() (dynamodb.ScanAPIClient, error) { return clients.GetDynamoDB() }

// The shared S3 client is bound to the Lambda's own region; the backup bucket
// lives in another region, so this client is built for that region instead.
var s3ClientGetter = func(ctx context.Context, region string) (contentbackup.ObjectPutter, error) {
	cfg, err := config.LoadDefaultConfig(ctx, config.WithRegion(region))
	if err != nil {
		return nil, err
	}
	return s3.NewFromConfig(cfg), nil
}

// Handler ignores the scheduler payload; everything it needs comes from the
// environment.
func Handler(ctx context.Context) (err error) {
	ctx = middleware.WithInvocationLogger(ctx)
	logger := middleware.LoggerFromContext(ctx)
	defer func() {
		if err != nil {
			logger.Error("content backup failed", "error", err)
		}
	}()

	cfg := contentbackup.Config{
		PostsTableName:      os.Getenv("TABLE_NAME"),
		CategoriesTableName: os.Getenv("CATEGORIES_TABLE_NAME"),
		BucketName:          os.Getenv("BACKUP_BUCKET_NAME"),
	}
	region := os.Getenv("BACKUP_BUCKET_REGION")
	if cfg.PostsTableName == "" || cfg.CategoriesTableName == "" || cfg.BucketName == "" || region == "" {
		return errors.New("content backup is not configured")
	}

	dynamoClient, err := dynamoClientGetter()
	if err != nil {
		return fmt.Errorf("get DynamoDB client: %w", err)
	}
	s3Client, err := s3ClientGetter(ctx, region)
	if err != nil {
		return fmt.Errorf("get S3 client: %w", err)
	}

	manifest, err := (&contentbackup.Exporter{DynamoDB: dynamoClient, S3: s3Client, Config: cfg}).Run(ctx)
	if err != nil {
		return err
	}
	logger.Info("content backup completed",
		"prefix", manifest.Prefix,
		"postCount", manifest.PostCount,
		"draftCount", manifest.DraftCount,
		"categoryCount", manifest.CategoryCount,
	)
	return nil
}

func main() {
	lambda.Start(Handler)
}
