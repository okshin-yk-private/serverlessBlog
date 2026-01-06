// Package middleware provides HTTP middleware utilities for Lambda handlers.
package middleware

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"strings"
	"testing"

	"github.com/aws/aws-lambda-go/lambdacontext"
)

// Test log entry structure
type logEntry struct {
	Level     string `json:"level"`
	Message   string `json:"msg"`
	RequestID string `json:"requestId,omitempty"`
	TraceID   string `json:"traceId,omitempty"`
	Service   string `json:"service,omitempty"`
	// Additional fields can be present
}

func TestNewLogger(t *testing.T) {
	t.Run("creates logger with request ID and trace ID", func(t *testing.T) {
		var buf bytes.Buffer
		logger := NewLoggerWithWriter("test-request-123", "1-abc-def", &buf)

		logger.Info("test message")

		var entry logEntry
		if err := json.Unmarshal(buf.Bytes(), &entry); err != nil {
			t.Fatalf("failed to parse log entry: %v\nlog content: %s", err, buf.String())
		}

		if entry.Level != "INFO" {
			t.Errorf("expected level INFO, got %s", entry.Level)
		}
		if entry.Message != "test message" {
			t.Errorf("expected message 'test message', got %s", entry.Message)
		}
		if entry.RequestID != "test-request-123" {
			t.Errorf("expected requestId 'test-request-123', got %s", entry.RequestID)
		}
		if entry.TraceID != "1-abc-def" {
			t.Errorf("expected traceId '1-abc-def', got %s", entry.TraceID)
		}
	})

	t.Run("creates logger with service name", func(t *testing.T) {
		var buf bytes.Buffer
		logger := NewLoggerWithWriterAndService("req-456", "trace-789", &buf, "loginService")

		logger.Info("service test")

		var entry logEntry
		if err := json.Unmarshal(buf.Bytes(), &entry); err != nil {
			t.Fatalf("failed to parse log entry: %v", err)
		}

		if entry.Service != "loginService" {
			t.Errorf("expected service 'loginService', got %s", entry.Service)
		}
	})
}

func TestLoggerWith(t *testing.T) {
	t.Run("adds additional fields to log entry", func(t *testing.T) {
		var buf bytes.Buffer
		logger := NewLoggerWithWriter("req-123", "trace-456", &buf)

		childLogger := logger.With("userId", "user-abc", "action", "login")
		childLogger.Info("user action")

		// Parse log to verify additional fields
		var raw map[string]interface{}
		if err := json.Unmarshal(buf.Bytes(), &raw); err != nil {
			t.Fatalf("failed to parse log entry: %v", err)
		}

		if raw["userId"] != "user-abc" {
			t.Errorf("expected userId 'user-abc', got %v", raw["userId"])
		}
		if raw["action"] != "login" {
			t.Errorf("expected action 'login', got %v", raw["action"])
		}
	})
}

func TestLoggerLevels(t *testing.T) {
	tests := []struct {
		name          string
		logFunc       func(logger Logger, msg string, args ...any)
		expectedLevel string
	}{
		{
			name:          "Info level",
			logFunc:       func(l Logger, msg string, args ...any) { l.Info(msg, args...) },
			expectedLevel: "INFO",
		},
		{
			name:          "Error level",
			logFunc:       func(l Logger, msg string, args ...any) { l.Error(msg, args...) },
			expectedLevel: "ERROR",
		},
		{
			name:          "Warn level",
			logFunc:       func(l Logger, msg string, args ...any) { l.Warn(msg, args...) },
			expectedLevel: "WARN",
		},
		{
			name:          "Debug level",
			logFunc:       func(l Logger, msg string, args ...any) { l.Debug(msg, args...) },
			expectedLevel: "DEBUG",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var buf bytes.Buffer
			// Create logger with debug level enabled
			logger := NewLoggerWithWriterAndLevel("req", "trace", &buf, slog.LevelDebug)
			tt.logFunc(logger, "test")

			var entry logEntry
			if err := json.Unmarshal(buf.Bytes(), &entry); err != nil {
				t.Fatalf("failed to parse log entry: %v", err)
			}

			if entry.Level != tt.expectedLevel {
				t.Errorf("expected level %s, got %s", tt.expectedLevel, entry.Level)
			}
		})
	}
}

