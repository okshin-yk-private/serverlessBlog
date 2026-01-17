// Package domain provides shared type definitions for the serverless blog.
package domain

import (
	"errors"
	"path/filepath"
	"regexp"
	"strings"
)

// Publish status constants
const (
	PublishStatusDraft     = "draft"
	PublishStatusPublished = "published"
)

// Allowed file extensions for image upload
var allowedExtensions = map[string]bool{
	".jpg":  true,
	".jpeg": true,
	".png":  true,
	".gif":  true,
	".webp": true,
}

// Allowed content types for image upload
var allowedContentTypes = map[string]bool{
	"image/jpeg": true,
	"image/png":  true,
	"image/gif":  true,
	"image/webp": true,
}

// BlogPost represents a blog post entity.
// JSON tags use camelCase for API compatibility with existing TypeScript/Rust implementations.
type BlogPost struct {
	ID              string   `json:"id" dynamodbav:"id"`
	Title           string   `json:"title" dynamodbav:"title"`
	ContentMarkdown string   `json:"contentMarkdown" dynamodbav:"contentMarkdown"`
	ContentHTML     string   `json:"contentHtml" dynamodbav:"contentHtml"`
	Category        string   `json:"category" dynamodbav:"category"`
	Tags            []string `json:"tags" dynamodbav:"tags"`
	PublishStatus   string   `json:"publishStatus" dynamodbav:"publishStatus"`
	AuthorID        string   `json:"authorId" dynamodbav:"authorId"`
	CreatedAt       string   `json:"createdAt" dynamodbav:"createdAt"`
	UpdatedAt       string   `json:"updatedAt" dynamodbav:"updatedAt"`
	PublishedAt     *string  `json:"publishedAt,omitempty" dynamodbav:"publishedAt,omitempty"`
	ImageURLs       []string `json:"imageUrls" dynamodbav:"imageUrls"`
}

// CreatePostRequest represents the request body for creating a post.
type CreatePostRequest struct {
	Title           string   `json:"title"`
	ContentMarkdown string   `json:"contentMarkdown"`
	Category        string   `json:"category"`
	Tags            []string `json:"tags,omitempty"`
	PublishStatus   *string  `json:"publishStatus,omitempty"`
	ImageURLs       []string `json:"imageUrls,omitempty"`
}

// Validate validates the CreatePostRequest.
func (r *CreatePostRequest) Validate() error {
	if r.Title == "" {
		return errors.New("title is required")
	}
	if r.ContentMarkdown == "" {
		return errors.New("contentMarkdown is required")
	}
	if r.Category == "" {
		return errors.New("category is required")
	}
	return nil
}

// UpdatePostRequest represents the request body for updating a post.
type UpdatePostRequest struct {
	Title           *string  `json:"title,omitempty"`
	ContentMarkdown *string  `json:"contentMarkdown,omitempty"`
	Category        *string  `json:"category,omitempty"`
	Tags            []string `json:"tags,omitempty"`
	PublishStatus   *string  `json:"publishStatus,omitempty"`
	ImageURLs       []string `json:"imageUrls,omitempty"`
}

// ListPostsResponse represents the paginated list response.
type ListPostsResponse struct {
	Items     []BlogPost `json:"items"`
	NextToken *string    `json:"nextToken,omitempty"`
}

// TokenResponse represents authentication tokens.
type TokenResponse struct {
	AccessToken  string  `json:"accessToken"`
	IDToken      string  `json:"idToken"`
	RefreshToken *string `json:"refreshToken,omitempty"`
	ExpiresIn    int     `json:"expiresIn"`
}

// ErrorResponse represents an API error response.
type ErrorResponse struct {
	Message string `json:"message"`
}

// LoginRequest represents the request body for login.
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// Validate validates the LoginRequest.
func (r *LoginRequest) Validate() error {
	if r.Email == "" {
		return errors.New("email is required")
	}
	if r.Password == "" {
		return errors.New("password is required")
	}
	return nil
}

// LogoutRequest represents the request body for logout.
type LogoutRequest struct {
	AccessToken string `json:"accessToken"`
}

