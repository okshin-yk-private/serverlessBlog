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

// intPtr is a helper to create *int
func intPtr(i int) *int {
	return &i
}

//------------------------------------------------------------------------------
// Category Management Types Tests
//------------------------------------------------------------------------------

// TestCreateCategoryRequestValidation tests CreateCategoryRequest validation
// Requirement 3.3: Return 400 if name is missing or empty
// Requirement 9.3: Return 400 if name exceeds 100 characters
// Requirement 9.4: Return 400 if slug contains invalid characters
func TestCreateCategoryRequestValidation(t *testing.T) {
	tests := []struct {
		name    string
		request CreateCategoryRequest
		wantErr bool
		errMsg  string
	}{
		{
			name: "valid request with all fields",
			request: CreateCategoryRequest{
				Name:        "テクノロジー",
				Slug:        strPtr("tech"),
				Description: strPtr("Technology category"),
				SortOrder:   intPtr(1),
			},
			wantErr: false,
		},
		{
			name: "valid request with name only",
			request: CreateCategoryRequest{
				Name: "Test Category",
			},
			wantErr: false,
		},
		{
			name: "missing name",
			request: CreateCategoryRequest{
				Slug: strPtr("test"),
			},
			wantErr: true,
			errMsg:  "name is required",
		},
		{
			name: "empty name",
			request: CreateCategoryRequest{
				Name: "",
			},
			wantErr: true,
			errMsg:  "name is required",
		},
		{
			name: "name too long (101 chars)",
			request: CreateCategoryRequest{
				Name: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", // 101 chars
			},
			wantErr: true,
			errMsg:  "name must be 100 characters or less",
		},
		{
			name: "name exactly 100 chars",
			request: CreateCategoryRequest{
				Name: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", // 100 chars
			},
			wantErr: false,
		},
		{
			name: "invalid slug with uppercase",
			request: CreateCategoryRequest{
				Name: "Test",
				Slug: strPtr("UPPERCASE"),
			},
			wantErr: true,
			errMsg:  "slug must contain only lowercase alphanumeric characters and hyphens",
		},
		{
			name: "invalid slug with underscore",
			request: CreateCategoryRequest{
				Name: "Test",
				Slug: strPtr("invalid_slug"),
			},
			wantErr: true,
			errMsg:  "slug must contain only lowercase alphanumeric characters and hyphens",
		},
		{
			name: "invalid slug with special chars",
			request: CreateCategoryRequest{
				Name: "Test",
				Slug: strPtr("invalid!slug"),
			},
			wantErr: true,
			errMsg:  "slug must contain only lowercase alphanumeric characters and hyphens",
		},
		{
			name: "valid slug with hyphen",
			request: CreateCategoryRequest{
				Name: "Test",
				Slug: strPtr("valid-slug"),
			},
			wantErr: false,
		},
		{
			name: "valid slug with numbers",
			request: CreateCategoryRequest{
				Name: "Test",
				Slug: strPtr("tech2024"),
			},
			wantErr: false,
		},
		{
			name: "nil slug is valid (auto-generate)",
			request: CreateCategoryRequest{
				Name: "Test",
				Slug: nil,
			},
			wantErr: false,
		},
		{
			name: "empty slug is rejected with 400",
			request: CreateCategoryRequest{
				Name: "Test",
				Slug: strPtr(""),
			},
			wantErr: true,
			errMsg:  "slug cannot be empty when provided",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.request.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
			if tt.wantErr && err != nil && tt.errMsg != "" {
				if err.Error() != tt.errMsg {
					t.Errorf("Expected error message %q, got %q", tt.errMsg, err.Error())
				}
			}
		})
	}
}