func TestLoggerDoesNotLogSensitiveData(t *testing.T) {
	t.Run("does not log password field", func(t *testing.T) {
		var buf bytes.Buffer
		logger := NewLoggerWithWriter("req", "trace", &buf)

		// Attempt to log sensitive data
		logger.Info("auth attempt", "password", "secret123", "email", "user@example.com")

		output := buf.String()
		if strings.Contains(output, "secret123") {
			t.Error("password value should be redacted")
		}
		if strings.Contains(output, "password") && strings.Contains(output, "secret123") {
			t.Error("password value should not appear in logs")
		}
	})

	t.Run("does not log token field", func(t *testing.T) {
		var buf bytes.Buffer
		logger := NewLoggerWithWriter("req", "trace", &buf)

		logger.Info("token refresh", "accessToken", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxx")

		output := buf.String()
		if strings.Contains(output, "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9") {
			t.Error("token value should be redacted")
		}
	})

	t.Run("does not log refreshToken field", func(t *testing.T) {
		var buf bytes.Buffer
		logger := NewLoggerWithWriter("req", "trace", &buf)

		logger.Info("token data", "refreshToken", "secret-refresh-token-value")

		output := buf.String()
		if strings.Contains(output, "secret-refresh-token-value") {
			t.Error("refreshToken value should be redacted")
		}
	})

	t.Run("does not log idToken field", func(t *testing.T) {
		var buf bytes.Buffer
		logger := NewLoggerWithWriter("req", "trace", &buf)

		logger.Info("id token data", "idToken", "id-token-secret-value")

		output := buf.String()
		if strings.Contains(output, "id-token-secret-value") {
			t.Error("idToken value should be redacted")
		}
	})
}

func TestNewLoggerFromContext(t *testing.T) {
	t.Run("extracts request ID from Lambda context", func(t *testing.T) {
		var buf bytes.Buffer

		// Create Lambda context
		lc := &lambdacontext.LambdaContext{
			AwsRequestID: "lambda-req-789",
		}
		ctx := lambdacontext.NewContext(context.Background(), lc)

		logger := NewLoggerFromContextWithWriter(ctx, &buf)
		logger.Info("context test")

		var entry logEntry
		if err := json.Unmarshal(buf.Bytes(), &entry); err != nil {
			t.Fatalf("failed to parse log entry: %v", err)
		}

		if entry.RequestID != "lambda-req-789" {
			t.Errorf("expected requestId 'lambda-req-789', got %s", entry.RequestID)
		}
	})

	t.Run("uses empty request ID when Lambda context not available", func(t *testing.T) {
		var buf bytes.Buffer
		ctx := context.Background()

		logger := NewLoggerFromContextWithWriter(ctx, &buf)
		logger.Info("no context test")

		var entry logEntry
		if err := json.Unmarshal(buf.Bytes(), &entry); err != nil {
			t.Fatalf("failed to parse log entry: %v", err)
		}

		// Should still work without Lambda context
		if entry.Message != "no context test" {
			t.Errorf("expected message 'no context test', got %s", entry.Message)
		}
	})
}

func TestLoggerErrorWithStackTrace(t *testing.T) {
	t.Run("includes error details in log", func(t *testing.T) {
		var buf bytes.Buffer
		logger := NewLoggerWithWriter("req", "trace", &buf)

		testErr := &testError{message: "something went wrong"}
		logger.Error("operation failed", "error", testErr)

		output := buf.String()
		if !strings.Contains(output, "something went wrong") {
			t.Error("error message should be included in log")
		}
	})
}

// testError is a simple error type for testing
type testError struct {
	message string
}

func (e *testError) Error() string {
	return e.message
}

func TestLoggerJSONFormat(t *testing.T) {
	t.Run("outputs valid JSON", func(t *testing.T) {
		var buf bytes.Buffer
		logger := NewLoggerWithWriter("req", "trace", &buf)

		logger.Info("json test", "key1", "value1", "key2", 123)

		var raw map[string]interface{}
		if err := json.Unmarshal(buf.Bytes(), &raw); err != nil {
			t.Fatalf("output should be valid JSON: %v\noutput: %s", err, buf.String())
		}

		// Verify structure
		if _, ok := raw["time"]; !ok {
			t.Error("log entry should have 'time' field")
		}
		if _, ok := raw["level"]; !ok {
			t.Error("log entry should have 'level' field")
		}
		if _, ok := raw["msg"]; !ok {
			t.Error("log entry should have 'msg' field")
		}
	})

	t.Run("CloudWatch Logs Insights compatible", func(t *testing.T) {
		var buf bytes.Buffer
		logger := NewLoggerWithWriter("req-123", "trace-456", &buf)

		logger.Info("cloudwatch test")

		var raw map[string]interface{}
		if err := json.Unmarshal(buf.Bytes(), &raw); err != nil {
			t.Fatalf("failed to parse log: %v", err)
		}

		// CloudWatch Logs Insights expects these fields to be queryable
		if raw["requestId"] != "req-123" {
			t.Error("requestId should be at root level for CloudWatch Logs Insights")
		}
		if raw["traceId"] != "trace-456" {
			t.Error("traceId should be at root level for CloudWatch Logs Insights")
		}
	})
}

func TestLoggerColdStartTracking(t *testing.T) {
	t.Run("marks cold start on first invocation", func(t *testing.T) {
		// Reset cold start state
		ResetColdStartState()

		var buf bytes.Buffer
		logger := NewLoggerWithWriter("req-1", "trace-1", &buf)
		logger.Info("first invocation")

		var raw map[string]interface{}
		if err := json.Unmarshal(buf.Bytes(), &raw); err != nil {
			t.Fatalf("failed to parse log: %v", err)
		}

		if raw["coldStart"] != true {
			t.Errorf("first invocation should have coldStart=true, got %v", raw["coldStart"])
		}
	})

	t.Run("does not mark cold start on subsequent invocations", func(t *testing.T) {
		// First invocation already happened
		var buf bytes.Buffer
		logger := NewLoggerWithWriter("req-2", "trace-2", &buf)
		logger.Info("second invocation")

		var raw map[string]interface{}
		if err := json.Unmarshal(buf.Bytes(), &raw); err != nil {
			t.Fatalf("failed to parse log: %v", err)
		}

		if raw["coldStart"] != false {
			t.Errorf("subsequent invocations should have coldStart=false, got %v", raw["coldStart"])
		}
	})
}

func TestNewLoggerConvenience(t *testing.T) {
	t.Run("NewLogger writes to stdout", func(t *testing.T) {
		// Reset cold start for consistent behavior
		ResetColdStartState()

		// Just verify it doesn't panic and returns a logger
		logger := NewLogger("req-test", "trace-test")
		if logger == nil {
			t.Error("NewLogger should return a non-nil logger")
		}
	})

	t.Run("NewLoggerFromContext writes to stdout", func(t *testing.T) {
		// Reset cold start for consistent behavior
		ResetColdStartState()

		ctx := context.Background()
		logger := NewLoggerFromContext(ctx)
		if logger == nil {
			t.Error("NewLoggerFromContext should return a non-nil logger")
		}
	})
}

func TestReplaceAttrForSensitiveFields(t *testing.T) {
	t.Run("replaces sensitive fields in ReplaceAttr callback", func(t *testing.T) {
		var buf bytes.Buffer
		ResetColdStartState()

		logger := NewLoggerWithWriterAndService("req", "trace", &buf, "testService")
		// Log with a sensitive field key that goes through ReplaceAttr
		logger.Info("test", "password", "should-be-redacted")

		output := buf.String()
		if strings.Contains(output, "should-be-redacted") {
			t.Error("sensitive value should be redacted via ReplaceAttr")
		}
	})
}
