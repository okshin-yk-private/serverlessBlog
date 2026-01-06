// Package domain provides shared type definitions for the serverless blog.
package domain

import (
	"encoding/json"
	"testing"
)

// TestBlogPostJSONMarshal tests BlogPost JSON serialization with camelCase fields
func TestBlogPostJSONMarshal(t *testing.T) {
	post := BlogPost{
		ID:              "test-id",
		Title:           "Test Title",
		ContentMarkdown: "# Hello",
		ContentHTML:     "<h1>Hello</h1>",
		Category:        "technology",
		Tags:            []string{"go", "lambda"},
		PublishStatus:   PublishStatusDraft,
		AuthorID:        "author-123",
		CreatedAt:       "2026-01-04T00:00:00Z",
		UpdatedAt:       "2026-01-04T00:00:00Z",
		PublishedAt:     nil,
		ImageURLs:       []string{"https://example.com/image.jpg"},
	}

	data, err := json.Marshal(post)
	if err != nil {
		t.Fatalf("Failed to marshal BlogPost: %v", err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatalf("Failed to unmarshal JSON: %v", err)
	}

	// Verify camelCase field names
	expectedFields := []string{"id", "title", "contentMarkdown", "contentHtml", "category", "tags", "publishStatus", "authorId", "createdAt", "updatedAt", "imageUrls"}
	for _, field := range expectedFields {
		if _, ok := result[field]; !ok {
			t.Errorf("Expected field %q not found in JSON", field)
		}
	}

	// Verify publishedAt is omitted when nil
	if _, ok := result["publishedAt"]; ok {
		t.Error("Expected publishedAt to be omitted when nil")
	}

	// Verify values
	if result["id"] != "test-id" {
		t.Errorf("Expected id 'test-id', got %v", result["id"])
	}
	if result["publishStatus"] != "draft" {
		t.Errorf("Expected publishStatus 'draft', got %v", result["publishStatus"])
	}
}

// TestBlogPostJSONUnmarshal tests BlogPost JSON deserialization
func TestBlogPostJSONUnmarshal(t *testing.T) {
	jsonData := `{
		"id": "test-id",
		"title": "Test Title",
		"contentMarkdown": "# Hello",
		"contentHtml": "<h1>Hello</h1>",
		"category": "technology",
		"tags": ["go", "lambda"],
		"publishStatus": "published",
		"authorId": "author-123",
		"createdAt": "2026-01-04T00:00:00Z",
		"updatedAt": "2026-01-04T00:00:00Z",
		"publishedAt": "2026-01-04T01:00:00Z",
		"imageUrls": ["https://example.com/image.jpg"]
	}`

	var post BlogPost
	if err := json.Unmarshal([]byte(jsonData), &post); err != nil {
		t.Fatalf("Failed to unmarshal BlogPost: %v", err)
	}

	if post.ID != "test-id" {
		t.Errorf("Expected ID 'test-id', got %v", post.ID)
	}
	if post.PublishStatus != PublishStatusPublished {
		t.Errorf("Expected PublishStatus 'published', got %v", post.PublishStatus)
	}
	if post.PublishedAt == nil || *post.PublishedAt != "2026-01-04T01:00:00Z" {
		t.Errorf("Expected PublishedAt '2026-01-04T01:00:00Z', got %v", post.PublishedAt)
	}
	if len(post.Tags) != 2 {
		t.Errorf("Expected 2 tags, got %d", len(post.Tags))
	}
	if len(post.ImageURLs) != 1 {
		t.Errorf("Expected 1 imageUrl, got %d", len(post.ImageURLs))
	}
}

// TestBlogPostPublishedAtOmitEmpty verifies publishedAt is included when set
func TestBlogPostPublishedAtOmitEmpty(t *testing.T) {
	publishedAt := "2026-01-04T01:00:00Z"
	post := BlogPost{
		ID:          "test-id",
		PublishedAt: &publishedAt,
		Tags:        []string{},
		ImageURLs:   []string{},
	}

	data, err := json.Marshal(post)
	if err != nil {
		t.Fatalf("Failed to marshal BlogPost: %v", err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatalf("Failed to unmarshal JSON: %v", err)
	}

	if _, ok := result["publishedAt"]; !ok {
		t.Error("Expected publishedAt to be included when set")
	}
}

// TestCreatePostRequestValidation tests CreatePostRequest validation
func TestCreatePostRequestValidation(t *testing.T) {
	tests := []struct {
		name    string
		request CreatePostRequest
		wantErr bool
		errMsg  string
	}{
		{
			name: "valid request with all fields",
			request: CreatePostRequest{
				Title:           "Test Title",
				ContentMarkdown: "# Hello",
				Category:        "technology",
				Tags:            []string{"go"},
				PublishStatus:   strPtr("draft"),
				ImageURLs:       []string{"https://example.com/image.jpg"},
			},
			wantErr: false,
		},
		{
			name: "valid request with required fields only",
			request: CreatePostRequest{
				Title:           "Test Title",
				ContentMarkdown: "# Hello",
				Category:        "technology",
			},
			wantErr: false,
		},
		{
			name: "missing title",
			request: CreatePostRequest{
				ContentMarkdown: "# Hello",
				Category:        "technology",
			},
			wantErr: true,
			errMsg:  "title",
		},
		{
			name: "missing contentMarkdown",
			request: CreatePostRequest{
				Title:    "Test Title",
				Category: "technology",
			},
			wantErr: true,
			errMsg:  "contentMarkdown",
		},
		{
			name: "missing category",
			request: CreatePostRequest{
				Title:           "Test Title",
				ContentMarkdown: "# Hello",
			},
			wantErr: true,
			errMsg:  "category",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.request.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
			if tt.wantErr && err != nil {
				if tt.errMsg != "" && err.Error() != tt.errMsg+" is required" {
					t.Errorf("Expected error message containing %q, got %q", tt.errMsg, err.Error())
				}
			}
		})
	}
}

// TestUpdatePostRequestJSONMarshal tests UpdatePostRequest JSON serialization
func TestUpdatePostRequestJSONMarshal(t *testing.T) {
	title := "Updated Title"
	request := UpdatePostRequest{
		Title: &title,
	}

	data, err := json.Marshal(request)
	if err != nil {
		t.Fatalf("Failed to marshal UpdatePostRequest: %v", err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatalf("Failed to unmarshal JSON: %v", err)
	}

	// Verify title is included
	if _, ok := result["title"]; !ok {
		t.Error("Expected title to be included")
	}

	// Verify other fields are omitted when nil
	for _, field := range []string{"contentMarkdown", "category", "publishStatus"} {
		if _, ok := result[field]; ok {
			t.Errorf("Expected %s to be omitted when nil", field)
		}
	}
}

// TestUpdatePostRequestJSONUnmarshal tests UpdatePostRequest JSON deserialization
func TestUpdatePostRequestJSONUnmarshal(t *testing.T) {
	jsonData := `{
		"title": "Updated Title",
		"publishStatus": "published"
	}`

	var request UpdatePostRequest
	if err := json.Unmarshal([]byte(jsonData), &request); err != nil {
		t.Fatalf("Failed to unmarshal UpdatePostRequest: %v", err)
	}

	if request.Title == nil || *request.Title != "Updated Title" {
		t.Errorf("Expected Title 'Updated Title', got %v", request.Title)
	}
	if request.PublishStatus == nil || *request.PublishStatus != "published" {
		t.Errorf("Expected PublishStatus 'published', got %v", request.PublishStatus)
	}
	if request.ContentMarkdown != nil {
		t.Error("Expected ContentMarkdown to be nil")
	}
}

// TestListPostsResponseJSONMarshal tests ListPostsResponse JSON serialization
func TestListPostsResponseJSONMarshal(t *testing.T) {
	response := ListPostsResponse{
		Items:     []BlogPost{{ID: "test-id"}},
		NextToken: nil,
	}

	data, err := json.Marshal(response)
	if err != nil {
		t.Fatalf("Failed to marshal ListPostsResponse: %v", err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatalf("Failed to unmarshal JSON: %v", err)
	}

	// Verify items is present
	if _, ok := result["items"]; !ok {
		t.Error("Expected items to be present")
	}

	// Verify nextToken is omitted when nil
	if _, ok := result["nextToken"]; ok {
		t.Error("Expected nextToken to be omitted when nil")
	}
}

// TestListPostsResponseWithNextToken tests ListPostsResponse with nextToken
func TestListPostsResponseWithNextToken(t *testing.T) {
	nextToken := "abc123"
	response := ListPostsResponse{
		Items:     []BlogPost{{ID: "test-id"}},
		NextToken: &nextToken,
	}

	data, err := json.Marshal(response)
	if err != nil {
		t.Fatalf("Failed to marshal ListPostsResponse: %v", err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatalf("Failed to unmarshal JSON: %v", err)
	}

	if _, ok := result["nextToken"]; !ok {
		t.Error("Expected nextToken to be present when set")
	}
}

// TestTokenResponseJSONMarshal tests TokenResponse JSON serialization
func TestTokenResponseJSONMarshal(t *testing.T) {
	response := TokenResponse{
		AccessToken:  "access-token",
		IDToken:      "id-token",
		RefreshToken: nil,
		ExpiresIn:    3600,
	}

	data, err := json.Marshal(response)
	if err != nil {
		t.Fatalf("Failed to marshal TokenResponse: %v", err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatalf("Failed to unmarshal JSON: %v", err)
	}

	// Verify field names
	if _, ok := result["accessToken"]; !ok {
		t.Error("Expected accessToken to be present")
	}
	if _, ok := result["idToken"]; !ok {
		t.Error("Expected idToken to be present")
	}
	if _, ok := result["expiresIn"]; !ok {
		t.Error("Expected expiresIn to be present")
	}

	// Verify refreshToken is omitted when nil
	if _, ok := result["refreshToken"]; ok {
		t.Error("Expected refreshToken to be omitted when nil")
	}
}

// TestErrorResponseJSONMarshal tests ErrorResponse JSON serialization
func TestErrorResponseJSONMarshal(t *testing.T) {
	response := ErrorResponse{
		Message: "Test error message",
	}

	data, err := json.Marshal(response)
	if err != nil {
		t.Fatalf("Failed to marshal ErrorResponse: %v", err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatalf("Failed to unmarshal JSON: %v", err)
	}

	if result["message"] != "Test error message" {
		t.Errorf("Expected message 'Test error message', got %v", result["message"])
	}
}

// TestPublishStatusConstants verifies publish status constants
func TestPublishStatusConstants(t *testing.T) {
	if PublishStatusDraft != "draft" {
		t.Errorf("Expected PublishStatusDraft to be 'draft', got %v", PublishStatusDraft)
	}
	if PublishStatusPublished != "published" {
		t.Errorf("Expected PublishStatusPublished to be 'published', got %v", PublishStatusPublished)
	}
}

// TestLoginRequestValidation tests LoginRequest validation
func TestLoginRequestValidation(t *testing.T) {
	tests := []struct {
		name    string
		request LoginRequest
		wantErr bool
		errMsg  string
	}{
		{
			name: "valid request",
			request: LoginRequest{
				Email:    "test@example.com",
				Password: "password123",
			},
			wantErr: false,
		},
		{
			name: "missing email",
			request: LoginRequest{
				Password: "password123",
			},
			wantErr: true,
			errMsg:  "email",
		},
		{
			name: "missing password",
			request: LoginRequest{
				Email: "test@example.com",
			},
			wantErr: true,
			errMsg:  "password",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.request.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

// TestRefreshRequestValidation tests RefreshRequest validation
func TestRefreshRequestValidation(t *testing.T) {
	tests := []struct {
		name    string
		request RefreshRequest
		wantErr bool
	}{
		{
			name:    "valid request",
			request: RefreshRequest{RefreshToken: "token123"},
			wantErr: false,
		},
		{
			name:    "missing refreshToken",
			request: RefreshRequest{},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.request.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

// TestLogoutRequestValidation tests LogoutRequest validation
func TestLogoutRequestValidation(t *testing.T) {
	tests := []struct {
		name    string
		request LogoutRequest
		wantErr bool
	}{
		{
			name:    "valid request",
			request: LogoutRequest{AccessToken: "token123"},
			wantErr: false,
		},
		{
			name:    "missing accessToken",
			request: LogoutRequest{},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.request.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

// TestGetUploadURLRequestValidation tests GetUploadURLRequest validation
func TestGetUploadURLRequestValidation(t *testing.T) {
	tests := []struct {
		name    string
		request GetUploadURLRequest
		wantErr bool
		errMsg  string
	}{
		{
			name: "valid request",
			request: GetUploadURLRequest{
				FileName:    "image.jpg",
				ContentType: "image/jpeg",
			},
			wantErr: false,
		},
		{
			name: "missing fileName",
			request: GetUploadURLRequest{
				ContentType: "image/jpeg",
			},
			wantErr: true,
			errMsg:  "fileName",
		},
		{
			name: "missing contentType",
			request: GetUploadURLRequest{
				FileName: "image.jpg",
			},
			wantErr: true,
			errMsg:  "contentType",
		},
		{
			name: "invalid file extension",
			request: GetUploadURLRequest{
				FileName:    "file.exe",
				ContentType: "image/jpeg",
			},
			wantErr: true,
			errMsg:  "extension",
		},
		{
			name: "invalid content type",
			request: GetUploadURLRequest{
				FileName:    "image.jpg",
				ContentType: "application/pdf",
			},
			wantErr: true,
			errMsg:  "contentType",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.request.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

// TestAllowedFileExtensions verifies allowed file extensions
func TestAllowedFileExtensions(t *testing.T) {
	expectedExtensions := []string{".jpg", ".jpeg", ".png", ".gif", ".webp"}
	for _, ext := range expectedExtensions {
		if !isAllowedExtension(ext) {
			t.Errorf("Expected %s to be allowed", ext)
		}
	}

	notAllowedExtensions := []string{".exe", ".pdf", ".doc", ".bmp"}
	for _, ext := range notAllowedExtensions {
		if isAllowedExtension(ext) {
			t.Errorf("Expected %s to not be allowed", ext)
		}
	}
}

// TestAllowedContentTypes verifies allowed content types
func TestAllowedContentTypes(t *testing.T) {
	expectedTypes := []string{"image/jpeg", "image/png", "image/gif", "image/webp"}
	for _, ct := range expectedTypes {
		if !isAllowedContentType(ct) {
			t.Errorf("Expected %s to be allowed", ct)
		}
	}

	notAllowedTypes := []string{"application/pdf", "text/plain", "image/bmp"}
	for _, ct := range notAllowedTypes {
		if isAllowedContentType(ct) {
			t.Errorf("Expected %s to not be allowed", ct)
		}
	}
}

// Helper function
func strPtr(s string) *string {
	return &s
}
