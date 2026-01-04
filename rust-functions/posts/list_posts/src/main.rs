//! Lambda handler for listing blog posts with pagination.
//!
//! This handler processes GET requests to list blog posts,
//! supporting pagination, category filtering, and publish status filtering.
//!
//! **Requirements covered:**
//! - R6: 記事一覧取得機能
//! - R8: カテゴリ別記事一覧機能
//! - R18: クエリ最適化（GSI使用）
//! - R3.3: ページネーション（limit、nextToken）とフィルタリング（category、publishStatus）

use aws_sdk_dynamodb::types::AttributeValue;
use common::{
    clients::get_dynamodb_client,
    constants::{cors, dynamodb_indexes, pagination, publish_status},
    init_tracing, BlogPost, DomainError, DynamoDbErrorExt, PublishStatus,
};
use lambda_http::{run, service_fn, Body, Error, Request, RequestExt, Response};
use serde::Serialize;
use std::env;

/// Response for paginated list of posts.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListPostsResponse {
    pub items: Vec<PublicBlogPost>,
    pub count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_token: Option<String>,
}

/// Blog post without contentMarkdown for public listing.
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

impl From<BlogPost> for PublicBlogPost {
    fn from(post: BlogPost) -> Self {
        Self {
            id: post.id,
            title: post.title,
            content_html: post.content_html,
            category: post.category,
            tags: post.tags,
            publish_status: post.publish_status,
            author_id: post.author_id,
            created_at: post.created_at,
            updated_at: post.updated_at,
            published_at: post.published_at,
            image_urls: post.image_urls,
        }
    }
}

/// Query parameters for list posts.
#[derive(Debug, Clone, Default)]
pub struct ListPostsParams {
    pub limit: i32,
    pub next_token: Option<String>,
    pub category: Option<String>,
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    init_tracing();
    run(service_fn(handler)).await
}

/// Parses and validates query parameters from the request.
fn parse_query_params(event: &Request) -> ListPostsParams {
    let query = event.query_string_parameters();

    // Parse limit with validation (1-100, default 10)
    let limit = query
        .first("limit")
        .and_then(|l| l.parse::<i32>().ok())
        .map(|l| {
            if (1..=pagination::MAX_LIMIT).contains(&l) {
                l
            } else {
                tracing::warn!(
                    requested_limit = l,
                    default_limit = pagination::DEFAULT_LIMIT,
                    "Limit out of range, using default"
                );
                pagination::DEFAULT_LIMIT
            }
        })
        .unwrap_or(pagination::DEFAULT_LIMIT);

    let next_token = query.first("nextToken").map(|s| s.to_string());
    let category = query.first("category").map(|s| s.to_string());

    ListPostsParams {
        limit,
        next_token,
        category,
    }
}

/// Decodes a next_token from base64 to DynamoDB ExclusiveStartKey.
fn decode_next_token(token: &str) -> Option<std::collections::HashMap<String, AttributeValue>> {
    use base64::{engine::general_purpose::STANDARD, Engine};

    let decoded = STANDARD.decode(token).ok()?;
    let json_str = String::from_utf8(decoded).ok()?;
    let parsed: serde_json::Value = serde_json::from_str(&json_str).ok()?;

    // Convert JSON to DynamoDB AttributeValues
    let obj = parsed.as_object()?;
    let mut key_map = std::collections::HashMap::new();

    for (k, v) in obj {
        if let Some(s) = v.as_str() {
            key_map.insert(k.clone(), AttributeValue::S(s.to_string()));
        }
    }

    if key_map.is_empty() {
        None
    } else {
        Some(key_map)
    }
}

/// Encodes DynamoDB LastEvaluatedKey to base64 next_token.
fn encode_next_token(key: &std::collections::HashMap<String, AttributeValue>) -> String {
    use base64::{engine::general_purpose::STANDARD, Engine};

    let mut map = serde_json::Map::new();
    for (k, v) in key {
        if let Ok(s) = v.as_s() {
            map.insert(k.clone(), serde_json::Value::String(s.clone()));
        }
    }

    let json = serde_json::to_string(&map).unwrap_or_default();
    STANDARD.encode(json.as_bytes())
}

