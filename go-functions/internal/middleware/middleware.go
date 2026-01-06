// Package middleware provides HTTP middleware utilities for Lambda handlers.
package middleware

import (
	"encoding/json"

	"github.com/aws/aws-lambda-go/events"
)

// CORSHeaders returns standard CORS headers.
func CORSHeaders() map[string]string {
	return map[string]string{
		"Access-Control-Allow-Origin":  "*",
		"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization",
		"Content-Type":                 "application/json",
	}
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
