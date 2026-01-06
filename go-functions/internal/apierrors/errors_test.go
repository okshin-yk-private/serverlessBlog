// Package apierrors provides custom error types and error handling utilities.
package apierrors

import (
	"errors"
	"testing"
)

// Test ValidationError
func TestValidationError_Error(t *testing.T) {
	tests := []struct {
		name     string
		field    string
		message  string
		expected string
	}{
		{
			name:     "title field required",
			field:    "title",
			message:  "is required",
			expected: "validation error: field 'title' is required",
		},
		{
			name:     "email field invalid format",
			field:    "email",
			message:  "invalid format",
			expected: "validation error: field 'email' invalid format",
		},
		{
			name:     "contentMarkdown field too long",
			field:    "contentMarkdown",
			message:  "exceeds maximum length",
			expected: "validation error: field 'contentMarkdown' exceeds maximum length",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := &ValidationError{
				Field:   tt.field,
				Message: tt.message,
			}
			if got := err.Error(); got != tt.expected {
				t.Errorf("ValidationError.Error() = %q, want %q", got, tt.expected)
			}
		})
	}
}

// Test NotFoundError
func TestNotFoundError_Error(t *testing.T) {
	tests := []struct {
		name     string
		resource string
		id       string
		expected string
	}{
		{
			name:     "post not found",
			resource: "Post",
			id:       "123e4567-e89b-12d3-a456-426614174000",
			expected: "Post with ID '123e4567-e89b-12d3-a456-426614174000' not found",
		},
		{
			name:     "user not found",
			resource: "User",
			id:       "user-001",
			expected: "User with ID 'user-001' not found",
		},
		{
			name:     "image not found",
			resource: "Image",
			id:       "images/user123/photo.jpg",
			expected: "Image with ID 'images/user123/photo.jpg' not found",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := &NotFoundError{
				Resource: tt.resource,
				ID:       tt.id,
			}
			if got := err.Error(); got != tt.expected {
				t.Errorf("NotFoundError.Error() = %q, want %q", got, tt.expected)
			}
		})
	}
}

// Test AuthorizationError
func TestAuthorizationError_Error(t *testing.T) {
	tests := []struct {
		name     string
		message  string
		expected string
	}{
		{
			name:     "access denied",
			message:  "access denied",
			expected: "authorization error: access denied",
		},
		{
			name:     "insufficient permissions",
			message:  "insufficient permissions to access this resource",
			expected: "authorization error: insufficient permissions to access this resource",
		},
		{
			name:     "token expired",
			message:  "token has expired",
			expected: "authorization error: token has expired",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := &AuthorizationError{
				Message: tt.message,
			}
			if got := err.Error(); got != tt.expected {
				t.Errorf("AuthorizationError.Error() = %q, want %q", got, tt.expected)
			}
		})
	}
}

// Test HTTPStatusCode function
func TestHTTPStatusCode(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		expected int
	}{
		{
			name:     "ValidationError returns 400",
			err:      &ValidationError{Field: "title", Message: "is required"},
			expected: 400,
		},
		{
			name:     "NotFoundError returns 404",
			err:      &NotFoundError{Resource: "Post", ID: "123"},
			expected: 404,
		},
		{
			name:     "AuthorizationError returns 403",
			err:      &AuthorizationError{Message: "access denied"},
			expected: 403,
		},
		{
			name:     "APIError returns its status code",
			err:      &APIError{StatusCode: 401, Message: "unauthorized"},
			expected: 401,
		},
		{
			name:     "generic error returns 500",
			err:      errors.New("some internal error"),
			expected: 500,
		},
		{
			name:     "nil error returns 500",
			err:      nil,
			expected: 500,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := HTTPStatusCode(tt.err); got != tt.expected {
				t.Errorf("HTTPStatusCode() = %d, want %d", got, tt.expected)
			}
		})
	}
}

// Test error interface implementation
func TestErrorInterfaceImplementation(t *testing.T) {
	// Ensure all custom error types implement the error interface
	var _ error = &ValidationError{}
	var _ error = &NotFoundError{}
	var _ error = &AuthorizationError{}
	var _ error = &APIError{}
}

// Test NewValidationError helper function
func TestNewValidationError(t *testing.T) {
	err := NewValidationError("email", "invalid format")
	if err.Field != "email" {
		t.Errorf("NewValidationError().Field = %q, want %q", err.Field, "email")
	}
	if err.Message != "invalid format" {
		t.Errorf("NewValidationError().Message = %q, want %q", err.Message, "invalid format")
	}
}

