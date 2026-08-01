// Package middleware provides HTTP middleware utilities for Lambda handlers.
package middleware

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/aws/aws-lambda-go/events"
)

// PublicCacheMaxAgeSeconds is how long a response to an anonymous read may be
// reused. It is deliberately short: publishing a post triggers a site rebuild
// and a CloudFront invalidation, and a minute of staleness on the API is well
// inside the time that pipeline takes.
const PublicCacheMaxAgeSeconds = 60

// CORSHeaders returns standard CORS headers.
// The Access-Control-Allow-Origin value is read from the ALLOWED_ORIGIN
// environment variable. If not set, it falls back to "*" for local development.
func CORSHeaders() map[string]string {
	origin := os.Getenv("ALLOWED_ORIGIN")
	if origin == "" {
		origin = "*"
	}
	return map[string]string{
		"Access-Control-Allow-Origin":  origin,
		"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization",
		"Content-Type":                 "application/json",
		"X-Content-Type-Options":       "nosniff",
		"X-Frame-Options":              "DENY",
		"Cache-Control":                "no-store",
	}
}

// PublicCacheHeaders returns the standard headers with a short shared-cache
// window instead of no-store.
//
// Only use this for responses that contain nothing but published content
// served to an anonymous caller. no-store stays the default in CORSHeaders so
// that anything not explicitly opted in — admin reads, drafts, tokens —
// cannot be cached by omission.
func PublicCacheHeaders() map[string]string {
	headers := CORSHeaders()
	headers["Cache-Control"] = fmt.Sprintf("public, max-age=%d", PublicCacheMaxAgeSeconds)
	return headers
}

// PublicJSONResponse creates a JSON response that a shared cache may reuse for
// PublicCacheMaxAgeSeconds. See PublicCacheHeaders for when this is allowed.
func PublicJSONResponse(statusCode int, body interface{}) (events.APIGatewayProxyResponse, error) {
	response, err := JSONResponse(statusCode, body)
	if err != nil {
		// Marshaling failed, so the body is an error payload: leave it uncached.
		return response, err
	}

	response.Headers = PublicCacheHeaders()
	return response, nil
}

// JSONResponse creates a JSON response with CORS headers.
func JSONResponse(statusCode int, body interface{}) (events.APIGatewayProxyResponse, error) {
	jsonBody, err := json.Marshal(body)
	if err != nil {
		return events.APIGatewayProxyResponse{
			StatusCode: 500,
			Headers:    CORSHeaders(),
			Body:       `{"error":"Failed to marshal response"}`,
		}, err
	}

	return events.APIGatewayProxyResponse{
		StatusCode: statusCode,
		Headers:    CORSHeaders(),
		Body:       string(jsonBody),
	}, nil
}

// ErrorResponse creates an error response with CORS headers.
func ErrorResponse(statusCode int, message string) (events.APIGatewayProxyResponse, error) {
	return JSONResponse(statusCode, map[string]string{"error": message})
}
