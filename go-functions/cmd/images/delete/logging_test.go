package main

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"testing"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambdacontext"
)

func TestHandler_InternalFailureLogsCauseAndCorrelation(t *testing.T) {
	t.Setenv("BUCKET_NAME", "images")
	original := s3ClientGetter
	t.Cleanup(func() { s3ClientGetter = original })
	const cause = "private dependency endpoint unavailable"
	s3ClientGetter = func() (S3ClientInterface, error) { return nil, errors.New(cause) }
	request := events.APIGatewayProxyRequest{
		PathParameters: map[string]string{"key": "user-id/test.png"},
		RequestContext: events.APIGatewayProxyRequestContext{
			Authorizer: map[string]interface{}{"claims": map[string]interface{}{"sub": "user-id", "cognito:groups": "admin"}},
		},
	}
	readLogs := captureLogs(t)
	t.Setenv("_X_AMZN_TRACE_ID", "runtime-trace")
	request.RequestContext.RequestID = "api-request"
	request.Headers = map[string]string{"Authorization": "Bearer private-token"}
	ctx := lambdacontext.NewContext(context.Background(), &lambdacontext.LambdaContext{AwsRequestID: "lambda-request"})
	response, err := Handler(ctx, request)
	if err != nil || response.StatusCode != 500 || response.Body != `{"message":"server error"}` || response.Headers["Cache-Control"] != "no-store" {
		t.Fatalf("expected private, uncached 500, got %+v, %v", response, err)
	}
	entries := readLogs()
	if len(entries) != 2 || entries[0]["level"] != "ERROR" || entries[0]["error"] != cause || entries[1]["statusCode"] != float64(500) {
		t.Fatalf("expected original cause once and completion: %+v", entries)
	}
	for _, entry := range entries {
		if entry["requestId"] != "api-request" || entry["lambdaRequestId"] != "lambda-request" || entry["traceId"] != "runtime-trace" {
			t.Fatalf("missing invocation correlation: %+v", entry)
		}
		raw, _ := json.Marshal(entry)
		for _, secret := range []string{"private-token", "private-password", "private@example.com", "private-refresh"} {
			if strings.Contains(string(raw), secret) {
				t.Fatalf("request data leaked: %s", raw)
			}
		}
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
				t.Fatalf("invalid JSON log: %s: %v", line, err)
			}
			entries = append(entries, entry)
		}
		return entries
	}
}
