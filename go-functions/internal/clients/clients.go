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
	"github.com/aws/aws-sdk-go-v2/service/cognitoidentityprovider"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

var (
	dynamoClient  *dynamodb.Client
	s3Client      *s3.Client
	cognitoClient *cognitoidentityprovider.Client
	presignClient *s3.PresignClient
	once          sync.Once
	initErr       error
)

// initClients initializes all AWS clients once.
// It reads region from AWS_REGION environment variable and
// supports LocalStack endpoint overrides via DYNAMODB_ENDPOINT,
// S3_ENDPOINT, and COGNITO_ENDPOINT environment variables.
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

	// Initialize Cognito client with optional endpoint override
	cognitoOpts := []func(*cognitoidentityprovider.Options){}
	if endpoint := os.Getenv("COGNITO_ENDPOINT"); endpoint != "" {
		cognitoOpts = append(cognitoOpts, func(o *cognitoidentityprovider.Options) {
			o.BaseEndpoint = aws.String(endpoint)
		})
	}
	cognitoClient = cognitoidentityprovider.NewFromConfig(cfg, cognitoOpts...)
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

// GetCognito returns the singleton Cognito Identity Provider client.
func GetCognito() (*cognitoidentityprovider.Client, error) {
	once.Do(initClients)
	if initErr != nil {
		return nil, initErr
	}
	return cognitoClient, nil
}

// GetPresignClient returns the singleton S3 Presign client for generating presigned URLs.
func GetPresignClient() (*s3.PresignClient, error) {
	once.Do(initClients)
	if initErr != nil {
		return nil, initErr
	}
	return presignClient, nil
}

// ResetForTesting resets the singleton state for testing purposes.
// This should only be used in tests.
func ResetForTesting() {
	once = sync.Once{}
	dynamoClient = nil
	s3Client = nil
	cognitoClient = nil
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
