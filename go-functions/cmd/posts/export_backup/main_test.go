package main

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"testing"

	"github.com/aws/aws-lambda-go/lambdacontext"
	"github.com/aws/aws-sdk-go-v2/service/dynamodb"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"serverless-blog/go-functions/internal/contentbackup"
)

type emptyDynamoDB struct{}

func (emptyDynamoDB) Scan(context.Context, *dynamodb.ScanInput, ...func(*dynamodb.Options)) (*dynamodb.ScanOutput, error) {
	return &dynamodb.ScanOutput{}, nil
}

type recordingS3 struct{ keys []string }

func (r *recordingS3) PutObject(_ context.Context, in *s3.PutObjectInput, _ ...func(*s3.Options)) (*s3.PutObjectOutput, error) {
	r.keys = append(r.keys, *in.Key)
	return &s3.PutObjectOutput{}, nil
}

func preserveClientGetters(t *testing.T) {
	t.Helper()
	originalDynamo := dynamoClientGetter
	originalS3 := s3ClientGetter
	t.Cleanup(func() {
		dynamoClientGetter = originalDynamo
		s3ClientGetter = originalS3
	})
}

func setConfiguredEnv(t *testing.T) {
	t.Helper()
	t.Setenv("TABLE_NAME", "posts")
	t.Setenv("CATEGORIES_TABLE_NAME", "categories")
	t.Setenv("BACKUP_BUCKET_NAME", "backup")
	t.Setenv("BACKUP_BUCKET_REGION", "ap-northeast-3")
}

func TestHandlerRejectsMissingConfiguration(t *testing.T) {
	for _, name := range []string{"TABLE_NAME", "CATEGORIES_TABLE_NAME", "BACKUP_BUCKET_NAME", "BACKUP_BUCKET_REGION"} {
		t.Run(name, func(t *testing.T) {
			preserveClientGetters(t)
			setConfiguredEnv(t)
			t.Setenv(name, "")
			if err := Handler(context.Background()); err == nil {
				t.Fatal("expected configuration error")
			}
		})
	}
}

func TestHandlerBuildsS3ClientForBackupRegion(t *testing.T) {
	preserveClientGetters(t)
	setConfiguredEnv(t)
	recorder := &recordingS3{}
	var gotRegion string
	dynamoClientGetter = func() (dynamodb.ScanAPIClient, error) { return emptyDynamoDB{}, nil }
	s3ClientGetter = func(_ context.Context, region string) (contentbackup.ObjectPutter, error) {
		gotRegion = region
		return recorder, nil
	}
	if err := Handler(context.Background()); err != nil {
		t.Fatalf("Handler returned error: %v", err)
	}
	if gotRegion != "ap-northeast-3" {
		t.Errorf("S3 client region = %q, want the backup region", gotRegion)
	}
	if len(recorder.keys) != 2 || !strings.HasSuffix(recorder.keys[1], "/manifest.json") {
		t.Errorf("an empty table must still produce categories.json and a manifest: %v", recorder.keys)
	}
}

func TestHandlerLogsFailureAndKeepsErrorForRetry(t *testing.T) {
	preserveClientGetters(t)
	setConfiguredEnv(t)
	readLogs := captureLogs(t)
	cause := errors.New("dynamodb unavailable")
	dynamoClientGetter = func() (dynamodb.ScanAPIClient, error) { return nil, cause }
	ctx := lambdacontext.NewContext(context.Background(), &lambdacontext.LambdaContext{AwsRequestID: "backup-request"})
	if err := Handler(ctx); !errors.Is(err, cause) {
		t.Fatalf("must return the failure so Lambda retries: %v", err)
	}
	entries := readLogs()
	if len(entries) != 1 || entries[0]["level"] != "ERROR" || entries[0]["requestId"] != "backup-request" {
		t.Fatalf("missing correlated failure log: %+v", entries)
	}
}

// captureLogs redirects stdout for this non-parallel test and parses JSON events.
func captureLogs(t *testing.T) func() []map[string]any {
	t.Helper()
	output, err := os.CreateTemp(t.TempDir(), "logs")
	if err != nil {
		t.Fatal(err)
	}
	original := os.Stdout
	os.Stdout = output
	t.Cleanup(func() { os.Stdout = original; _ = output.Close() })
	return func() []map[string]any {
		t.Helper()
		raw, err := os.ReadFile(output.Name())
		if err != nil {
			t.Fatal(err)
		}
		var entries []map[string]any
		for _, line := range strings.Split(strings.TrimSpace(string(raw)), "\n") {
			if line == "" {
				continue
			}
			var entry map[string]any
			if err := json.Unmarshal([]byte(line), &entry); err != nil {
				t.Fatalf("log line is not JSON: %q", line)
			}
			entries = append(entries, entry)
		}
		return entries
	}
}