// Validate validates the LogoutRequest.
func (r *LogoutRequest) Validate() error {
	if r.AccessToken == "" {
		return errors.New("accessToken is required")
	}
	return nil
}

// RefreshRequest represents the request body for token refresh.
type RefreshRequest struct {
	RefreshToken string `json:"refreshToken"`
}

// Validate validates the RefreshRequest.
func (r *RefreshRequest) Validate() error {
	if r.RefreshToken == "" {
		return errors.New("refreshToken is required")
	}
	return nil
}

// GetUploadURLRequest represents the request body for getting a presigned upload URL.
type GetUploadURLRequest struct {
	FileName    string `json:"fileName"`
	ContentType string `json:"contentType"`
}

// Validate validates the GetUploadURLRequest.
func (r *GetUploadURLRequest) Validate() error {
	if r.FileName == "" {
		return errors.New("fileName is required")
	}
	if r.ContentType == "" {
		return errors.New("contentType is required")
	}

	// Validate file extension
	ext := strings.ToLower(filepath.Ext(r.FileName))
	if !isAllowedExtension(ext) {
		return errors.New("file extension is not allowed")
	}

	// Validate content type
	if !isAllowedContentType(r.ContentType) {
		return errors.New("contentType is not allowed")
	}

	return nil
}

// GetUploadURLResponse represents the response for getting a presigned upload URL.
type GetUploadURLResponse struct {
	UploadURL string `json:"uploadUrl"`
	Key       string `json:"key"`
	URL       string `json:"url"`
}

// isAllowedExtension checks if the file extension is allowed.
func isAllowedExtension(ext string) bool {
	return allowedExtensions[ext]
}

// isAllowedContentType checks if the content type is allowed.
func isAllowedContentType(contentType string) bool {
	return allowedContentTypes[contentType]
}

//------------------------------------------------------------------------------
// Category Management Types
// Requirements: Category Management Feature
//------------------------------------------------------------------------------

// Category represents a blog category entity.
// JSON tags use camelCase for API compatibility.
type Category struct {
	ID          string  `json:"id" dynamodbav:"id"`
	Name        string  `json:"name" dynamodbav:"name"`
	Slug        string  `json:"slug" dynamodbav:"slug"`
	Description *string `json:"description,omitempty" dynamodbav:"description,omitempty"`
	SortOrder   int     `json:"sortOrder" dynamodbav:"sortOrder"`
	CreatedAt   string  `json:"createdAt" dynamodbav:"createdAt"`
	UpdatedAt   string  `json:"updatedAt" dynamodbav:"updatedAt"`
}

// CategoryListItem represents a category item in list response.
// Requirement 2.2: Return only id, name, slug, and sortOrder fields.
// This excludes description, createdAt, and updatedAt which are internal fields.
type CategoryListItem struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Slug      string `json:"slug"`
	SortOrder int    `json:"sortOrder"`
}

// ToCategoryListItem converts a Category to CategoryListItem for API response.
func (c *Category) ToCategoryListItem() CategoryListItem {
	return CategoryListItem{
		ID:        c.ID,
		Name:      c.Name,
		Slug:      c.Slug,
		SortOrder: c.SortOrder,
	}
}

// ListCategoriesResponse represents the response for list categories API.
// Requirement 2.2: Return id, name, slug, and sortOrder fields.
type ListCategoriesResponse []CategoryListItem

// CreateCategoryRequest represents the request body for creating a category.
// Requirement 3: Category Creation API
type CreateCategoryRequest struct {
	Name        string  `json:"name"`
	Slug        *string `json:"slug,omitempty"`
	Description *string `json:"description,omitempty"`
	SortOrder   *int    `json:"sortOrder,omitempty"`
}

// slugPattern is a regex pattern for valid slugs (alphanumeric and hyphens only)
var slugPattern = regexp.MustCompile(`^[a-z0-9-]+$`)

