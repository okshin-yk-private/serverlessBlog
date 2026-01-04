//! Lambda handler for updating a blog post.
//!
//! This handler processes PUT requests to update existing blog posts,
//! validating input, converting Markdown to HTML when content changes,
//! and persisting to DynamoDB.
//!
//! Requirements R3, R4: 記事更新・公開機能
//! - 記事コンテンツの部分更新（title, contentMarkdown, category, tags, imageUrls）
//! - contentMarkdown更新時のcontentHTML自動変換
//! - 公開ステータス遷移（draft → published: publishedAt自動設定）
//! - updatedAtの自動更新

use aws_sdk_dynamodb::types::AttributeValue;
use chrono::Utc;
use common::{
    clients::get_dynamodb_client, constants::cors, init_tracing, markdown_to_safe_html, BlogPost,
    DomainError, DynamoDbErrorExt, PublishStatus, UpdatePostRequest,
};
use lambda_http::{run, service_fn, Body, Error, Request, RequestExt, RequestPayloadExt, Response};
use std::env;

#[tokio::main]
async fn main() -> Result<(), Error> {
    init_tracing();
    run(service_fn(handler)).await
}

/// Extracts the author ID from Cognito claims in the request context.
fn get_user_id(event: &Request) -> Option<String> {
    let context = event.request_context();
    match context {
        lambda_http::request::RequestContext::ApiGatewayV1(ctx) => ctx
            .authorizer
            .fields
            .get("claims")
            .and_then(|claims| claims.get("sub"))
            .and_then(|sub| sub.as_str())
            .map(String::from),
        lambda_http::request::RequestContext::ApiGatewayV2(ctx) => ctx
            .authorizer
            .as_ref()
            .and_then(|auth| auth.jwt.as_ref())
            .and_then(|jwt| jwt.claims.get("sub"))
            .map(|s| s.to_string()),
        _ => None,
    }
}

/// Extracts the post ID from path parameters.
fn get_post_id(event: &Request) -> Option<String> {
    event.path_parameters().first("id").map(|s| s.to_string())
}

/// Validates the update post request.
fn validate_request(request: &UpdatePostRequest) -> Result<(), DomainError> {
    // If title is provided, it must not be empty
    if let Some(ref title) = request.title {
        if title.trim().is_empty() {
            return Err(DomainError::Validation("title cannot be empty".to_string()));
        }
    }

    // If contentMarkdown is provided, it must not be empty
    if let Some(ref content_markdown) = request.content_markdown {
        if content_markdown.trim().is_empty() {
            return Err(DomainError::Validation(
                "contentMarkdown cannot be empty".to_string(),
            ));
        }
    }

    // If category is provided, it must not be empty
    if let Some(ref category) = request.category {
        if category.trim().is_empty() {
            return Err(DomainError::Validation(
                "category cannot be empty".to_string(),
            ));
        }
    }

    Ok(())
}

/// Converts DynamoDB item to BlogPost.
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
    let publish_status = match publish_status_str.as_str() {
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
        publish_status,
        author_id: get_string("authorId")?,
        created_at: get_string("createdAt")?,
        updated_at: get_string("updatedAt")?,
        published_at: get_optional_string("publishedAt"),
        image_urls: get_string_list("imageUrls"),
    })
}

