//! Lambda handler for retrieving a public blog post.
//!
//! This handler processes GET requests to retrieve published blog posts.
//! Only published posts are returned; draft posts return 404.
//! The contentMarkdown field is excluded from the response.

use aws_sdk_dynamodb::types::AttributeValue;
use common::{
    clients::get_dynamodb_client,
    constants::cors,
    init_tracing, DomainError, DynamoDbErrorExt, PublishStatus,
};
use lambda_http::{run, service_fn, Body, Error, Request, RequestExt, Response};
use serde::Serialize;
use std::env;

#[tokio::main]
async fn main() -> Result<(), Error> {
    init_tracing();
    run(service_fn(handler)).await
}

/// Public blog post without contentMarkdown (for public API).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicBlogPost {
    pub id: String,
    pub title: String,
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

/// Extracts the post ID from path parameters.
fn get_post_id(event: &Request) -> Option<String> {
    event
        .path_parameters()
        .first("id")
        .map(|s| s.to_string())
}

/// Converts DynamoDB item to PublicBlogPost (without contentMarkdown).
fn dynamodb_item_to_public_post(
    item: &std::collections::HashMap<String, AttributeValue>,
) -> Result<PublicBlogPost, DomainError> {
    let get_string = |key: &str| -> Result<String, DomainError> {
        item.get(key)
            .and_then(|v| v.as_s().ok())
            .map(|s| s.to_string())
            .ok_or_else(|| DomainError::Internal(format!("Missing field: {}", key)))
    };

    let get_optional_string = |key: &str| -> Option<String> {
        item.get(key)
            .and_then(|v| v.as_s().ok())
            .map(|s| s.to_string())
    };

    let get_string_list = |key: &str| -> Vec<String> {
        item.get(key)
            .and_then(|v| v.as_l().ok())
            .map(|list| {
                list.iter()
                    .filter_map(|v| v.as_s().ok().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default()
    };

    let publish_status_str = get_string("publishStatus")?;
    let publish_status = match publish_status_str.as_str() {
        "draft" => PublishStatus::Draft,
        "published" => PublishStatus::Published,
        _ => PublishStatus::Draft,
    };

    Ok(PublicBlogPost {
        id: get_string("id")?,
        title: get_string("title")?,
        content_html: get_string("contentHtml")?,
        category: get_string("category")?,
        tags: get_string_list("tags"),
        publish_status,
        author_id: get_string("authorId")?,
        created_at: get_string("createdAt")?,
        updated_at: get_string("updatedAt")?,
        published_at: get_optional_string("publishedAt"),
        image_urls: get_string_list("imageUrls"),
    })
}

/// Builds a successful response with the public blog post.
fn build_success_response(post: &PublicBlogPost) -> Response<Body> {
    Response::builder()
        .status(200)
        .header("Content-Type", "application/json")
        .header("Access-Control-Allow-Origin", cors::ALLOW_ORIGIN)
        .header("Access-Control-Allow-Methods", cors::ALLOW_METHODS)
        .header("Access-Control-Allow-Headers", cors::ALLOW_HEADERS)
        .body(Body::from(serde_json::to_string(post).unwrap()))
        .expect("Failed to build response")
}

/// Main handler for retrieving public blog posts.
#[tracing::instrument(skip(event), fields(otel.kind = "server"))]
async fn handler(event: Request) -> Result<Response<Body>, Error> {
    tracing::info!("Received get public post request");

    // Extract post ID from path parameters
    let post_id = match get_post_id(&event) {
        Some(id) if !id.trim().is_empty() => id,
        _ => {
            tracing::warn!("Post ID not provided or empty");
            return Ok(
                DomainError::Validation("記事IDが指定されていません".to_string()).into_response(),
            );
        }
    };

    tracing::info!(post_id = %post_id, "Retrieving public post");

    // Get table name from environment
    let table_name = env::var("TABLE_NAME").map_err(|_| {
        tracing::error!("TABLE_NAME environment variable not set");
        DomainError::Internal("Configuration error".to_string())
    })?;

    // Get post from DynamoDB
    let client = get_dynamodb_client().await;

    let result = client
        .get_item()
        .table_name(&table_name)
        .key("id", AttributeValue::S(post_id.clone()))
        .send()
        .await
        .map_dynamodb_err()?;

    // Check if post exists
    let item = match result.item {
        Some(item) => item,
        None => {
            tracing::warn!(post_id = %post_id, "Post not found");
            return Ok(
                DomainError::NotFound("記事が見つかりません".to_string()).into_response(),
            );
        }
    };

    // Convert to PublicBlogPost
    let post = dynamodb_item_to_public_post(&item)?;

    // Only return published posts
    if post.publish_status == PublishStatus::Draft {
        tracing::warn!(post_id = %post_id, "Access attempt to draft post");
        return Ok(
            DomainError::NotFound("記事が見つかりません".to_string()).into_response(),
        );
    }

    tracing::info!(post_id = %post_id, "Public post retrieved successfully");

    Ok(build_success_response(&post))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_item(publish_status: &str) -> std::collections::HashMap<String, AttributeValue> {
        let mut item = std::collections::HashMap::new();
        item.insert("id".to_string(), AttributeValue::S("post-123".to_string()));
        item.insert(
            "title".to_string(),
            AttributeValue::S("Test Title".to_string()),
        );
        item.insert(
            "contentMarkdown".to_string(),
            AttributeValue::S("# Hello".to_string()),
        );
        item.insert(
            "contentHtml".to_string(),
            AttributeValue::S("<h1>Hello</h1>".to_string()),
        );
        item.insert(
            "category".to_string(),
            AttributeValue::S("tech".to_string()),
        );
        item.insert(
            "tags".to_string(),
            AttributeValue::L(vec![
                AttributeValue::S("rust".to_string()),
                AttributeValue::S("aws".to_string()),
            ]),
        );
        item.insert(
            "publishStatus".to_string(),
            AttributeValue::S(publish_status.to_string()),
        );
        item.insert(
            "authorId".to_string(),
            AttributeValue::S("user-456".to_string()),
        );
        item.insert(
            "createdAt".to_string(),
            AttributeValue::S("2026-01-03T00:00:00Z".to_string()),
        );
        item.insert(
            "updatedAt".to_string(),
            AttributeValue::S("2026-01-03T00:00:00Z".to_string()),
        );
        item.insert(
            "publishedAt".to_string(),
            AttributeValue::S("2026-01-03T00:00:00Z".to_string()),
        );
        item.insert("imageUrls".to_string(), AttributeValue::L(vec![]));
        item
    }

    #[test]
    fn test_dynamodb_item_to_public_post_success() {
        let item = create_test_item("published");
        let post = dynamodb_item_to_public_post(&item).unwrap();

        assert_eq!(post.id, "post-123");
        assert_eq!(post.title, "Test Title");
        assert_eq!(post.content_html, "<h1>Hello</h1>");
        assert_eq!(post.category, "tech");
        assert_eq!(post.tags, vec!["rust", "aws"]);
        assert_eq!(post.publish_status, PublishStatus::Published);
        assert_eq!(post.author_id, "user-456");
        assert_eq!(post.published_at, Some("2026-01-03T00:00:00Z".to_string()));
    }

    #[test]
    fn test_dynamodb_item_to_public_post_excludes_content_markdown() {
        let item = create_test_item("published");
        let post = dynamodb_item_to_public_post(&item).unwrap();

        // Serialize and check that contentMarkdown is not in the output
        let json = serde_json::to_string(&post).unwrap();
        assert!(!json.contains("contentMarkdown"));
        assert!(json.contains("contentHtml"));
    }

    #[test]
    fn test_dynamodb_item_to_public_post_draft() {
        let item = create_test_item("draft");
        let post = dynamodb_item_to_public_post(&item).unwrap();

        assert_eq!(post.publish_status, PublishStatus::Draft);
    }

    #[test]
    fn test_dynamodb_item_to_public_post_missing_field() {
        let mut item = std::collections::HashMap::new();
        item.insert("id".to_string(), AttributeValue::S("post-123".to_string()));
        // Missing required fields

        let result = dynamodb_item_to_public_post(&item);

        assert!(result.is_err());
        match result.unwrap_err() {
            DomainError::Internal(msg) => {
                assert!(msg.contains("Missing field"));
            }
            _ => panic!("Expected Internal error"),
        }
    }

    #[test]
    fn test_dynamodb_item_to_public_post_with_image_urls() {
        let mut item = create_test_item("published");
        item.insert(
            "imageUrls".to_string(),
            AttributeValue::L(vec![
                AttributeValue::S("https://example.com/img1.png".to_string()),
                AttributeValue::S("https://example.com/img2.png".to_string()),
            ]),
        );

        let post = dynamodb_item_to_public_post(&item).unwrap();

        assert_eq!(post.image_urls.len(), 2);
        assert_eq!(post.image_urls[0], "https://example.com/img1.png");
        assert_eq!(post.image_urls[1], "https://example.com/img2.png");
    }

    #[test]
    fn test_build_success_response() {
        let post = PublicBlogPost {
            id: "post-123".to_string(),
            title: "Test Title".to_string(),
            content_html: "<h1>Hello</h1>".to_string(),
            category: "tech".to_string(),
            tags: vec![],
            publish_status: PublishStatus::Published,
            author_id: "user-456".to_string(),
            created_at: "2026-01-03T00:00:00Z".to_string(),
            updated_at: "2026-01-03T00:00:00Z".to_string(),
            published_at: None,
            image_urls: vec![],
        };

        let response = build_success_response(&post);

        assert_eq!(response.status(), 200);
        assert_eq!(
            response.headers().get("Content-Type").unwrap(),
            "application/json"
        );
        assert_eq!(
            response.headers().get("Access-Control-Allow-Origin").unwrap(),
            "*"
        );
    }

    #[test]
    fn test_build_success_response_cors_headers() {
        let post = PublicBlogPost {
            id: "post-123".to_string(),
            title: "Test Title".to_string(),
            content_html: "<h1>Hello</h1>".to_string(),
            category: "tech".to_string(),
            tags: vec![],
            publish_status: PublishStatus::Published,
            author_id: "user-456".to_string(),
            created_at: "2026-01-03T00:00:00Z".to_string(),
            updated_at: "2026-01-03T00:00:00Z".to_string(),
            published_at: None,
            image_urls: vec![],
        };

        let response = build_success_response(&post);

        assert!(response.headers().contains_key("Access-Control-Allow-Methods"));
        assert!(response.headers().contains_key("Access-Control-Allow-Headers"));
    }

    #[test]
    fn test_dynamodb_item_to_public_post_empty_tags() {
        let mut item = create_test_item("published");
        item.remove("tags");

        let post = dynamodb_item_to_public_post(&item).unwrap();

        assert!(post.tags.is_empty());
    }

    #[test]
    fn test_dynamodb_item_to_public_post_unknown_status_defaults_to_draft() {
        let mut item = create_test_item("unknown_status");
        item.insert(
            "publishStatus".to_string(),
            AttributeValue::S("unknown_status".to_string()),
        );

        let post = dynamodb_item_to_public_post(&item).unwrap();

        assert_eq!(post.publish_status, PublishStatus::Draft);
    }

    #[test]
    fn test_public_blog_post_serialization_format() {
        let post = PublicBlogPost {
            id: "post-123".to_string(),
            title: "Test Title".to_string(),
            content_html: "<h1>Hello</h1>".to_string(),
            category: "tech".to_string(),
            tags: vec!["rust".to_string()],
            publish_status: PublishStatus::Published,
            author_id: "user-456".to_string(),
            created_at: "2026-01-03T00:00:00Z".to_string(),
            updated_at: "2026-01-03T00:00:00Z".to_string(),
            published_at: Some("2026-01-03T00:00:00Z".to_string()),
            image_urls: vec![],
        };

        let json = serde_json::to_string(&post).unwrap();

        // Check camelCase serialization
        assert!(json.contains("contentHtml"));
        assert!(json.contains("publishStatus"));
        assert!(json.contains("authorId"));
        assert!(json.contains("createdAt"));
        assert!(json.contains("updatedAt"));
        assert!(json.contains("publishedAt"));
        assert!(json.contains("imageUrls"));
    }

    #[test]
    fn test_public_blog_post_skips_none_published_at() {
        let post = PublicBlogPost {
            id: "post-123".to_string(),
            title: "Test Title".to_string(),
            content_html: "<h1>Hello</h1>".to_string(),
            category: "tech".to_string(),
            tags: vec![],
            publish_status: PublishStatus::Draft,
            author_id: "user-456".to_string(),
            created_at: "2026-01-03T00:00:00Z".to_string(),
            updated_at: "2026-01-03T00:00:00Z".to_string(),
            published_at: None,
            image_urls: vec![],
        };

        let json = serde_json::to_string(&post).unwrap();

        // publishedAt should be skipped when None
        assert!(!json.contains("publishedAt"));
    }
}
