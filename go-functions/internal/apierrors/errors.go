// Package apierrors provides custom error types and error handling utilities.
package apierrors

import (
	"errors"
	"fmt"
)

// APIError represents an API error with status code.
type APIError struct {
	StatusCode int
	Message    string
	Err        error
}

func (e *APIError) Error() string {
	if e.Err != nil {
		return fmt.Sprintf("%s: %v", e.Message, e.Err)
	}
	return e.Message
}

// New creates a new APIError.
func New(statusCode int, message string) *APIError {
	return &APIError{
		StatusCode: statusCode,
		Message:    message,
	}
}

// Wrap wraps an existing error with an APIError.
func Wrap(statusCode int, message string, err error) *APIError {
	return &APIError{
		StatusCode: statusCode,
		Message:    message,
		Err:        err,
	}
}

// Common error definitions
var (
	ErrNotFound     = New(404, "Resource not found")
	ErrUnauthorized = New(401, "Unauthorized")
	ErrForbidden    = New(403, "Forbidden")
	ErrBadRequest   = New(400, "Bad request")
	ErrInternal     = New(500, "Internal server error")
)

// ValidationError represents an input validation failure.
type ValidationError struct {
	Field   string
	Message string
}

func (e *ValidationError) Error() string {
	return fmt.Sprintf("validation error: field '%s' %s", e.Field, e.Message)
}

// NewValidationError creates a new ValidationError.
func NewValidationError(field, message string) *ValidationError {
	return &ValidationError{
		Field:   field,
		Message: message,
	}
}

// NotFoundError represents a resource not found error.
type NotFoundError struct {
	Resource string
	ID       string
}

func (e *NotFoundError) Error() string {
	return fmt.Sprintf("%s with ID '%s' not found", e.Resource, e.ID)
}

// NewNotFoundError creates a new NotFoundError.
func NewNotFoundError(resource, id string) *NotFoundError {
	return &NotFoundError{
		Resource: resource,
		ID:       id,
	}
}

// AuthorizationError represents an access denied error.
type AuthorizationError struct {
	Message string
}

func (e *AuthorizationError) Error() string {
	return fmt.Sprintf("authorization error: %s", e.Message)
}

// NewAuthorizationError creates a new AuthorizationError.
func NewAuthorizationError(message string) *AuthorizationError {
	return &AuthorizationError{
		Message: message,
	}
}

// HTTPStatusCode returns the HTTP status code for the given error.
// It maps custom error types to appropriate HTTP status codes:
// - ValidationError: 400 Bad Request
// - NotFoundError: 404 Not Found
// - AuthorizationError: 403 Forbidden
// - APIError: uses its StatusCode field
// - other errors: 500 Internal Server Error
func HTTPStatusCode(err error) int {
	if err == nil {
		return 500
	}

	var validationErr *ValidationError
	if errors.As(err, &validationErr) {
		return 400
	}

	var notFoundErr *NotFoundError
	if errors.As(err, &notFoundErr) {
		return 404
	}

	var authErr *AuthorizationError
	if errors.As(err, &authErr) {
		return 403
	}

	var apiErr *APIError
	if errors.As(err, &apiErr) {
		return apiErr.StatusCode
	}

	return 500
}

// IsValidationError checks if the error is a ValidationError.
func IsValidationError(err error) bool {
	var validationErr *ValidationError
	return errors.As(err, &validationErr)
}

// IsNotFoundError checks if the error is a NotFoundError.
func IsNotFoundError(err error) bool {
	var notFoundErr *NotFoundError
	return errors.As(err, &notFoundErr)
}

// IsAuthorizationError checks if the error is an AuthorizationError.
func IsAuthorizationError(err error) bool {
	var authErr *AuthorizationError
	return errors.As(err, &authErr)
}