/// Converts a DynamoDB item to a BlogPost.
fn dynamodb_item_to_post(
    item: &std::collections::HashMap<String, AttributeValue>,
) -> Result<BlogPost, DomainError> {
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
    let post_publish_status = match publish_status_str.as_str() {
        "draft" => PublishStatus::Draft,
        "published" => PublishStatus::Published,
        _ => PublishStatus::Draft,
    };

    Ok(BlogPost {
        id: get_string("id")?,
        title: get_string("title")?,
        content_markdown: get_string("contentMarkdown")?,
        content_html: get_string("contentHtml")?,
        category: get_string("category")?,
        tags: get_string_list("tags"),
        publish_status: post_publish_status,
        author_id: get_string("authorId")?,
        created_at: get_string("createdAt")?,
        updated_at: get_string("updatedAt")?,
        published_at: get_optional_string("publishedAt"),
        image_urls: get_string_list("imageUrls"),
    })
}

/// Builds a successful response with the list of posts.
fn build_success_response(response: &ListPostsResponse) -> Response<Body> {
    Response::builder()
        .status(200)
        .header("Content-Type", "application/json")
        .header("Access-Control-Allow-Origin", cors::ALLOW_ORIGIN)
        .header("Access-Control-Allow-Methods", cors::ALLOW_METHODS)
        .header("Access-Control-Allow-Headers", cors::ALLOW_HEADERS)
        .body(Body::from(serde_json::to_string(response).unwrap()))
        .expect("Failed to build response")
}

/// Main handler for listing blog posts.
#[tracing::instrument(skip(event), fields(otel.kind = "server"))]
async fn handler(event: Request) -> Result<Response<Body>, Error> {
    tracing::info!("Received list posts request");

    // Parse query parameters
    let params = parse_query_params(&event);

    tracing::info!(
        limit = params.limit,
        has_next_token = params.next_token.is_some(),
        category = ?params.category,
        "List posts parameters"
    );

    // Get table name from environment
    let table_name = env::var("TABLE_NAME").map_err(|_| {
        tracing::error!("TABLE_NAME environment variable not set");
        DomainError::Internal("Configuration error".to_string())
    })?;

    // Get DynamoDB client
    let client = get_dynamodb_client().await;

    // Build query based on parameters
    let query_result = if let Some(category) = &params.category {
        // Category filter: use CategoryIndex with FilterExpression for publishStatus
        tracing::info!(category = %category, "Querying CategoryIndex");

        let mut query_builder = client
            .query()
            .table_name(&table_name)
            .index_name(dynamodb_indexes::CATEGORY_INDEX)
            .key_condition_expression("category = :category")
            .expression_attribute_values(":category", AttributeValue::S(category.clone()))
            .filter_expression("publishStatus = :publishStatus")
            .expression_attribute_values(
                ":publishStatus",
                AttributeValue::S(publish_status::PUBLISHED.to_string()),
            )
            .limit(params.limit)
            .scan_index_forward(false); // Sort by createdAt descending

        // Add pagination token if provided
        if let Some(ref token) = params.next_token {
            if let Some(exclusive_start_key) = decode_next_token(token) {
                tracing::info!("Using ExclusiveStartKey for pagination");
                for (k, v) in exclusive_start_key {
                    query_builder = query_builder.exclusive_start_key(k, v);
                }
            } else {
                tracing::warn!("Failed to decode nextToken, starting from beginning");
            }
        }

        query_builder.send().await.map_dynamodb_err()?
    } else {
        // No category filter: use PublishStatusIndex
        tracing::info!("Querying PublishStatusIndex");

        let mut query_builder = client
            .query()
            .table_name(&table_name)
            .index_name(dynamodb_indexes::PUBLISH_STATUS_INDEX)
            .key_condition_expression("publishStatus = :publishStatus")
            .expression_attribute_values(
                ":publishStatus",
                AttributeValue::S(publish_status::PUBLISHED.to_string()),
            )
            .limit(params.limit)
            .scan_index_forward(false); // Sort by createdAt descending

        // Add pagination token if provided
        if let Some(ref token) = params.next_token {
            if let Some(exclusive_start_key) = decode_next_token(token) {
                tracing::info!("Using ExclusiveStartKey for pagination");
                for (k, v) in exclusive_start_key {
                    query_builder = query_builder.exclusive_start_key(k, v);
                }
            } else {
                tracing::warn!("Failed to decode nextToken, starting from beginning");
            }
        }

        query_builder.send().await.map_dynamodb_err()?
    };

    // Convert items to PublicBlogPost (without contentMarkdown)
    let items: Vec<PublicBlogPost> = query_result
        .items()
        .iter()
        .filter_map(|item| dynamodb_item_to_post(item).map(PublicBlogPost::from).ok())
        .collect();

    let count = items.len();

    // Generate next token if there are more results
    let next_token = query_result.last_evaluated_key().map(encode_next_token);

    tracing::info!(
        count = count,
        has_more = next_token.is_some(),
        "List posts completed"
    );

    let response = ListPostsResponse {
        items,
        count,
        next_token,
    };

    Ok(build_success_response(&response))
}

