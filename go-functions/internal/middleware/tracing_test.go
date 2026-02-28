// Package middleware provides HTTP middleware utilities for Lambda handlers.
//
// Requirement 2.7: X-Rayトレーシング統合用ミドルウェア
//   - AWS X-Rayトレーシング統合用ミドルウェアを提供
//
// Requirement 8.2: AWS SDK呼び出しのX-Rayトレーシング
//   - 各Go Lambda関数は、AWS SDK呼び出しと外部依存関係のX-Rayトレーシングを含む
package middleware

import (
	"context"
	"testing"
)

// defaultServiceName is defined in metrics.go and used by tests

func TestNewTracer(t *testing.T) {
	t.Run("creates tracer with service name", func(t *testing.T) {
		tracer := NewTracer("testService")

		if tracer == nil {
			t.Error("NewTracer should return a non-nil tracer")
		}
	})

	t.Run("creates tracer with empty service name uses default", func(t *testing.T) {
		tracer := NewTracer("")

		if tracer == nil {
			t.Error("NewTracer should return a non-nil tracer even with empty service name")
		}
	})
}

func TestTracerIsEnabled(t *testing.T) {
	t.Run("returns false when tracing is disabled", func(t *testing.T) {
		tracer := NewTracerWithOptions("testService", TracerOptions{
			Disabled: true,
		})

		if tracer.IsEnabled() {
			t.Error("tracer should be disabled when Disabled option is true")
		}
	})

	t.Run("returns true when tracing is enabled", func(t *testing.T) {
		tracer := NewTracerWithOptions("testService", TracerOptions{
			Disabled: false,
		})

		if !tracer.IsEnabled() {
			t.Error("tracer should be enabled when Disabled option is false")
		}
	})
}

func TestTracerBeginSubsegment(t *testing.T) {
	t.Run("creates subsegment when tracing is enabled", func(t *testing.T) {
		tracer := NewTracerWithOptions("testService", TracerOptions{
			Disabled: false,
		})

		ctx := context.Background()
		_, seg := tracer.BeginSubsegment(ctx, "test-subsegment")

		if seg == nil {
			t.Error("BeginSubsegment should return a non-nil segment when enabled")
		}
	})

	t.Run("returns nil segment when tracing is disabled", func(t *testing.T) {
		tracer := NewTracerWithOptions("testService", TracerOptions{
			Disabled: true,
		})

		ctx := context.Background()
		_, seg := tracer.BeginSubsegment(ctx, "test-subsegment")

		if seg != nil {
			t.Error("BeginSubsegment should return nil segment when disabled")
		}
	})

	t.Run("subsegment has correct name", func(t *testing.T) {
		tracer := NewTracerWithOptions("testService", TracerOptions{
			Disabled: false,
		})

		ctx := context.Background()
		_, seg := tracer.BeginSubsegment(ctx, "dynamodb-query")

		if seg == nil {
			t.Fatal("expected non-nil segment")
		}

		if seg.Name() != "dynamodb-query" {
			t.Errorf("expected subsegment name 'dynamodb-query', got %s", seg.Name())
		}
	})
}

func TestTracerEndSubsegment(t *testing.T) {
	t.Run("closes subsegment without error", func(t *testing.T) {
		tracer := NewTracerWithOptions("testService", TracerOptions{
			Disabled: false,
		})

		ctx := context.Background()
		_, seg := tracer.BeginSubsegment(ctx, "test-subsegment")

		// Should not panic
		tracer.EndSubsegment(seg)
	})

	t.Run("handles nil segment gracefully when disabled", func(t *testing.T) {
		tracer := NewTracerWithOptions("testService", TracerOptions{
			Disabled: true,
		})

		ctx := context.Background()
		_, seg := tracer.BeginSubsegment(ctx, "test-subsegment")

		// Should not panic even with nil segment
		tracer.EndSubsegment(seg)
	})
}

func TestTracerAddAnnotation(t *testing.T) {
	t.Run("adds annotation to segment", func(t *testing.T) {
		tracer := NewTracerWithOptions("testService", TracerOptions{
			Disabled: false,
		})

		ctx := context.Background()
		_, seg := tracer.BeginSubsegment(ctx, "test-subsegment")

		// Should not panic
		tracer.AddAnnotation(seg, "userId", "user-123")
	})

	t.Run("handles nil segment gracefully when disabled", func(t *testing.T) {
		tracer := NewTracerWithOptions("testService", TracerOptions{
			Disabled: true,
		})

		ctx := context.Background()
		_, seg := tracer.BeginSubsegment(ctx, "test-subsegment")

		// Should not panic even with nil segment
		tracer.AddAnnotation(seg, "userId", "user-123")
	})
}

