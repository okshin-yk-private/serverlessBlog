// Package domain provides shared type definitions for the serverless blog.
package domain

import (
	"errors"
	"path/filepath"
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