// TestGenerateSlug tests slug generation from name
// Requirement 3.5: Auto-generate slug from name if not provided
// Supports Japanese text (kanji, hiragana, katakana) by converting to romaji.
func TestGenerateSlug(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "simple lowercase",
			input:    "technology",
			expected: "technology",
		},
		{
			name:     "with spaces",
			input:    "Technology News",
			expected: "technology-news",
		},
		{
			name:     "uppercase",
			input:    "TECHNOLOGY",
			expected: "technology",
		},
		{
			name:     "mixed case with spaces",
			input:    "My Awesome Blog",
			expected: "my-awesome-blog",
		},
		{
			name:     "with numbers",
			input:    "Tech 2024",
			expected: "tech-2024",
		},
		// Japanese text to romaji conversion tests
		{
			name:     "katakana to romaji",
			input:    "テクノロジー",
			expected: "tekunoroji",
		},
		{
			name:     "hiragana to romaji",
			input:    "ぷろぐらみんぐ",
			expected: "puroguramingu",
		},
		{
			name:     "kanji to romaji",
			input:    "技術",
			expected: "gijutsu",
		},
		{
			name:     "mixed Japanese and English",
			input:    "My テクノロジー Blog",
			expected: "my-tekunoroji-blog",
		},
		{
			name:     "kanji with mixed content",
			input:    "Web開発",
			expected: "webkaihatsu",
		},
		{
			name:     "complex Japanese phrase",
			input:    "プログラミング入門",
			expected: "puroguramingunyuumon",
		},
		{
			name:     "Japanese with spaces",
			input:    "AI と 機械学習",
			expected: "ai-to-kikaigakushuu",
		},
		{
			name:     "special characters removed",
			input:    "Hello! World?",
			expected: "hello-world",
		},
		{
			name:     "multiple spaces",
			input:    "Hello   World",
			expected: "hello-world",
		},
		{
			name:     "leading and trailing spaces",
			input:    "  Hello World  ",
			expected: "hello-world",
		},
		{
			name:     "already valid slug",
			input:    "valid-slug",
			expected: "valid-slug",
		},
		{
			name:     "with hyphens",
			input:    "My-Category",
			expected: "my-category",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := GenerateSlug(tt.input)
			if result != tt.expected {
				t.Errorf("GenerateSlug(%q) = %q, expected %q", tt.input, result, tt.expected)
			}
		})
	}
}