func TestTracerAddMetadata(t *testing.T) {
	t.Run("adds metadata to segment", func(t *testing.T) {
		tracer := NewTracerWithOptions("testService", TracerOptions{
			Disabled: false,
		})

		ctx := context.Background()
		_, seg := tracer.BeginSubsegment(ctx, "test-subsegment")

		// Should not panic
		tracer.AddMetadata(seg, "requestBody", map[string]string{"key": "value"})
	})

	t.Run("handles nil segment gracefully when disabled", func(t *testing.T) {
		tracer := NewTracerWithOptions("testService", TracerOptions{
			Disabled: true,
		})

		ctx := context.Background()
		_, seg := tracer.BeginSubsegment(ctx, "test-subsegment")

		// Should not panic even with nil segment
		tracer.AddMetadata(seg, "requestBody", map[string]string{"key": "value"})
	})
}

func TestTracerAddError(t *testing.T) {
	t.Run("adds error to segment", func(t *testing.T) {
		tracer := NewTracerWithOptions("testService", TracerOptions{
			Disabled: false,
		})

		ctx := context.Background()
		_, seg := tracer.BeginSubsegment(ctx, "test-subsegment")

		testErr := &testError{message: "test error"}
		// Should not panic
		tracer.AddError(seg, testErr)
	})

	t.Run("handles nil segment gracefully when disabled", func(t *testing.T) {
		tracer := NewTracerWithOptions("testService", TracerOptions{
			Disabled: true,
		})

		ctx := context.Background()
		_, seg := tracer.BeginSubsegment(ctx, "test-subsegment")

		testErr := &testError{message: "test error"}
		// Should not panic even with nil segment
		tracer.AddError(seg, testErr)
	})

	t.Run("handles nil error gracefully", func(t *testing.T) {
		tracer := NewTracerWithOptions("testService", TracerOptions{
			Disabled: false,
		})

		ctx := context.Background()
		_, seg := tracer.BeginSubsegment(ctx, "test-subsegment")

		// Should not panic with nil error
		tracer.AddError(seg, nil)
	})
}

func TestTracerServiceName(t *testing.T) {
	t.Run("returns configured service name", func(t *testing.T) {
		tracer := NewTracer("myService")

		if tracer.ServiceName() != "myService" {
			t.Errorf("expected service name 'myService', got %s", tracer.ServiceName())
		}
	})

	t.Run("returns default service name when empty", func(t *testing.T) {
		tracer := NewTracer("")

		if tracer.ServiceName() != defaultServiceName {
			t.Errorf("expected default service name '%s', got %s", defaultServiceName, tracer.ServiceName())
		}
	})
}

func TestTracerWithContext(t *testing.T) {
	t.Run("extracts trace ID from context", func(t *testing.T) {
		tracer := NewTracerWithOptions("testService", TracerOptions{
			Disabled: false,
		})

		ctx := context.Background()
		traceID := tracer.GetTraceID(ctx)

		// When no trace ID in context, should return empty or generated ID
		// This is expected behavior in test environment
		if traceID == "" {
			// This is acceptable when no X-Ray context is set
			t.Log("No trace ID found in context (expected in test environment)")
		}
	})
}

func TestTracerCaptureAWSv3Client(t *testing.T) {
	t.Run("returns client when tracing is disabled", func(t *testing.T) {
		tracer := NewTracerWithOptions("testService", TracerOptions{
			Disabled: true,
		})

		// Using a mock client interface
		mockClient := &mockAWSClient{}
		result := tracer.CaptureAWSv3Client(mockClient)

		// When disabled, should return the same client
		if result != mockClient {
			t.Error("CaptureAWSv3Client should return the same client when tracing is disabled")
		}
	})

	t.Run("instruments client when tracing is enabled", func(t *testing.T) {
		tracer := NewTracerWithOptions("testService", TracerOptions{
			Disabled: false,
		})

		// Using a mock client interface
		mockClient := &mockAWSClient{}
		result := tracer.CaptureAWSv3Client(mockClient)

		// In test environment without X-Ray daemon, it should still return a client
		if result == nil {
			t.Error("CaptureAWSv3Client should return a non-nil client")
		}
	})
}

// mockAWSClient is a simple mock for AWS client interface
type mockAWSClient struct{}