/// Converts a BlogPost to DynamoDB attribute values.
fn post_to_dynamodb_item(post: &BlogPost) -> std::collections::HashMap<String, AttributeValue> {
    let mut item = std::collections::HashMap::new();

    item.insert("id".to_string(), AttributeValue::S(post.id.clone()));
    item.insert("title".to_string(), AttributeValue::S(post.title.clone()));
    item.insert(
        "contentMarkdown".to_string(),
        AttributeValue::S(post.content_markdown.clone()),
    );
    item.insert(
        "contentHtml".to_string(),
        AttributeValue::S(post.content_html.clone()),
    );
    item.insert(
        "category".to_string(),
        AttributeValue::S(post.category.clone()),
    );
    item.insert(
        "tags".to_string(),
        AttributeValue::L(
            post.tags
                .iter()
                .map(|t| AttributeValue::S(t.clone()))
                .collect(),
        ),
    );
    item.insert(
        "publishStatus".to_string(),
        AttributeValue::S(match post.publish_status {
            PublishStatus::Draft => "draft".to_string(),
            PublishStatus::Published => "published".to_string(),
        }),
    );
    item.insert(
        "authorId".to_string(),
        AttributeValue::S(post.author_id.clone()),
    );
    item.insert(
        "createdAt".to_string(),
        AttributeValue::S(post.created_at.clone()),
    );
    item.insert(
        "updatedAt".to_string(),
        AttributeValue::S(post.updated_at.clone()),
    );

    if let Some(ref published_at) = post.published_at {
        item.insert(
            "publishedAt".to_string(),
            AttributeValue::S(published_at.clone()),
        );
    }

    item.insert(
        "imageUrls".to_string(),
        AttributeValue::L(
            post.image_urls
                .iter()
                .map(|url| AttributeValue::S(url.clone()))
                .collect(),
        ),
    );

    item
}

/// Applies updates from the request to the existing post.
fn apply_updates(existing: &BlogPost, request: &UpdatePostRequest, now: &str) -> BlogPost {
    let mut updated = existing.clone();
    updated.updated_at = now.to_string();

    // Apply title update
    if let Some(ref title) = request.title {
        updated.title = title.trim().to_string();
    }

    // Apply contentMarkdown update with HTML conversion
    if let Some(ref content_markdown) = request.content_markdown {
        updated.content_markdown = content_markdown.trim().to_string();
        updated.content_html = markdown_to_safe_html(&updated.content_markdown);
    }

    // Apply category update
    if let Some(ref category) = request.category {
        updated.category = category.trim().to_string();
    }

    // Apply tags update
    if let Some(ref tags) = request.tags {
        updated.tags = tags.clone();
    }

    // Apply imageUrls update
    if let Some(ref image_urls) = request.image_urls {
        updated.image_urls = image_urls.clone();
    }

    // Apply publishStatus update with publishedAt handling
    if let Some(ref publish_status) = request.publish_status {
        // If transitioning from draft to published, set publishedAt
        if existing.publish_status == PublishStatus::Draft
            && *publish_status == PublishStatus::Published
            && existing.published_at.is_none()
        {
            updated.published_at = Some(now.to_string());
        }
        updated.publish_status = publish_status.clone();
    }

    updated
}

/// Builds a successful response with the updated blog post.
fn build_success_response(post: &BlogPost) -> Response<Body> {
    Response::builder()
        .status(200)
        .header("Content-Type", "application/json")
        .header("Access-Control-Allow-Origin", cors::ALLOW_ORIGIN)
        .header("Access-Control-Allow-Methods", cors::ALLOW_METHODS)
        .header("Access-Control-Allow-Headers", cors::ALLOW_HEADERS)
        .body(Body::from(serde_json::to_string(post).unwrap()))
        .expect("Failed to build response")
}

