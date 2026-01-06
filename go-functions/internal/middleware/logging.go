// Package middleware provides HTTP middleware utilities for Lambda handlers.
//
// Requirement 2.6: 構造化ログ用ミドルウェア
//   - CloudWatch Logs Insightsと互換性のある構造化ログ出力
//
// Requirement 8.1: CloudWatch Logs Insights互換のJSON構造化ログ
//   - 各Go Lambda関数は、CloudWatch Logs Insightsと互換性のある構造化JSONログを出力
//
// Requirement 8.4: エラー発生時のスタックトレースとリクエストコンテキスト
//   - エラー発生時にスタックトレースとリクエストコンテキストと共にエラーをログに記録
//
// Requirement 8.5: 相関IDの付与
//   - すべてのログエントリに相関ID（リクエストID、トレースID）を含む
//
// Requirement 12.5: 機密データのログ除外
//   - 機密データ（パスワード、トークン、PII）をログに記録しない
package middleware

import (
	"context"
	"io"
	"log/slog"
	"os"
	"strings"
	"sync"

	"github.com/aws/aws-lambda-go/lambdacontext"
)

// sensitiveFields contains field names that should be redacted in logs
var sensitiveFields = map[string]bool{
	"password":      true,
	"accesstoken":   true,
	"refreshtoken":  true,
	"idtoken":       true,
	"token":         true,
	"secret":        true,
	"authorization": true,
}

// coldStart tracks whether this is the first invocation
var (
	isColdStart    = true
	coldStartMutex sync.Mutex
)

// Logger provides structured logging with request context
type Logger interface {
	Info(msg string, args ...any)
	Error(msg string, args ...any)
	Warn(msg string, args ...any)
	Debug(msg string, args ...any)
	With(args ...any) Logger
}

// slogLogger wraps slog.Logger to implement Logger interface
type slogLogger struct {
	logger *slog.Logger
}

// NewLogger creates a new Logger with request ID and trace ID
func NewLogger(requestID, traceID string) Logger {
	return NewLoggerWithWriter(requestID, traceID, os.Stdout)
}

// NewLoggerWithWriter creates a new Logger with a custom writer (for testing)
func NewLoggerWithWriter(requestID, traceID string, w io.Writer) Logger {
	return NewLoggerWithWriterAndLevel(requestID, traceID, w, slog.LevelInfo)
}

// NewLoggerWithWriterAndLevel creates a new Logger with custom writer and log level
func NewLoggerWithWriterAndLevel(requestID, traceID string, w io.Writer, level slog.Level) Logger {
	coldStartMutex.Lock()
	coldStart := isColdStart
	isColdStart = false
	coldStartMutex.Unlock()

	opts := &slog.HandlerOptions{
		Level: level,
		ReplaceAttr: func(groups []string, a slog.Attr) slog.Attr {
			// Redact sensitive fields
			if isSensitiveField(a.Key) {
				return slog.String(a.Key, "[REDACTED]")
			}
			return a
		},
	}

	handler := slog.NewJSONHandler(w, opts)
	logger := slog.New(handler).With(
		"requestId", requestID,
		"traceId", traceID,
		"coldStart", coldStart,
	)

	return &slogLogger{logger: logger}
}

// NewLoggerWithWriterAndService creates a new Logger with service name
func NewLoggerWithWriterAndService(requestID, traceID string, w io.Writer, serviceName string) Logger {
	coldStartMutex.Lock()
	coldStart := isColdStart
	isColdStart = false
	coldStartMutex.Unlock()

	opts := &slog.HandlerOptions{
		Level: slog.LevelInfo,
		ReplaceAttr: func(groups []string, a slog.Attr) slog.Attr {
			if isSensitiveField(a.Key) {
				return slog.String(a.Key, "[REDACTED]")
			}
			return a
		},
	}

	handler := slog.NewJSONHandler(w, opts)
	logger := slog.New(handler).With(
		"requestId", requestID,
		"traceId", traceID,
		"service", serviceName,
		"coldStart", coldStart,
	)

	return &slogLogger{logger: logger}
}

// NewLoggerFromContext creates a Logger from Lambda context
func NewLoggerFromContext(ctx context.Context) Logger {
	return NewLoggerFromContextWithWriter(ctx, os.Stdout)
}

// NewLoggerFromContextWithWriter creates a Logger from Lambda context with custom writer
func NewLoggerFromContextWithWriter(ctx context.Context, w io.Writer) Logger {
	var requestID, traceID string

	// Extract request ID from Lambda context
	if lc, ok := lambdacontext.FromContext(ctx); ok {
		requestID = lc.AwsRequestID
	}

	// Extract trace ID from environment or context
	traceID = os.Getenv("_X_AMZN_TRACE_ID")

	return NewLoggerWithWriter(requestID, traceID, w)
}

// Info logs at INFO level
func (l *slogLogger) Info(msg string, args ...any) {
	l.logger.Info(msg, redactSensitiveArgs(args)...)
}

// Error logs at ERROR level
func (l *slogLogger) Error(msg string, args ...any) {
	l.logger.Error(msg, redactSensitiveArgs(args)...)
}

// Warn logs at WARN level
func (l *slogLogger) Warn(msg string, args ...any) {
	l.logger.Warn(msg, redactSensitiveArgs(args)...)
}

// Debug logs at DEBUG level
func (l *slogLogger) Debug(msg string, args ...any) {
	l.logger.Debug(msg, redactSensitiveArgs(args)...)
}

// With returns a new Logger with additional context
func (l *slogLogger) With(args ...any) Logger {
	return &slogLogger{logger: l.logger.With(redactSensitiveArgs(args)...)}
}

// isSensitiveField checks if a field name is sensitive
func isSensitiveField(key string) bool {
	loweredKey := strings.ToLower(key)
	return sensitiveFields[loweredKey]
}

// redactSensitiveArgs redacts sensitive values in log arguments
func redactSensitiveArgs(args []any) []any {
	if len(args) == 0 {
		return args
	}

	result := make([]any, len(args))
	copy(result, args)

	// Process key-value pairs
	for i := 0; i < len(result)-1; i += 2 {
		if key, ok := result[i].(string); ok {
			if isSensitiveField(key) {
				result[i+1] = "[REDACTED]"
			}
		}
	}

	return result
}

// ResetColdStartState resets the cold start tracking (for testing only)
func ResetColdStartState() {
	coldStartMutex.Lock()
	isColdStart = true
	coldStartMutex.Unlock()
}