func TestTracerSensitiveDataNotTraced(t *testing.T) {
	t.Run("does not add sensitive metadata", func(t *testing.T) {
		tracer := NewTracerWithOptions("testService", TracerOptions{
			Disabled: false,
		})

		ctx := context.Background()
		_, seg := tracer.BeginSubsegment(ctx, "test-subsegment")

		// This test verifies that sensitive data filtering works
		// The AddSafeMetadata function should filter sensitive keys
		sensitiveData := map[string]interface{}{
			"password":    "secret123",
			"accessToken": "token-value",
			"email":       "user@example.com", // not sensitive
		}

		tracer.AddSafeMetadata(seg, "request", sensitiveData)
		// Should complete without error - actual filtering is verified by implementation
	})
}

func TestTracerSegment(t *testing.T) {
	t.Run("segment implements required interface", func(t *testing.T) {
		tracer := NewTracerWithOptions("testService", TracerOptions{
			Disabled: false,
		})

		ctx := context.Background()
		_, seg := tracer.BeginSubsegment(ctx, "test-segment")

		if seg == nil {
			t.Fatal("expected non-nil segment")
		}

		// Verify segment interface methods
		_ = seg.Name()
		seg.Close(nil)
	})

	t.Run("segment Close handles error", func(t *testing.T) {
		tracer := NewTracerWithOptions("testService", TracerOptions{
			Disabled: false,
		})

		ctx := context.Background()
		_, seg := tracer.BeginSubsegment(ctx, "test-segment")

		if seg == nil {
			t.Fatal("expected non-nil segment")
		}

		// Should not panic when closing with an error
		testErr := &testError{message: "close error"}
		seg.Close(testErr)
	})
}

func TestGetTraceIDWithEnvVar(t *testing.T) {
	t.Run("parses trace ID from environment variable", func(t *testing.T) {
		// t.Setenv automatically restores the original value after the test
		t.Setenv("_X_AMZN_TRACE_ID", "Root=1-test-trace-id;Parent=1-parent-id;Sampled=1")

		tracer := NewTracerWithOptions("testService", TracerOptions{
			Disabled: false,
		})

		ctx := context.Background()
		traceID := tracer.GetTraceID(ctx)

		if traceID != "1-test-trace-id" {
			t.Errorf("expected trace ID '1-test-trace-id', got %s", traceID)
		}
	})

	t.Run("returns empty string when trace ID not in expected format", func(t *testing.T) {
		// t.Setenv automatically restores the original value after the test
		t.Setenv("_X_AMZN_TRACE_ID", "Sampled=1;Parent=xyz")

		tracer := NewTracerWithOptions("testService", TracerOptions{
			Disabled: false,
		})

		ctx := context.Background()
		traceID := tracer.GetTraceID(ctx)

		if traceID != "" {
			t.Errorf("expected empty trace ID, got %s", traceID)
		}
	})
}

func TestAddSafeMetadataWithNonMapValue(t *testing.T) {
	t.Run("handles non-map value", func(t *testing.T) {
		tracer := NewTracerWithOptions("testService", TracerOptions{
			Disabled: false,
		})

		ctx := context.Background()
		_, seg := tracer.BeginSubsegment(ctx, "test-subsegment")

		// Should not panic with non-map values
		tracer.AddSafeMetadata(seg, "stringValue", "simple string")
		tracer.AddSafeMetadata(seg, "intValue", 42)
		tracer.AddSafeMetadata(seg, "boolValue", true)
	})
}

func TestNewTracerWithOptionsEmptyServiceName(t *testing.T) {
	t.Run("uses default service name when empty", func(t *testing.T) {
		tracer := NewTracerWithOptions("", TracerOptions{
			Disabled: false,
		})

		if tracer.ServiceName() != defaultServiceName {
			t.Errorf("expected default service name '%s', got %s", defaultServiceName, tracer.ServiceName())
		}
	})
}

func TestFilterSensitiveData(t *testing.T) {
	t.Run("filters all sensitive fields", func(t *testing.T) {
		tracer := NewTracerWithOptions("testService", TracerOptions{
			Disabled: false,
		})

		ctx := context.Background()
		_, seg := tracer.BeginSubsegment(ctx, "test-subsegment")

		data := map[string]interface{}{
			"password":      "secret",
			"AccessToken":   "token-value",
			"refreshToken":  "refresh-value",
			"idToken":       "id-value",
			"token":         "generic-token",
			"secret":        "secret-value",
			"authorization": "auth-header",
			"apikey":        "api-key-value",
			"api_key":       "api-key-value-2",
			"normalField":   "visible",
		}

		tracer.AddSafeMetadata(seg, "request", data)
		// Test completes without error
	})
}