/// Main handler for updating blog posts.
#[tracing::instrument(skip(event), fields(otel.kind = "server"))]
async fn handler(event: Request) -> Result<Response<Body>, Error> {
    tracing::info!("Received update post request");

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

    tracing::info!(post_id = %post_id, "Updating post");

    // Check authentication
    if get_user_id(&event).is_none() {
        tracing::warn!("Authentication required");
        return Ok(DomainError::Unauthorized("認証が必要です".to_string()).into_response());
    }

    // Parse request body
    let request: UpdatePostRequest = match event.payload() {
        Ok(Some(req)) => req,
        Ok(None) => {
            tracing::warn!("Request body is empty");
            return Ok(
                DomainError::Validation("リクエストボディが必要です".to_string()).into_response(),
            );
        }
        Err(e) => {
            tracing::warn!(error = %e, "Failed to parse request body");
            return Ok(DomainError::Validation("無効なJSON形式です".to_string()).into_response());
        }
    };

    tracing::info!("Parsed update post request");

    // Validate request
    if let Err(e) = validate_request(&request) {
        tracing::warn!(error = %e, "Validation failed");
        return Ok(e.into_response());
    }

    // Get table name from environment
    let table_name = env::var("TABLE_NAME").map_err(|_| {
        tracing::error!("TABLE_NAME environment variable not set");
        DomainError::Internal("Configuration error".to_string())
    })?;

    // Get existing post from DynamoDB
    let client = get_dynamodb_client().await;

    tracing::info!(post_id = %post_id, table_name = %table_name, "Fetching existing post from DynamoDB");

    let get_result = client
        .get_item()
        .table_name(&table_name)
        .key("id", AttributeValue::S(post_id.clone()))
        .send()
        .await
        .map_dynamodb_err()?;

    // Check if post exists
    let existing_item = match get_result.item {
        Some(item) => item,
        None => {
            tracing::warn!(post_id = %post_id, "Post not found");
            return Ok(DomainError::NotFound("記事が見つかりません".to_string()).into_response());
        }
    };

    // Convert to BlogPost
    let existing_post = dynamodb_item_to_post(&existing_item)?;

    // Apply updates
    let now = Utc::now().to_rfc3339();
    let updated_post = apply_updates(&existing_post, &request, &now);

    // Save to DynamoDB
    let item = post_to_dynamodb_item(&updated_post);

    tracing::info!(post_id = %post_id, "Saving updated post to DynamoDB");

    client
        .put_item()
        .table_name(&table_name)
        .set_item(Some(item))
        .send()
        .await
        .map_dynamodb_err()?;

    tracing::info!(post_id = %post_id, "Post updated successfully");

    Ok(build_success_response(&updated_post))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_request_success() {
        let request = UpdatePostRequest {
            title: Some("Updated Title".to_string()),
            content_markdown: Some("# Updated Content".to_string()),
            category: Some("tech".to_string()),
            tags: Some(vec!["rust".to_string()]),
            publish_status: Some(PublishStatus::Draft),
            image_urls: None,
        };

        assert!(validate_request(&request).is_ok());
    }

    #[test]
    fn test_validate_request_empty_title() {
        let request = UpdatePostRequest {
            title: Some("".to_string()),
            content_markdown: None,
            category: None,
            tags: None,
            publish_status: None,
            image_urls: None,
        };

        let result = validate_request(&request);
        assert!(result.is_err());
        match result.unwrap_err() {
            DomainError::Validation(msg) => {
                assert!(msg.contains("title"));
            }
            _ => panic!("Expected Validation error"),
        }
    }

    #[test]
    fn test_validate_request_whitespace_title() {
        let request = UpdatePostRequest {
            title: Some("   ".to_string()),
            content_markdown: None,
            category: None,
            tags: None,
            publish_status: None,
            image_urls: None,
        };

        let result = validate_request(&request);
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_request_empty_content() {
        let request = UpdatePostRequest {
            title: None,
            content_markdown: Some("".to_string()),
            category: None,
            tags: None,
            publish_status: None,
            image_urls: None,
        };

        let result = validate_request(&request);
        assert!(result.is_err());
        match result.unwrap_err() {
            DomainError::Validation(msg) => {
                assert!(msg.contains("contentMarkdown"));
            }
            _ => panic!("Expected Validation error"),
        }
    }

    #[test]
    fn test_validate_request_empty_category() {
        let request = UpdatePostRequest {
            title: None,
            content_markdown: None,
            category: Some("".to_string()),
            tags: None,
            publish_status: None,
            image_urls: None,
        };

        let result = validate_request(&request);
        assert!(result.is_err());
        match result.unwrap_err() {
            DomainError::Validation(msg) => {
                assert!(msg.contains("category"));
            }
            _ => panic!("Expected Validation error"),
        }
    }

    #[test]
    fn test_validate_request_no_fields() {
        let request = UpdatePostRequest {
            title: None,
            content_markdown: None,
            category: None,
            tags: None,
            publish_status: None,
            image_urls: None,
        };

        // Empty update request is valid (no fields to update)
        assert!(validate_request(&request).is_ok());
    }

    #[test]
    fn test_apply_updates_title_only() {
        let existing = create_test_post();
        let request = UpdatePostRequest {
            title: Some("New Title".to_string()),
            content_markdown: None,
            category: None,
            tags: None,
            publish_status: None,
            image_urls: None,
        };

        let updated = apply_updates(&existing, &request, "2026-01-03T12:00:00Z");

        assert_eq!(updated.title, "New Title");
        assert_eq!(updated.content_markdown, existing.content_markdown);
        assert_eq!(updated.category, existing.category);
        assert_eq!(updated.updated_at, "2026-01-03T12:00:00Z");
    }

    #[test]
    fn test_apply_updates_content_markdown() {
        let existing = create_test_post();
        let request = UpdatePostRequest {
            title: None,
            content_markdown: Some("# New Content".to_string()),
            category: None,
            tags: None,
            publish_status: None,
            image_urls: None,
        };

        let updated = apply_updates(&existing, &request, "2026-01-03T12:00:00Z");

        assert_eq!(updated.content_markdown, "# New Content");
        assert!(updated.content_html.contains("<h1>"));
        assert!(updated.content_html.contains("New Content"));
    }

    #[test]
    fn test_apply_updates_publish_status_draft_to_published() {
        let existing = create_test_post();
        let request = UpdatePostRequest {
            title: None,
            content_markdown: None,
            category: None,
            tags: None,
            publish_status: Some(PublishStatus::Published),
            image_urls: None,
        };

        let updated = apply_updates(&existing, &request, "2026-01-03T12:00:00Z");

        assert_eq!(updated.publish_status, PublishStatus::Published);
        assert_eq!(
            updated.published_at,
            Some("2026-01-03T12:00:00Z".to_string())
        );
    }

    #[test]
    fn test_apply_updates_publish_status_no_published_at_if_already_set() {
        let mut existing = create_test_post();
        existing.published_at = Some("2026-01-01T00:00:00Z".to_string());
        existing.publish_status = PublishStatus::Published;

        let request = UpdatePostRequest {
            title: None,
            content_markdown: None,
            category: None,
            tags: None,
            publish_status: Some(PublishStatus::Published),
            image_urls: None,
        };

        let updated = apply_updates(&existing, &request, "2026-01-03T12:00:00Z");

        // publishedAt should not be updated if already set
        assert_eq!(
            updated.published_at,
            Some("2026-01-01T00:00:00Z".to_string())
        );
    }

    #[test]
    fn test_apply_updates_tags() {
        let existing = create_test_post();
        let request = UpdatePostRequest {
            title: None,
            content_markdown: None,
            category: None,
            tags: Some(vec!["new-tag".to_string(), "another-tag".to_string()]),
            publish_status: None,
            image_urls: None,
        };

        let updated = apply_updates(&existing, &request, "2026-01-03T12:00:00Z");

        assert_eq!(updated.tags, vec!["new-tag", "another-tag"]);
    }

    #[test]
    fn test_apply_updates_image_urls() {
        let existing = create_test_post();
        let request = UpdatePostRequest {
            title: None,
            content_markdown: None,
            category: None,
            tags: None,
            publish_status: None,
            image_urls: Some(vec!["https://example.com/new-image.png".to_string()]),
        };

        let updated = apply_updates(&existing, &request, "2026-01-03T12:00:00Z");

        assert_eq!(
            updated.image_urls,
            vec!["https://example.com/new-image.png"]
        );
    }

    #[test]
    fn test_apply_updates_multiple_fields() {
        let existing = create_test_post();
        let request = UpdatePostRequest {
            title: Some("Updated Title".to_string()),
            content_markdown: Some("# Updated Content".to_string()),
            category: Some("new-category".to_string()),
            tags: Some(vec!["updated".to_string()]),
            publish_status: Some(PublishStatus::Published),
            image_urls: Some(vec!["https://example.com/img.png".to_string()]),
        };

        let updated = apply_updates(&existing, &request, "2026-01-03T12:00:00Z");

        assert_eq!(updated.title, "Updated Title");
        assert_eq!(updated.content_markdown, "# Updated Content");
        assert_eq!(updated.category, "new-category");
        assert_eq!(updated.tags, vec!["updated"]);
        assert_eq!(updated.publish_status, PublishStatus::Published);
        assert_eq!(
            updated.published_at,
            Some("2026-01-03T12:00:00Z".to_string())
        );
        assert_eq!(updated.image_urls, vec!["https://example.com/img.png"]);
    }

    #[test]
    fn test_dynamodb_item_to_post_success() {
        let mut item = create_test_dynamodb_item();
        item.insert(
            "publishedAt".to_string(),
            AttributeValue::S("2026-01-02T00:00:00Z".to_string()),
        );

        let post = dynamodb_item_to_post(&item).unwrap();

        assert_eq!(post.id, "post-123");
        assert_eq!(post.title, "Test Title");
        assert_eq!(post.content_markdown, "# Hello");
        assert_eq!(post.content_html, "<h1>Hello</h1>");
        assert_eq!(post.category, "tech");
        assert_eq!(post.tags, vec!["rust", "aws"]);
        assert_eq!(post.publish_status, PublishStatus::Draft);
        assert_eq!(post.author_id, "user-456");
        assert_eq!(post.published_at, Some("2026-01-02T00:00:00Z".to_string()));
    }

    #[test]
    fn test_dynamodb_item_to_post_missing_field() {
        let mut item = std::collections::HashMap::new();
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
    fn test_post_to_dynamodb_item() {
        let post = create_test_post();
        let item = post_to_dynamodb_item(&post);

        assert_eq!(item.get("id").unwrap().as_s().unwrap(), "post-123");
        assert_eq!(item.get("title").unwrap().as_s().unwrap(), "Test Title");
        assert_eq!(item.get("publishStatus").unwrap().as_s().unwrap(), "draft");
        assert!(item.get("publishedAt").is_none()); // None should not be in the item
    }

    #[test]
    fn test_post_to_dynamodb_item_with_published_at() {
        let mut post = create_test_post();
        post.published_at = Some("2026-01-02T00:00:00Z".to_string());
        post.publish_status = PublishStatus::Published;

        let item = post_to_dynamodb_item(&post);

        assert_eq!(
            item.get("publishStatus").unwrap().as_s().unwrap(),
            "published"
        );
        assert_eq!(
            item.get("publishedAt").unwrap().as_s().unwrap(),
            "2026-01-02T00:00:00Z"
        );
    }

    #[test]
    fn test_build_success_response() {
        let post = create_test_post();
        let response = build_success_response(&post);

        assert_eq!(response.status(), 200);
        assert_eq!(
            response.headers().get("Content-Type").unwrap(),
            "application/json"
        );
        assert_eq!(
            response
                .headers()
                .get("Access-Control-Allow-Origin")
                .unwrap(),
            "*"
        );
    }

    // Helper function to create a test BlogPost
    fn create_test_post() -> BlogPost {
        BlogPost {
            id: "post-123".to_string(),
            title: "Test Title".to_string(),
            content_markdown: "# Hello World".to_string(),
            content_html: "<h1>Hello World</h1>".to_string(),
            category: "tech".to_string(),
            tags: vec!["rust".to_string()],
            publish_status: PublishStatus::Draft,
            author_id: "user-456".to_string(),
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: "2026-01-01T00:00:00Z".to_string(),
            published_at: None,
            image_urls: vec![],
        }
    }

    // Helper function to create a test DynamoDB item
    fn create_test_dynamodb_item() -> std::collections::HashMap<String, AttributeValue> {
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
            AttributeValue::S("draft".to_string()),
        );
        item.insert(
            "authorId".to_string(),
            AttributeValue::S("user-456".to_string()),
        );
        item.insert(
            "createdAt".to_string(),
            AttributeValue::S("2026-01-01T00:00:00Z".to_string()),
        );
        item.insert(
            "updatedAt".to_string(),
            AttributeValue::S("2026-01-01T00:00:00Z".to_string()),
        );
        item.insert("imageUrls".to_string(), AttributeValue::L(vec![]));
        item
    }
}