// Test NewNotFoundError helper function
func TestNewNotFoundError(t *testing.T) {
	err := NewNotFoundError("Post", "123")
	if err.Resource != "Post" {
		t.Errorf("NewNotFoundError().Resource = %q, want %q", err.Resource, "Post")
	}
	if err.ID != "123" {
		t.Errorf("NewNotFoundError().ID = %q, want %q", err.ID, "123")
	}
}

// Test NewAuthorizationError helper function
func TestNewAuthorizationError(t *testing.T) {
	err := NewAuthorizationError("access denied")
	if err.Message != "access denied" {
		t.Errorf("NewAuthorizationError().Message = %q, want %q", err.Message, "access denied")
	}
}

// Test IsValidationError helper function
func TestIsValidationError(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		expected bool
	}{
		{
			name:     "ValidationError returns true",
			err:      &ValidationError{Field: "title", Message: "required"},
			expected: true,
		},
		{
			name:     "NotFoundError returns false",
			err:      &NotFoundError{Resource: "Post", ID: "123"},
			expected: false,
		},
		{
			name:     "generic error returns false",
			err:      errors.New("some error"),
			expected: false,
		},
		{
			name:     "nil error returns false",
			err:      nil,
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := IsValidationError(tt.err); got != tt.expected {
				t.Errorf("IsValidationError() = %v, want %v", got, tt.expected)
			}
		})
	}
}

// Test IsNotFoundError helper function
func TestIsNotFoundError(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		expected bool
	}{
		{
			name:     "NotFoundError returns true",
			err:      &NotFoundError{Resource: "Post", ID: "123"},
			expected: true,
		},
		{
			name:     "ValidationError returns false",
			err:      &ValidationError{Field: "title", Message: "required"},
			expected: false,
		},
		{
			name:     "generic error returns false",
			err:      errors.New("some error"),
			expected: false,
		},
		{
			name:     "nil error returns false",
			err:      nil,
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := IsNotFoundError(tt.err); got != tt.expected {
				t.Errorf("IsNotFoundError() = %v, want %v", got, tt.expected)
			}
		})
	}
}

// Test IsAuthorizationError helper function
func TestIsAuthorizationError(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		expected bool
	}{
		{
			name:     "AuthorizationError returns true",
			err:      &AuthorizationError{Message: "access denied"},
			expected: true,
		},
		{
			name:     "ValidationError returns false",
			err:      &ValidationError{Field: "title", Message: "required"},
			expected: false,
		},
		{
			name:     "generic error returns false",
			err:      errors.New("some error"),
			expected: false,
		},
		{
			name:     "nil error returns false",
			err:      nil,
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := IsAuthorizationError(tt.err); got != tt.expected {
				t.Errorf("IsAuthorizationError() = %v, want %v", got, tt.expected)
			}
		})
	}
}

// Test APIError.Error method
func TestAPIError_Error(t *testing.T) {
	tests := []struct {
		name     string
		apiError *APIError
		expected string
	}{
		{
			name: "error without wrapped error",
			apiError: &APIError{
				StatusCode: 400,
				Message:    "Bad request",
				Err:        nil,
			},
			expected: "Bad request",
		},
		{
			name: "error with wrapped error",
			apiError: &APIError{
				StatusCode: 500,
				Message:    "Database error",
				Err:        errors.New("connection refused"),
			},
			expected: "Database error: connection refused",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.apiError.Error(); got != tt.expected {
				t.Errorf("APIError.Error() = %q, want %q", got, tt.expected)
			}
		})
	}
}

// Test Wrap function
func TestWrap(t *testing.T) {
	originalErr := errors.New("original error")
	apiErr := Wrap(503, "Service unavailable", originalErr)

	if apiErr.StatusCode != 503 {
		t.Errorf("Wrap().StatusCode = %d, want %d", apiErr.StatusCode, 503)
	}
	if apiErr.Message != "Service unavailable" {
		t.Errorf("Wrap().Message = %q, want %q", apiErr.Message, "Service unavailable")
	}
	if !errors.Is(apiErr.Err, originalErr) {
		t.Errorf("Wrap().Err = %v, want %v", apiErr.Err, originalErr)
	}
}
