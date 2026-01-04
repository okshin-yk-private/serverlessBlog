//! Lambda handler for creating blog posts.
//!
//! This handler processes POST requests to create new blog posts,
//! validating input, converting Markdown to HTML, and persisting to DynamoDB.

use aws_sdk_dynamodb::types::AttributeValue;
use chrono::Utc;
use common::{
    clients::get_dynamodb_client, constants::cors, init_tracing, markdown_to_safe_html, BlogPost,
    CreatePostRequest, DomainError, DynamoDbErrorExt, PublishStatus,
};
use lambda_http::{run, service_fn, Body, Error, Request, RequestExt, RequestPayloadExt, Response};
use std::env;
use uuid::Uuid;

#[tokio::main]
async fn main() -> Result<(), Error> {
    init_tracing();
    run(service_fn(handler)).await
}

/// Extracts the author ID from Cognito claims in the request context.
fn get_author_id(event: &Request) -> Option<String> {
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

/// Validates the create post request.
fn validate_request(request: &CreatePostRequest) -> Result<(), DomainError> {
    if request.title.trim().is_empty() {
        return Err(DomainError::Validation(
            "title is required and cannot be empty".to_string(),
        ));
    }

    if request.content_markdown.trim().is_empty() {
        return Err(DomainError::Validation(
            "contentMarkdown is required and cannot be empty".to_string(),
        ));
    }

    if request.category.trim().is_empty() {
        return Err(DomainError::Validation(
            "category is required and cannot be empty".to_string(),
        ));
    }

    Ok(())
}

/// Builds a successful response with the created blog post.
fn build_success_response(post: &BlogPost) -> Response<Body> {
    Response::builder()
        .status(201)
        .header("Content-Type", "application/json")
        .header("Access-Control-Allow-Origin", cors::ALLOW_ORIGIN)
        .header("Access-Control-Allow-Methods", cors::ALLOW_METHODS)
        .header("Access-Control-Allow-Headers", cors::ALLOW_HEADERS)
        .body(Body::from(serde_json::to_string(post).unwrap()))
        .expect("Failed to build response")
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

/// Main handler for creating blog posts.
#[tracing::instrument(skip(event), fields(otel.kind = "server"))]
async fn handler(event: Request) -> Result<Response<Body>, Error> {
    tracing::info!("Received create post request");

    // Parse request body
    let request: CreatePostRequest = match event.payload() {
        Ok(Some(req)) => req,
        Ok(None) => {
            tracing::warn!("Request body is empty");
            return Ok(
                DomainError::Validation("Request body is required".to_string()).into_response(),
            );
        }
        Err(e) => {
            tracing::warn!(error = %e, "Failed to parse request body");
            return Ok(DomainError::Validation(format!("Invalid JSON: {}", e)).into_response());
        }
    };

    tracing::info!(title = %request.title, category = %request.category, "Parsed create post request");

    // Validate request
    if let Err(e) = validate_request(&request) {
        tracing::warn!(error = %e, "Validation failed");
        return Ok(e.into_response());
    }

    // Extract author ID from Cognito claims
    let author_id = match get_author_id(&event) {
        Some(id) => id,
        None => {
            tracing::warn!("Author ID not found in request context");
            return Ok(DomainError::Unauthorized("Unauthorized".to_string()).into_response());
        }
    };

    tracing::info!(author_id = %author_id, "Extracted author ID from claims");

    // Prepare blog post data
    let now = Utc::now().to_rfc3339();
    let post_id = Uuid::new_v4().to_string();

    // Convert Markdown to safe HTML
    let content_html = markdown_to_safe_html(&request.content_markdown);
    tracing::info!(post_id = %post_id, "Converted markdown to HTML");

    // Determine publish status and published_at
    let publish_status = request.publish_status.unwrap_or(PublishStatus::Draft);
    let published_at = if publish_status == PublishStatus::Published {
        Some(now.clone())
    } else {
        None
    };

    let blog_post = BlogPost {
        id: post_id.clone(),
        title: request.title.trim().to_string(),
        content_markdown: request.content_markdown.trim().to_string(),
        content_html,
        category: request.category.trim().to_string(),
        tags: request.tags,
        publish_status,
        author_id,
        created_at: now.clone(),
        updated_at: now,
        published_at,
        image_urls: request.image_urls,
    };

    // Get table name from environment
    let table_name = env::var("TABLE_NAME").map_err(|_| {
        tracing::error!("TABLE_NAME environment variable not set");
        DomainError::Internal("Configuration error".to_string())
    })?;

    // Save to DynamoDB
    let client = get_dynamodb_client().await;
    let item = post_to_dynamodb_item(&blog_post);

    tracing::info!(post_id = %post_id, table_name = %table_name, "Saving post to DynamoDB");

    client
        .put_item()
        .table_name(&table_name)
        .set_item(Some(item))
        .send()
        .await
        .map_dynamodb_err()?;

    tracing::info!(post_id = %post_id, "Post created successfully");

    Ok(build_success_response(&blog_post))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_request_success() {
        let request = CreatePostRequest {
            title: "Test Title".to_string(),
            content_markdown: "# Hello World".to_string(),
            category: "tech".to_string(),
            tags: vec!["rust".to_string()],
            publish_status: Some(PublishStatus::Draft),
            image_urls: vec![],
        };

        assert!(validate_request(&request).is_ok());
    }

    #[test]
    fn test_validate_request_empty_title() {
        let request = CreatePostRequest {
            title: "".to_string(),
            content_markdown: "# Hello World".to_string(),
            category: "tech".to_string(),
            tags: vec![],
            publish_status: None,
            image_urls: vec![],
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
        let request = CreatePostRequest {
            title: "   ".to_string(),
            content_markdown: "# Hello World".to_string(),
            category: "tech".to_string(),
            tags: vec![],
            publish_status: None,
            image_urls: vec![],
        };

        let result = validate_request(&request);
        assert!(result.is_err());
    }

    #[test]
    fn test_validate_request_empty_content() {
        let request = CreatePostRequest {
            title: "Test Title".to_string(),
            content_markdown: "".to_string(),
            category: "tech".to_string(),
            tags: vec![],
            publish_status: None,
            image_urls: vec![],
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
        let request = CreatePostRequest {
            title: "Test Title".to_string(),
            content_markdown: "# Hello World".to_string(),
            category: "".to_string(),
            tags: vec![],
            publish_status: None,
            image_urls: vec![],
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
    fn test_post_to_dynamodb_item() {
        let post = BlogPost {
            id: "test-id".to_string(),
            title: "Test Title".to_string(),
            content_markdown: "# Hello".to_string(),
            content_html: "<h1>Hello</h1>".to_string(),
            category: "tech".to_string(),
            tags: vec!["rust".to_string(), "aws".to_string()],
            publish_status: PublishStatus::Draft,
            author_id: "user-123".to_string(),
            created_at: "2026-01-03T00:00:00Z".to_string(),
            updated_at: "2026-01-03T00:00:00Z".to_string(),
            published_at: None,
            image_urls: vec!["https://example.com/image.png".to_string()],
        };

        let item = post_to_dynamodb_item(&post);

        assert_eq!(item.get("id").unwrap().as_s().unwrap(), "test-id");
        assert_eq!(item.get("title").unwrap().as_s().unwrap(), "Test Title");
        assert_eq!(item.get("publishStatus").unwrap().as_s().unwrap(), "draft");
        assert_eq!(item.get("tags").unwrap().as_l().unwrap().len(), 2);
        assert!(item.get("publishedAt").is_none());
    }

    #[test]
    fn test_post_to_dynamodb_item_with_published_at() {
        let post = BlogPost {
            id: "test-id".to_string(),
            title: "Test Title".to_string(),
            content_markdown: "# Hello".to_string(),
            content_html: "<h1>Hello</h1>".to_string(),
            category: "tech".to_string(),
            tags: vec![],
            publish_status: PublishStatus::Published,
            author_id: "user-123".to_string(),
            created_at: "2026-01-03T00:00:00Z".to_string(),
            updated_at: "2026-01-03T00:00:00Z".to_string(),
            published_at: Some("2026-01-03T00:00:00Z".to_string()),
            image_urls: vec![],
        };

        let item = post_to_dynamodb_item(&post);

        assert_eq!(
            item.get("publishStatus").unwrap().as_s().unwrap(),
            "published"
        );
        assert!(item.get("publishedAt").is_some());
        assert_eq!(
            item.get("publishedAt").unwrap().as_s().unwrap(),
            "2026-01-03T00:00:00Z"
        );
    }

    #[test]
    fn test_build_success_response() {
        let post = BlogPost {
            id: "test-id".to_string(),
            title: "Test Title".to_string(),
            content_markdown: "# Hello".to_string(),
            content_html: "<h1>Hello</h1>".to_string(),
            category: "tech".to_string(),
            tags: vec![],
            publish_status: PublishStatus::Draft,
            author_id: "user-123".to_string(),
            created_at: "2026-01-03T00:00:00Z".to_string(),
            updated_at: "2026-01-03T00:00:00Z".to_string(),
            published_at: None,
            image_urls: vec![],
        };

        let response = build_success_response(&post);

        assert_eq!(response.status(), 201);
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

    #[test]
    fn test_validate_request_with_tags_and_images() {
        let request = CreatePostRequest {
            title: "Test Title".to_string(),
            content_markdown: "# Hello World".to_string(),
            category: "tech".to_string(),
            tags: vec![
                "rust".to_string(),
                "aws".to_string(),
                "serverless".to_string(),
            ],
            publish_status: Some(PublishStatus::Published),
            image_urls: vec!["https://example.com/img1.png".to_string()],
        };

        assert!(validate_request(&request).is_ok());
    }

    #[test]
    fn test_publish_status_default() {
        // Test that default publish status is Draft
        let json_str = r##"{"title": "Test", "contentMarkdown": "# Test", "category": "test"}"##;
        let request: CreatePostRequest = serde_json::from_str(json_str).unwrap();

        assert!(request.publish_status.is_none());
    }

    #[test]
    fn test_validate_request_whitespace_content() {
        let request = CreatePostRequest {
            title: "Test Title".to_string(),
            content_markdown: "   ".to_string(),
            category: "tech".to_string(),
            tags: vec![],
            publish_status: None,
            image_urls: vec![],
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
    fn test_validate_request_whitespace_category() {
        let request = CreatePostRequest {
            title: "Test Title".to_string(),
            content_markdown: "# Hello World".to_string(),
            category: "   ".to_string(),
            tags: vec![],
            publish_status: None,
            image_urls: vec![],
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
}