// Validate validates the CreateCategoryRequest.
// Requirement 3.3: Return 400 if name is missing or empty
// Requirement 9.3: Return 400 if name exceeds 100 characters
// Requirement 9.4: Return 400 if slug contains invalid characters
func (r *CreateCategoryRequest) Validate() error {
	// Requirement 3.3: name required check
	if r.Name == "" {
		return errors.New("name is required")
	}

	// Requirement 9.3: name length check (100 characters max)
	if len(r.Name) > 100 {
		return errors.New("name must be 100 characters or less")
	}

	// Requirement 9.4: slug format check (if provided)
	if r.Slug != nil {
		// Reject explicitly empty slugs
		if *r.Slug == "" {
			return errors.New("slug cannot be empty when provided")
		}
		if !slugPattern.MatchString(*r.Slug) {
			return errors.New("slug must contain only lowercase alphanumeric characters and hyphens")
		}
	}

	return nil
}

// UpdateCategoryRequest represents the request body for updating a category.
// Requirement 4: Category Update API
type UpdateCategoryRequest struct {
	Name        *string `json:"name,omitempty"`
	Slug        *string `json:"slug,omitempty"`
	Description *string `json:"description,omitempty"`
	SortOrder   *int    `json:"sortOrder,omitempty"`
}

// Validate validates the UpdateCategoryRequest.
// Requirement 4.1: Partial update support - only provided fields are updated
// Requirement 9.3: Return 400 if name exceeds 100 characters
// Requirement 9.4: Return 400 if slug contains invalid characters
func (r *UpdateCategoryRequest) Validate() error {
	// Requirement 9.3: name length check (100 characters max) - only if provided
	if r.Name != nil && len(*r.Name) > 100 {
		return errors.New("name must be 100 characters or less")
	}

	// Check for empty name if provided
	if r.Name != nil && *r.Name == "" {
		return errors.New("name cannot be empty")
	}

	// Requirement 9.4: slug format check (if provided)
	if r.Slug != nil {
		// Reject explicitly empty slugs
		if *r.Slug == "" {
			return errors.New("slug cannot be empty when provided")
		}
		if !slugPattern.MatchString(*r.Slug) {
			return errors.New("slug must contain only lowercase alphanumeric characters and hyphens")
		}
	}

	return nil
}

// UpdateSortOrderRequest represents the request for bulk sort order update.
// Requirement 4B: Category Sort Order Bulk Update API
type UpdateSortOrderRequest struct {
	Orders []SortOrderItem `json:"orders"`
}

// SortOrderItem represents a single category ID and sortOrder pair for bulk update.
type SortOrderItem struct {
	ID        string `json:"id"`
	SortOrder int    `json:"sortOrder"`
}

// Validate validates the UpdateSortOrderRequest.
// Requirement 4B.1, 4B.3, 4B.5: Validate request structure
func (r *UpdateSortOrderRequest) Validate() error {
	if len(r.Orders) == 0 {
		return errors.New("orders array is required and cannot be empty")
	}

	// Check for maximum limit (TransactWriteItems supports max 100 items)
	if len(r.Orders) > 100 {
		return errors.New("maximum 100 categories can be updated at once")
	}

	// Check for duplicate IDs
	seen := make(map[string]bool)
	for _, item := range r.Orders {
		if item.ID == "" {
			return errors.New("category ID is required for each order item")
		}
		if seen[item.ID] {
			return errors.New("duplicate category IDs in request")
		}
		seen[item.ID] = true
	}

	return nil
}

// InvalidIDsErrorResponse represents an error response with list of invalid IDs.
// Requirement 4B.3: Return 400 with list of invalid IDs
type InvalidIDsErrorResponse struct {
	Message    string   `json:"message"`
	InvalidIDs []string `json:"invalidIds"`
}

// GenerateSlug generates a URL-safe slug from the name.
// Requirement 3.5: Auto-generate slug from name if not provided
func GenerateSlug(name string) string {
	// Convert to lowercase
	slug := strings.ToLower(name)

	// Replace spaces with hyphens
	slug = strings.ReplaceAll(slug, " ", "-")

	// Remove non-alphanumeric characters except hyphens
	var result strings.Builder
	for _, r := range slug {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' {
			result.WriteRune(r)
		}
	}

	// Remove consecutive hyphens
	slug = result.String()
	for strings.Contains(slug, "--") {
		slug = strings.ReplaceAll(slug, "--", "-")
	}

	// Trim leading/trailing hyphens
	slug = strings.Trim(slug, "-")

	return slug
}
