//! Domain types for the serverless blog platform.

use serde::{Deserialize, Serialize};

/// Blog post entity stored in DynamoDB.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlogPost {
    pub id: String,
    pub title: String,
    pub content_markdown: String,
    pub content_html: String,
    pub category: String,
    pub tags: Vec<String>,
    pub publish_status: PublishStatus,
    pub author_id: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub published_at: Option<String>,
    #[serde(default)]
    pub image_urls: Vec<String>,
}

/// Publication status of a blog post.
#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PublishStatus {
    #[default]
    Draft,
    Published,
}

/// Request payload for creating a new blog post.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePostRequest {
    pub title: String,
    pub content_markdown: String,
    pub category: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub publish_status: Option<PublishStatus>,
    #[serde(default)]
    pub image_urls: Vec<String>,
}

/// Request payload for updating a blog post.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePostRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_markdown: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub publish_status: Option<PublishStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_urls: Option<Vec<String>>,
}

/// Request payload for listing blog posts.
#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ListPostsRequest {
    #[serde(default)]
    pub limit: Option<i32>,
    #[serde(default)]
    pub next_token: Option<String>,
    #[serde(default)]
    pub category: Option<String>,
    #[serde(default)]
    pub publish_status: Option<PublishStatus>,
}

/// Response for paginated list of posts.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListPostsResponse {
    pub items: Vec<BlogPost>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_token: Option<String>,
}

/// Request payload for user login.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

/// Response containing authentication tokens.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenResponse {
    pub access_token: String,
    pub id_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: i32,
}

/// Request payload for token refresh.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RefreshRequest {
    pub refresh_token: String,
}

/// Request payload for user logout.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogoutRequest {
    pub access_token: String,
}

/// Request payload for getting an upload URL.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetUploadUrlRequest {
    pub file_name: String,
    pub content_type: String,
}

/// Response containing the pre-signed upload URL.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetUploadUrlResponse {
    pub upload_url: String,
    pub file_url: String,
    pub key: String,
}

/// Standard error response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ErrorResponse {
    pub message: String,
}

impl ErrorResponse {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_blog_post_serialization() {
        let post = BlogPost {
            id: "123".to_string(),
            title: "Test Post".to_string(),
            content_markdown: "# Hello".to_string(),
            content_html: "<h1>Hello</h1>".to_string(),
            category: "tech".to_string(),
            tags: vec!["rust".to_string()],
            publish_status: PublishStatus::Draft,
            author_id: "user123".to_string(),
            created_at: "2026-01-03T00:00:00Z".to_string(),
            updated_at: "2026-01-03T00:00:00Z".to_string(),
            published_at: None,
            image_urls: vec![],
        };

        let json = serde_json::to_string(&post).unwrap();
        assert!(json.contains("contentMarkdown"));
        assert!(json.contains("publishStatus"));
    }

    #[test]
    fn test_publish_status_default() {
        assert_eq!(PublishStatus::default(), PublishStatus::Draft);
    }
}
