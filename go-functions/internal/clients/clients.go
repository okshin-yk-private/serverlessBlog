// Package clients provides singleton AWS service client initialization.
// It supports thread-safe lazy initialization using sync.Once,
// environment variable configuration for region, and LocalStack endpoint overrides.
package clients

import (
	"context"
	"os"
	"sync"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/codebuild"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

var (
	dynamoClient    *dynamodb.Client
	s3Client        *s3.Client
	codebuildClient *codebuild.Client
	presignClient   *s3.PresignClient
	once            sync.Once
	initErr         error
)

// initClients initializes all AWS clients once.
// It reads region from AWS_REGION environment variable and
// supports LocalStack endpoint overrides via DYNAMODB_ENDPOINT and
// S3_ENDPOINT environment variables.
func initClients() {
	cfg, err := config.LoadDefaultConfig(context.Background())
	if err != nil {
		initErr = err
		return
	}

	// Initialize DynamoDB client with optional endpoint override
	dynamoOpts := []func(*dynamodb.Options){}
	if endpoint := os.Getenv("DYNAMODB_ENDPOINT"); endpoint != "" {
		dynamoOpts = append(dynamoOpts, func(o *dynamodb.Options) {
			o.BaseEndpoint = aws.String(endpoint)
		})
	}
	dynamoClient = dynamodb.NewFromConfig(cfg, dynamoOpts...)

	// Initialize S3 client with optional endpoint override
	s3Opts := []func(*s3.Options){}
	if endpoint := os.Getenv("S3_ENDPOINT"); endpoint != "" {
		s3Opts = append(s3Opts, func(o *s3.Options) {
			o.BaseEndpoint = aws.String(endpoint)
			o.UsePathStyle = true // Required for LocalStack
		})
	}
	s3Client = s3.NewFromConfig(cfg, s3Opts...)

	// Initialize S3 Presign client
	presignClient = s3.NewPresignClient(s3Client)

	// Initialize CodeBuild client with optional endpoint override
	codebuildOpts := []func(*codebuild.Options){}
	if endpoint := os.Getenv("CODEBUILD_ENDPOINT"); endpoint != "" {
		codebuildOpts = append(codebuildOpts, func(o *codebuild.Options) {
			o.BaseEndpoint = aws.String(endpoint)
		})
	}
	codebuildClient = codebuild.NewFromConfig(cfg, codebuildOpts...)
}

// GetDynamoDB returns the singleton DynamoDB client.
func GetDynamoDB() (*dynamodb.Client, error) {
	once.Do(initClients)
	if initErr != nil {
		return nil, initErr
	}
	return dynamoClient, nil
}

// GetS3 returns the singleton S3 client.
func GetS3() (*s3.Client, error) {
	once.Do(initClients)
	if initErr != nil {
		return nil, initErr
	}
	return s3Client, nil
}

// GetPresignClient returns the singleton S3 Presign client for generating presigned URLs.
func GetPresignClient() (*s3.PresignClient, error) {
	once.Do(initClients)
	if initErr != nil {
		return nil, initErr
	}
	return presignClient, nil
}

// GetCodeBuild returns the singleton CodeBuild client.
func GetCodeBuild() (*codebuild.Client, error) {
	once.Do(initClients)
	if initErr != nil {
		return nil, initErr
	}
	return codebuildClient, nil
}

// ResetForTesting resets the singleton state for testing purposes.
// This should only be used in tests.
func ResetForTesting() {
	once = sync.Once{}
	dynamoClient = nil
	s3Client = nil
	codebuildClient = nil
	presignClient = nil
	initErr = nil
}

// SetInitErrorForTesting sets an initialization error for testing error paths.
// This should only be used in tests.
func SetInitErrorForTesting(err error) {
	once.Do(func() {
		initErr = err
	})
}
