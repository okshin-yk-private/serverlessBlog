package middleware

import (
	"encoding/json"
	"math"
	"os"
	"testing"
)

func TestCORSHeaders_Default(t *testing.T) {
	os.Unsetenv("ALLOWED_ORIGIN")
	headers := CORSHeaders()

	if got := headers["Access-Control-Allow-Origin"]; got != "*" {
		t.Errorf("Access-Control-Allow-Origin = %q, want %q", got, "*")
	}
}

func TestCORSHeaders_WithEnvVar(t *testing.T) {
	os.Setenv("ALLOWED_ORIGIN", "https://example.com")
	defer os.Unsetenv("ALLOWED_ORIGIN")

	headers := CORSHeaders()

	if got := headers["Access-Control-Allow-Origin"]; got != "https://example.com" {
		t.Errorf("Access-Control-Allow-Origin = %q, want %q", got, "https://example.com")
	}
}

func TestCORSHeaders_StaticHeaders(t *testing.T) {
	os.Unsetenv("ALLOWED_ORIGIN")
	headers := CORSHeaders()

	expected := map[string]string{
		"Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type, Authorization",
		"Content-Type":                 "application/json",
		"X-Content-Type-Options":       "nosniff",
		"X-Frame-Options":              "DENY",
		"Cache-Control":                "no-store",
	}

	for key, want := range expected {
		got, ok := headers[key]
		if !ok {
			t.Errorf("missing header %q", key)
			continue
		}
		if got != want {
			t.Errorf("header %q = %q, want %q", key, got, want)
		}
	}
}

func TestCORSHeaders_SecurityHeaders(t *testing.T) {
	os.Unsetenv("ALLOWED_ORIGIN")
	headers := CORSHeaders()

	tests := []struct {
		header string
		want   string
	}{
		{"X-Content-Type-Options", "nosniff"},
		{"X-Frame-Options", "DENY"},
		{"Cache-Control", "no-store"},
	}

	for _, tt := range tests {
		got, ok := headers[tt.header]
		if !ok {
			t.Errorf("missing security header %q", tt.header)
			continue
		}
		if got != tt.want {
			t.Errorf("header %q = %q, want %q", tt.header, got, tt.want)
		}
	}
}

func TestJSONResponse(t *testing.T) {
	body := map[string]string{"message": "ok"}
	resp, err := JSONResponse(200, body)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.StatusCode != 200 {
		t.Errorf("status = %d, want 200", resp.StatusCode)
	}
	if resp.Headers["Content-Type"] != "application/json" {
		t.Errorf("Content-Type = %q, want application/json", resp.Headers["Content-Type"])
	}

	var parsed map[string]string
	if err := json.Unmarshal([]byte(resp.Body), &parsed); err != nil {
		t.Fatalf("failed to parse body: %v", err)
	}
	if parsed["message"] != "ok" {
		t.Errorf("body message = %q, want ok", parsed["message"])
	}
}

func TestJSONResponse_MarshalError(t *testing.T) {
	// math.Inf cannot be marshaled to JSON
	resp, err := JSONResponse(200, math.Inf(1))
	if err == nil {
		t.Fatal("expected error for unmarshalable value")
	}
	if resp.StatusCode != 500 {
		t.Errorf("status = %d, want 500", resp.StatusCode)
	}
}

func TestErrorResponse(t *testing.T) {
	resp, err := ErrorResponse(400, "bad request")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.StatusCode != 400 {
		t.Errorf("status = %d, want 400", resp.StatusCode)
	}

	var parsed map[string]string
	if err := json.Unmarshal([]byte(resp.Body), &parsed); err != nil {
		t.Fatalf("failed to parse body: %v", err)
	}
	if parsed["error"] != "bad request" {
		t.Errorf("body error = %q, want 'bad request'", parsed["error"])
	}
}