// TestCategoryJSONMarshal tests Category JSON serialization
func TestCategoryJSONMarshal(t *testing.T) {
	description := "Test description"
	category := Category{
		ID:          "cat-1",
		Name:        "テクノロジー",
		Slug:        "tech",
		Description: &description,
		SortOrder:   1,
		CreatedAt:   "2024-01-15T10:00:00Z",
		UpdatedAt:   "2024-01-15T10:00:00Z",
	}

	data, err := json.Marshal(category)
	if err != nil {
		t.Fatalf("Failed to marshal Category: %v", err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatalf("Failed to unmarshal JSON: %v", err)
	}

	// Verify field names are camelCase
	expectedFields := []string{"id", "name", "slug", "description", "sortOrder", "createdAt", "updatedAt"}
	for _, field := range expectedFields {
		if _, ok := result[field]; !ok {
			t.Errorf("Expected field %q not found in JSON", field)
		}
	}

	// Verify values
	if result["id"] != "cat-1" {
		t.Errorf("Expected id 'cat-1', got %v", result["id"])
	}
	if result["name"] != "テクノロジー" {
		t.Errorf("Expected name 'テクノロジー', got %v", result["name"])
	}
}

// TestUpdateCategoryRequestValidation tests UpdateCategoryRequest validation
// Requirement 4.6: Allow partial updates
// Requirement 9.3: Return 400 if name exceeds 100 characters
// Requirement 9.4: Return 400 if slug contains invalid characters
func TestUpdateCategoryRequestValidation(t *testing.T) {
	tests := []struct {
		name    string
		request UpdateCategoryRequest
		wantErr bool
		errMsg  string
	}{
		{
			name: "valid request with all fields",
			request: UpdateCategoryRequest{
				Name:        strPtr("Updated Name"),
				Slug:        strPtr("updated-slug"),
				Description: strPtr("Updated description"),
				SortOrder:   intPtr(2),
			},
			wantErr: false,
		},
		{
			name:    "empty request is valid (no updates)",
			request: UpdateCategoryRequest{},
			wantErr: false,
		},
		{
			name: "valid request with name only",
			request: UpdateCategoryRequest{
				Name: strPtr("New Name"),
			},
			wantErr: false,
		},
		{
			name: "valid request with slug only",
			request: UpdateCategoryRequest{
				Slug: strPtr("new-slug"),
			},
			wantErr: false,
		},
		{
			name: "valid request with sortOrder only",
			request: UpdateCategoryRequest{
				SortOrder: intPtr(5),
			},
			wantErr: false,
		},
		{
			name: "empty name is invalid",
			request: UpdateCategoryRequest{
				Name: strPtr(""),
			},
			wantErr: true,
			errMsg:  "name cannot be empty",
		},
		{
			name: "name too long (101 chars)",
			request: UpdateCategoryRequest{
				Name: strPtr("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), // 101 chars
			},
			wantErr: true,
			errMsg:  "name must be 100 characters or less",
		},
		{
			name: "name exactly 100 chars",
			request: UpdateCategoryRequest{
				Name: strPtr("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), // 100 chars
			},
			wantErr: false,
		},
		{
			name: "invalid slug with uppercase",
			request: UpdateCategoryRequest{
				Slug: strPtr("UPPERCASE"),
			},
			wantErr: true,
			errMsg:  "slug must contain only lowercase alphanumeric characters and hyphens",
		},
		{
			name: "invalid slug with underscore",
			request: UpdateCategoryRequest{
				Slug: strPtr("invalid_slug"),
			},
			wantErr: true,
			errMsg:  "slug must contain only lowercase alphanumeric characters and hyphens",
		},
		{
			name: "invalid slug with special chars",
			request: UpdateCategoryRequest{
				Slug: strPtr("invalid!slug"),
			},
			wantErr: true,
			errMsg:  "slug must contain only lowercase alphanumeric characters and hyphens",
		},
		{
			name: "valid slug with hyphen",
			request: UpdateCategoryRequest{
				Slug: strPtr("valid-slug"),
			},
			wantErr: false,
		},
		{
			name: "valid slug with numbers",
			request: UpdateCategoryRequest{
				Slug: strPtr("tech2024"),
			},
			wantErr: false,
		},
		{
			name: "nil slug is valid (no change)",
			request: UpdateCategoryRequest{
				Name: strPtr("Test"),
				Slug: nil,
			},
			wantErr: false,
		},
		{
			name: "empty slug is rejected with 400",
			request: UpdateCategoryRequest{
				Slug: strPtr(""),
			},
			wantErr: true,
			errMsg:  "slug cannot be empty when provided",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.request.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
			if tt.wantErr && err != nil && tt.errMsg != "" {
				if err.Error() != tt.errMsg {
					t.Errorf("Expected error message %q, got %q", tt.errMsg, err.Error())
				}
			}
		})
	}
}

// TestUpdateSortOrderRequestValidation tests UpdateSortOrderRequest validation
// Requirement 4B.1, 4B.3, 4B.5: Validate request structure
func TestUpdateSortOrderRequestValidation(t *testing.T) {
	tests := []struct {
		name    string
		request UpdateSortOrderRequest
		wantErr bool
		errMsg  string
	}{
		{
			name: "valid request with single order",
			request: UpdateSortOrderRequest{
				Orders: []SortOrderItem{{ID: "cat-1", SortOrder: 1}},
			},
			wantErr: false,
		},
		{
			name: "valid request with multiple orders",
			request: UpdateSortOrderRequest{
				Orders: []SortOrderItem{
					{ID: "cat-1", SortOrder: 1},
					{ID: "cat-2", SortOrder: 2},
					{ID: "cat-3", SortOrder: 3},
				},
			},
			wantErr: false,
		},
		{
			name: "empty orders array",
			request: UpdateSortOrderRequest{
				Orders: []SortOrderItem{},
			},
			wantErr: true,
			errMsg:  "orders array is required and cannot be empty",
		},
		{
			name:    "nil orders",
			request: UpdateSortOrderRequest{},
			wantErr: true,
			errMsg:  "orders array is required and cannot be empty",
		},
		{
			name: "duplicate IDs",
			request: UpdateSortOrderRequest{
				Orders: []SortOrderItem{
					{ID: "cat-1", SortOrder: 1},
					{ID: "cat-1", SortOrder: 2},
				},
			},
			wantErr: true,
			errMsg:  "duplicate category IDs in request",
		},
		{
			name: "empty ID in item",
			request: UpdateSortOrderRequest{
				Orders: []SortOrderItem{
					{ID: "", SortOrder: 1},
				},
			},
			wantErr: true,
			errMsg:  "category ID is required for each order item",
		},
		{
			name: "exceeds 100 items limit",
			request: func() UpdateSortOrderRequest {
				orders := make([]SortOrderItem, 101)
				for i := 0; i < 101; i++ {
					orders[i] = SortOrderItem{ID: "cat-" + string(rune(i)), SortOrder: i}
				}
				return UpdateSortOrderRequest{Orders: orders}
			}(),
			wantErr: true,
			errMsg:  "maximum 100 categories can be updated at once",
		},
		{
			name: "exactly 100 items is valid",
			request: func() UpdateSortOrderRequest {
				orders := make([]SortOrderItem, 100)
				for i := 0; i < 100; i++ {
					orders[i] = SortOrderItem{ID: "cat-" + string(rune(i+'a')), SortOrder: i}
				}
				return UpdateSortOrderRequest{Orders: orders}
			}(),
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.request.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
			if tt.wantErr && err != nil && tt.errMsg != "" {
				if err.Error() != tt.errMsg {
					t.Errorf("Expected error message %q, got %q", tt.errMsg, err.Error())
				}
			}
		})
	}
}

// TestUpdateSortOrderRequestJSONMarshal tests JSON serialization
func TestUpdateSortOrderRequestJSONMarshal(t *testing.T) {
	request := UpdateSortOrderRequest{
		Orders: []SortOrderItem{
			{ID: "cat-1", SortOrder: 1},
			{ID: "cat-2", SortOrder: 2},
		},
	}

	data, err := json.Marshal(request)
	if err != nil {
		t.Fatalf("Failed to marshal UpdateSortOrderRequest: %v", err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatalf("Failed to unmarshal JSON: %v", err)
	}

	// Verify field names
	if _, ok := result["orders"]; !ok {
		t.Error("Expected orders field to be present")
	}

	orders := result["orders"].([]interface{})
	if len(orders) != 2 {
		t.Errorf("Expected 2 orders, got %d", len(orders))
	}

	firstOrder := orders[0].(map[string]interface{})
	if firstOrder["id"] != "cat-1" {
		t.Errorf("Expected id 'cat-1', got %v", firstOrder["id"])
	}
	if firstOrder["sortOrder"] != float64(1) {
		t.Errorf("Expected sortOrder 1, got %v", firstOrder["sortOrder"])
	}
}

// TestInvalidIDsErrorResponseJSONMarshal tests InvalidIDsErrorResponse JSON serialization
func TestInvalidIDsErrorResponseJSONMarshal(t *testing.T) {
	response := InvalidIDsErrorResponse{
		Message:    "some category IDs do not exist",
		InvalidIDs: []string{"cat-nonexistent-1", "cat-nonexistent-2"},
	}

	data, err := json.Marshal(response)
	if err != nil {
		t.Fatalf("Failed to marshal InvalidIDsErrorResponse: %v", err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatalf("Failed to unmarshal JSON: %v", err)
	}

	if result["message"] != "some category IDs do not exist" {
		t.Errorf("Expected message, got %v", result["message"])
	}

	invalidIDs := result["invalidIds"].([]interface{})
	if len(invalidIDs) != 2 {
		t.Errorf("Expected 2 invalid IDs, got %d", len(invalidIDs))
	}
}

// TestCategoryDescriptionOmitEmpty tests that description is omitted when nil
func TestCategoryDescriptionOmitEmpty(t *testing.T) {
	category := Category{
		ID:          "cat-1",
		Name:        "Test",
		Slug:        "test",
		Description: nil,
		SortOrder:   1,
		CreatedAt:   "2024-01-15T10:00:00Z",
		UpdatedAt:   "2024-01-15T10:00:00Z",
	}

	data, err := json.Marshal(category)
	if err != nil {
		t.Fatalf("Failed to marshal Category: %v", err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatalf("Failed to unmarshal JSON: %v", err)
	}

	// Verify description is omitted when nil
	if _, ok := result["description"]; ok {
		t.Error("Expected description to be omitted when nil")
	}
}