#[cfg(test)]
mod tests {
    use super::*;
    use aws_sdk_dynamodb::types::AttributeValue;
    use std::collections::HashMap;

    // Helper to create a sample DynamoDB item
    fn create_sample_dynamodb_item(
        id: &str,
        title: &str,
        status: &str,
    ) -> HashMap<String, AttributeValue> {
        let mut item = HashMap::new();
        item.insert("id".to_string(), AttributeValue::S(id.to_string()));
        item.insert("title".to_string(), AttributeValue::S(title.to_string()));
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
            AttributeValue::S(status.to_string()),
        );
        item.insert(
            "authorId".to_string(),
            AttributeValue::S("user-123".to_string()),
        );
        item.insert(
            "createdAt".to_string(),
            AttributeValue::S("2026-01-03T00:00:00Z".to_string()),
        );
        item.insert(
            "updatedAt".to_string(),
            AttributeValue::S("2026-01-03T00:00:00Z".to_string()),
        );
        item.insert("imageUrls".to_string(), AttributeValue::L(vec![]));
        item
    }

    #[test]
    fn test_dynamodb_item_to_post_success() {
        let item = create_sample_dynamodb_item("post-123", "Test Title", "published");

        let post = dynamodb_item_to_post(&item).unwrap();

        assert_eq!(post.id, "post-123");
        assert_eq!(post.title, "Test Title");
        assert_eq!(post.content_markdown, "# Hello");
        assert_eq!(post.content_html, "<h1>Hello</h1>");
        assert_eq!(post.category, "tech");
        assert_eq!(post.tags, vec!["rust", "aws"]);
        assert_eq!(post.publish_status, PublishStatus::Published);
        assert_eq!(post.author_id, "user-123");
    }

    #[test]
    fn test_dynamodb_item_to_post_draft() {
        let item = create_sample_dynamodb_item("post-456", "Draft Post", "draft");

        let post = dynamodb_item_to_post(&item).unwrap();

        assert_eq!(post.publish_status, PublishStatus::Draft);
    }

    #[test]
    fn test_dynamodb_item_to_post_missing_field() {
        let mut item = HashMap::new();
        item.insert("id".to_string(), AttributeValue::S("post-123".to_string()));
        // Missing required fields

        let result = dynamodb_item_to_post(&item);

        assert!(result.is_err());
        match result.unwrap_err() {
            DomainError::Internal(msg) => {
                assert!(msg.contains("Missing field"));
            }
            _ => panic!("Expected Internal error"),
        }
    }

    #[test]
    fn test_dynamodb_item_to_post_unknown_publish_status_defaults_to_draft() {
        let mut item = create_sample_dynamodb_item("post-789", "Unknown Status", "unknown");
        item.insert(
            "publishStatus".to_string(),
            AttributeValue::S("unknown_status".to_string()),
        );

        let post = dynamodb_item_to_post(&item).unwrap();

        assert_eq!(post.publish_status, PublishStatus::Draft);
    }

    #[test]
    fn test_public_blog_post_excludes_content_markdown() {
        let blog_post = BlogPost {
            id: "post-123".to_string(),
            title: "Test".to_string(),
            content_markdown: "# Secret markdown".to_string(),
            content_html: "<h1>Test</h1>".to_string(),
            category: "tech".to_string(),
            tags: vec![],
            publish_status: PublishStatus::Published,
            author_id: "user-123".to_string(),
            created_at: "2026-01-03T00:00:00Z".to_string(),
            updated_at: "2026-01-03T00:00:00Z".to_string(),
            published_at: None,
            image_urls: vec![],
        };

        let public_post = PublicBlogPost::from(blog_post);
        let json = serde_json::to_string(&public_post).unwrap();

        // Should NOT contain contentMarkdown
        assert!(!json.contains("contentMarkdown"));
        assert!(!json.contains("Secret markdown"));
        // Should contain contentHtml
        assert!(json.contains("contentHtml"));
    }

    #[test]
    fn test_encode_decode_next_token_roundtrip() {
        let mut key = HashMap::new();
        key.insert("id".to_string(), AttributeValue::S("post-123".to_string()));
        key.insert(
            "publishStatus".to_string(),
            AttributeValue::S("published".to_string()),
        );
        key.insert(
            "createdAt".to_string(),
            AttributeValue::S("2026-01-03T00:00:00Z".to_string()),
        );

        let encoded = encode_next_token(&key);
        let decoded = decode_next_token(&encoded).unwrap();

        assert_eq!(decoded.get("id").unwrap().as_s().unwrap(), "post-123");
        assert_eq!(
            decoded.get("publishStatus").unwrap().as_s().unwrap(),
            "published"
        );
        assert_eq!(
            decoded.get("createdAt").unwrap().as_s().unwrap(),
            "2026-01-03T00:00:00Z"
        );
    }

    #[test]
    fn test_decode_next_token_invalid_base64() {
        let result = decode_next_token("not_valid_base64!!!");
        assert!(result.is_none());
    }

    #[test]
    fn test_decode_next_token_invalid_json() {
        use base64::{engine::general_purpose::STANDARD, Engine};
        let invalid_json = STANDARD.encode(b"not json at all");

        let result = decode_next_token(&invalid_json);
        assert!(result.is_none());
    }

    #[test]
    fn test_decode_next_token_empty_object() {
        use base64::{engine::general_purpose::STANDARD, Engine};
        let empty_json = STANDARD.encode(b"{}");

        let result = decode_next_token(&empty_json);
        assert!(result.is_none());
    }

    #[test]
    fn test_list_posts_response_serialization() {
        let response = ListPostsResponse {
            items: vec![PublicBlogPost {
                id: "post-1".to_string(),
                title: "Test".to_string(),
                content_html: "<p>Test</p>".to_string(),
                category: "tech".to_string(),
                tags: vec!["rust".to_string()],
                publish_status: PublishStatus::Published,
                author_id: "user-1".to_string(),
                created_at: "2026-01-03T00:00:00Z".to_string(),
                updated_at: "2026-01-03T00:00:00Z".to_string(),
                published_at: Some("2026-01-03T00:00:00Z".to_string()),
                image_urls: vec![],
            }],
            count: 1,
            next_token: Some("abc123".to_string()),
        };

        let json = serde_json::to_string(&response).unwrap();

        assert!(json.contains("\"items\""));
        assert!(json.contains("\"count\":1"));
        assert!(json.contains("\"nextToken\":\"abc123\""));
    }

    #[test]
    fn test_list_posts_response_without_next_token() {
        let response = ListPostsResponse {
            items: vec![],
            count: 0,
            next_token: None,
        };

        let json = serde_json::to_string(&response).unwrap();

        assert!(json.contains("\"items\":[]"));
        assert!(json.contains("\"count\":0"));
        // nextToken should not be present when None
        assert!(!json.contains("nextToken"));
    }

    #[test]
    fn test_build_success_response_status_code() {
        let response = ListPostsResponse {
            items: vec![],
            count: 0,
            next_token: None,
        };

        let http_response = build_success_response(&response);

        assert_eq!(http_response.status(), 200);
    }

    #[test]
    fn test_build_success_response_cors_headers() {
        let response = ListPostsResponse {
            items: vec![],
            count: 0,
            next_token: None,
        };

        let http_response = build_success_response(&response);

        assert_eq!(
            http_response.headers().get("Content-Type").unwrap(),
            "application/json"
        );
        assert_eq!(
            http_response
                .headers()
                .get("Access-Control-Allow-Origin")
                .unwrap(),
            "*"
        );
        assert!(http_response
            .headers()
            .contains_key("Access-Control-Allow-Methods"));
        assert!(http_response
            .headers()
            .contains_key("Access-Control-Allow-Headers"));
    }

    #[test]
    fn test_list_posts_params_default() {
        let params = ListPostsParams::default();

        assert_eq!(params.limit, 0); // Default from derive
        assert!(params.next_token.is_none());
        assert!(params.category.is_none());
    }

    #[test]
    fn test_dynamodb_item_to_post_with_published_at() {
        let mut item = create_sample_dynamodb_item("post-123", "Test", "published");
        item.insert(
            "publishedAt".to_string(),
            AttributeValue::S("2026-01-03T12:00:00Z".to_string()),
        );

        let post = dynamodb_item_to_post(&item).unwrap();

        assert_eq!(post.published_at, Some("2026-01-03T12:00:00Z".to_string()));
    }

    #[test]
    fn test_dynamodb_item_to_post_with_image_urls() {
        let mut item = create_sample_dynamodb_item("post-123", "Test", "published");
        item.insert(
            "imageUrls".to_string(),
            AttributeValue::L(vec![
                AttributeValue::S("https://example.com/img1.png".to_string()),
                AttributeValue::S("https://example.com/img2.png".to_string()),
            ]),
        );

        let post = dynamodb_item_to_post(&item).unwrap();

        assert_eq!(post.image_urls.len(), 2);
        assert_eq!(post.image_urls[0], "https://example.com/img1.png");
        assert_eq!(post.image_urls[1], "https://example.com/img2.png");
    }
}
