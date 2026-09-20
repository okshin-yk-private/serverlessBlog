package middleware

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"os"
	"strings"
	"testing"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambdacontext"
)

func TestRequestLoggerCorrelationAndIsolation(t *testing.T) {
	t.Setenv("_X_AMZN_TRACE_ID", "trusted-runtime-trace")
	t.Setenv("AWS_LAMBDA_FUNCTION_NAME", "posts-list")
	ResetColdStartState()
	base := lambdacontext.NewContext(context.Background(), &lambdacontext.LambdaContext{AwsRequestID: "lambda-1"})
	for i, requestID := range []string{"gateway-1", "gateway-2", ""} {
		var output bytes.Buffer
		request := events.APIGatewayProxyRequest{
			RequestContext: events.APIGatewayProxyRequestContext{RequestID: requestID},
			Headers:        map[string]string{"X-Amzn-Trace-Id": "untrusted-client-trace"},
		}
		ctx := withRequestLogger(base, request, &output)
		if LoggerFromContext(ctx) != LoggerFromContext(ctx) {
			t.Fatal("request must reuse one logger")
		}
		LoggerFromContext(ctx).Info("check correlation")
		var entry map[string]any
		if err := json.Unmarshal(output.Bytes(), &entry); err != nil {
			t.Fatal(err)
		}
		want := requestID
		if want == "" {
			want = "lambda-1"
		}
		if entry["requestId"] != want || entry["lambdaRequestId"] != "lambda-1" || entry["traceId"] != "trusted-runtime-trace" || entry["function"] != "posts-list" || entry["coldStart"] != (i == 0) {
			t.Fatalf("incorrect invocation context: %+v", entry)
		}
	}
}

func TestServerErrorKeepsCauseOutOfResponse(t *testing.T) {
	var output bytes.Buffer
	ctx := withRequestLogger(context.Background(), events.APIGatewayProxyRequest{}, &output)
	response, err := ServerError(ctx, "failed to retrieve posts", errors.New("database endpoint private.internal: denied\nFORGED"))
	if err != nil || response.StatusCode != 500 || response.Body != `{"message":"failed to retrieve posts"}` || response.Headers["Cache-Control"] != "no-store" {
		t.Fatalf("changed public error contract: %+v, %v", response, err)
	}
	var entry map[string]any
	if err := json.Unmarshal(output.Bytes(), &entry); err != nil {
		t.Fatal(err)
	}
	if entry["error"] != "database endpoint private.internal: denied\nFORGED" || strings.Count(output.String(), "\n") != 1 {
		t.Fatalf("cause must remain in one JSON event: %s", output.String())
	}
}

func TestHandleRequestLogsReturnedErrorAndCompletion(t *testing.T) {
	readLogs := captureLogs(t)
	cause := errors.New("unsupported response value")
	response, err := HandleRequest(context.Background(), events.APIGatewayProxyRequest{}, func(context.Context, events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
		return events.APIGatewayProxyResponse{StatusCode: 500, Body: `{"message":"server error"}`}, cause
	})
	if !errors.Is(err, cause) || response.StatusCode != 500 {
		t.Fatalf("handler result changed: %+v, %v", response, err)
	}
	entries := readLogs()
	if len(entries) != 2 || entries[0]["error"] != cause.Error() || entries[1]["statusCode"] != float64(500) {
		t.Fatalf("missing error/completion: %+v", entries)
	}
}

func TestRequestLoggingRedactsStructuredSecrets(t *testing.T) {
	var output bytes.Buffer
	ctx := withRequestLogger(context.Background(), events.APIGatewayProxyRequest{}, &output)
	LoggerFromContext(ctx).With("password", "private-password").Error("failure",
		"accessToken", "private-access", "refreshToken", "private-refresh",
		slog.Group("credentials", slog.String("Authorization", "private-bearer")),
	)
	if strings.Contains(output.String(), "private-") || strings.Count(output.String(), "[REDACTED]") != 4 {
		t.Fatalf("secrets were not redacted: %s", output.String())
	}
}

func TestInvocationLoggerAndFallback(t *testing.T) {
	readLogs := captureLogs(t)
	base := lambdacontext.NewContext(context.Background(), &lambdacontext.LambdaContext{AwsRequestID: "event-invocation"})
	ctx := WithInvocationLogger(base)
	LoggerFromContext(ctx).Info("event")
	LoggerFromContext(base).Info("fallback")
	for _, entry := range readLogs() {
		if entry["requestId"] != "event-invocation" {
			t.Fatalf("missing Lambda correlation: %+v", entry)
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
