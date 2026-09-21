package middleware

import (
	"context"
	"io"
	"os"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambdacontext"

	"serverless-blog/go-functions/internal/domain"
)

type loggerContextKey struct{}

// LoggerFromContext reuses the invocation logger, including its correlation IDs.
// Non-HTTP invocations fall back to the Lambda request ID and runtime trace ID.
func LoggerFromContext(ctx context.Context) Logger {
	if logger, ok := ctx.Value(loggerContextKey{}).(Logger); ok {
		return logger
	}
	return NewLoggerFromContext(ctx)
}

// WithInvocationLogger initializes logging for a non-HTTP Lambda invocation.
func WithInvocationLogger(ctx context.Context) context.Context {
	return context.WithValue(ctx, loggerContextKey{}, NewLoggerFromContext(ctx))
}

func withRequestLogger(ctx context.Context, request events.APIGatewayProxyRequest, writer io.Writer) context.Context {
	var lambdaRequestID string
	if lc, ok := lambdacontext.FromContext(ctx); ok {
		lambdaRequestID = lc.AwsRequestID
	}
	requestID := request.RequestContext.RequestID
	if requestID == "" {
		requestID = lambdaRequestID
	}
	logger := NewLoggerWithWriter(requestID, os.Getenv("_X_AMZN_TRACE_ID"), writer).With(
		"lambdaRequestId", lambdaRequestID,
		"function", os.Getenv("AWS_LAMBDA_FUNCTION_NAME"),
	)
	return context.WithValue(ctx, loggerContextKey{}, logger)
}

// HandleRequest gives each API invocation one logger and records its result.
// Request/response bodies, headers, claims, paths and query values are not logged.
func HandleRequest(ctx context.Context, request events.APIGatewayProxyRequest, handler func(context.Context, events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error)) (events.APIGatewayProxyResponse, error) {
	ctx = withRequestLogger(ctx, request, os.Stdout)
	started := time.Now()
	response, err := handler(ctx, request)
	logger := LoggerFromContext(ctx)
	if err != nil {
		logger.Error("handler failed", "error", err)
	}
	logger.Info("request completed", "statusCode", response.StatusCode, "durationMs", time.Since(started).Milliseconds())
	return response, err
}

// MessageResponse preserves the API's existing {"message": ...} error contract.
// Internal failures must use ServerError so their cause is recorded server-side.
func MessageResponse(statusCode int, message string) (events.APIGatewayProxyResponse, error) {
	return JSONResponse(statusCode, domain.ErrorResponse{Message: message})
}

// ServerError logs the original cause but only returns the supplied public message.
// message must be a fixed, client-safe string, never cause.Error().
func ServerError(ctx context.Context, message string, cause error) (events.APIGatewayProxyResponse, error) {
	LoggerFromContext(ctx).Error(message, "error", cause)
	return MessageResponse(500, message)
}
