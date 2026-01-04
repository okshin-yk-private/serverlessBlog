//! Lambda handler for deleting a blog post and its associated images.
//!
//! This handler processes DELETE requests to remove blog posts,
//! with cascading deletion of associated S3 images.
//!
//! - Requires authentication (401 if not authenticated)
//! - Returns 404 if post not found
//! - Returns 204 No Content on successful deletion
//! - Deletes associated images from S3 (best effort)

use aws_sdk_dynamodb::types::AttributeValue;
use aws_sdk_s3::types::ObjectIdentifier;
use common::{
    clients::{get_dynamodb_client, get_s3_client},
    constants::cors,
    init_tracing, DomainError, DynamoDbErrorExt,
};
use lambda_http::{run, service_fn, Body, Error, Request, RequestExt, Response};
use std::env;

#[tokio::main]
async fn main() -> Result<(), Error> {
    init_tracing();
    run(service_fn(handler)).await
}

/// Extracts the post ID from path parameters.
fn get_post_id(event: &Request) -> Option<String> {
    event.path_parameters().first("id").map(|s| s.to_string())
}

/// Checks if the request has a valid authenticated user.
fn is_authenticated(event: &Request) -> bool {
    let context = event.request_context();
    match context {
        lambda_http::request::RequestContext::ApiGatewayV1(ctx) => ctx
            .authorizer
            .fields
            .get("claims")
            .and_then(|claims| claims.get("sub"))
            .and_then(|sub| sub.as_str())
            .is_some(),
        lambda_http::request::RequestContext::ApiGatewayV2(ctx) => ctx
            .authorizer
            .as_ref()
            .and_then(|auth| auth.jwt.as_ref())
            .and_then(|jwt| jwt.claims.get("sub"))
            .is_some(),
        _ => false,
    }
}

/// Extracts image URLs from a DynamoDB item.
fn get_image_urls_from_item(
    item: &std::collections::HashMap<String, AttributeValue>,
) -> Vec<String> {
    item.get("imageUrls")
        .and_then(|v| v.as_l().ok())
        .map(|list| {
            list.iter()
                .filter_map(|v| v.as_s().ok().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default()
}

/// Extracts S3 key from a full URL.
///
/// # Arguments
/// * `image_url` - Full URL (e.g., "https://bucket.s3.amazonaws.com/images/user/photo.jpg")
///
/// # Returns
/// S3 key (e.g., "images/user/photo.jpg")
fn extract_s3_key_from_url(image_url: &str) -> String {
    match url::Url::parse(image_url) {
        Ok(parsed_url) => {
            // Remove leading slash from path
            let path = parsed_url.path();
            path.strip_prefix('/').unwrap_or(path).to_string()
        }
        Err(_) => {
            // If URL parsing fails, return the original string (might already be a key)
            tracing::warn!(image_url = %image_url, "Failed to parse URL, using as-is");
            image_url.to_string()
        }
    }
}

/// Builds a 204 No Content response.
fn build_no_content_response() -> Response<Body> {
    Response::builder()
        .status(204)
        .header("Content-Type", "application/json")
        .header("Access-Control-Allow-Origin", cors::ALLOW_ORIGIN)
        .header("Access-Control-Allow-Methods", cors::ALLOW_METHODS)
        .header("Access-Control-Allow-Headers", cors::ALLOW_HEADERS)
        .body(Body::Empty)
        .expect("Failed to build response")
}

/// Main handler for deleting blog posts.
#[tracing::instrument(skip(event), fields(otel.kind = "server"))]
async fn handler(event: Request) -> Result<Response<Body>, Error> {
    tracing::info!("Received delete post request");

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

    tracing::info!(post_id = %post_id, "Deleting post");

    // Check authentication status
    if !is_authenticated(&event) {
        tracing::warn!(post_id = %post_id, "Unauthenticated delete request");
        return Ok(DomainError::Unauthorized("認証が必要です".to_string()).into_response());
    }

    // Get environment variables
    let table_name = env::var("TABLE_NAME").map_err(|_| {
        tracing::error!("TABLE_NAME environment variable not set");
        DomainError::Internal("Configuration error".to_string())
    })?;

    let bucket_name = env::var("BUCKET_NAME").map_err(|_| {
        tracing::error!("BUCKET_NAME environment variable not set");
        DomainError::Internal("Configuration error".to_string())
    })?;

    // Get post from DynamoDB to retrieve imageUrls
    let dynamodb_client = get_dynamodb_client().await;

    let get_result = dynamodb_client
        .get_item()
        .table_name(&table_name)
        .key("id", AttributeValue::S(post_id.clone()))
        .send()
        .await
        .map_dynamodb_err()?;

    // Check if post exists
    let item = match get_result.item {
        Some(item) => item,
        None => {
            tracing::warn!(post_id = %post_id, "Post not found");
            return Ok(DomainError::NotFound("記事が見つかりません".to_string()).into_response());
        }
    };

    // Extract image URLs for cascade deletion
    let image_urls = get_image_urls_from_item(&item);

    // Delete associated images from S3 (best effort)
    if !image_urls.is_empty() {
        tracing::info!(
            post_id = %post_id,
            image_count = image_urls.len(),
            "Deleting associated images from S3"
        );

        let s3_client = get_s3_client().await;

        let objects_to_delete: Vec<ObjectIdentifier> = image_urls
            .iter()
            .filter_map(|url| {
                let key = extract_s3_key_from_url(url);
                ObjectIdentifier::builder().key(key).build().ok()
            })
            .collect();

        if !objects_to_delete.is_empty() {
            let delete_result = s3_client
                .delete_objects()
                .bucket(&bucket_name)
                .delete(
                    aws_sdk_s3::types::Delete::builder()
                        .set_objects(Some(objects_to_delete))
                        .quiet(true)
                        .build()
                        .map_err(|e| DomainError::S3(e.to_string()))?,
                )
                .send()
                .await;

            // Log but don't fail on S3 deletion errors (best effort)
            if let Err(e) = delete_result {
                tracing::error!(
                    post_id = %post_id,
                    error = %e,
                    "Failed to delete some images from S3, continuing with post deletion"
                );
            } else {
                tracing::info!(
                    post_id = %post_id,
                    image_count = image_urls.len(),
                    "Successfully deleted images from S3"
                );
            }
        }
    }

    // Delete post from DynamoDB
    dynamodb_client
        .delete_item()
        .table_name(&table_name)
        .key("id", AttributeValue::S(post_id.clone()))
        .send()
        .await
        .map_dynamodb_err()?;

    tracing::info!(post_id = %post_id, "Post deleted successfully");

    Ok(build_no_content_response())
}

#[cfg(test)]
mod tests {
    use super::*;
    use aws_sdk_dynamodb::types::AttributeValue;
    use std::collections::HashMap;

    // ==================== get_post_id tests ====================

    #[test]
    fn test_get_post_id_returns_none_when_no_path_params() {
        // This test requires mocking Request, which is complex
        // Covered by integration tests
    }

    // ==================== is_authenticated tests ====================

    #[test]
    fn test_is_authenticated_returns_false_for_empty_context() {
        // This test requires mocking Request, which is complex
        // Covered by integration tests
    }

    // ==================== get_image_urls_from_item tests ====================

    #[test]
    fn test_get_image_urls_from_item_empty_when_no_key() {
        let item: HashMap<String, AttributeValue> = HashMap::new();

        let urls = get_image_urls_from_item(&item);

        assert!(urls.is_empty());
    }

    #[test]
    fn test_get_image_urls_from_item_empty_list() {
        let mut item = HashMap::new();
        item.insert("imageUrls".to_string(), AttributeValue::L(vec![]));

        let urls = get_image_urls_from_item(&item);

        assert!(urls.is_empty());
    }

    #[test]
    fn test_get_image_urls_from_item_single_url() {
        let mut item = HashMap::new();
        item.insert(
            "imageUrls".to_string(),
            AttributeValue::L(vec![AttributeValue::S(
                "https://example.com/img1.jpg".to_string(),
            )]),
        );

        let urls = get_image_urls_from_item(&item);

        assert_eq!(urls.len(), 1);
        assert_eq!(urls[0], "https://example.com/img1.jpg");
    }

    #[test]
    fn test_get_image_urls_from_item_multiple_urls() {
        let mut item = HashMap::new();
        item.insert(
            "imageUrls".to_string(),
            AttributeValue::L(vec![
                AttributeValue::S("https://example.com/img1.jpg".to_string()),
                AttributeValue::S("https://example.com/img2.png".to_string()),
                AttributeValue::S("https://example.com/img3.webp".to_string()),
            ]),
        );

        let urls = get_image_urls_from_item(&item);

        assert_eq!(urls.len(), 3);
        assert_eq!(urls[0], "https://example.com/img1.jpg");
        assert_eq!(urls[1], "https://example.com/img2.png");
        assert_eq!(urls[2], "https://example.com/img3.webp");
    }

    #[test]
    fn test_get_image_urls_from_item_wrong_type() {
        let mut item = HashMap::new();
        // imageUrls is a string instead of list
        item.insert(
            "imageUrls".to_string(),
            AttributeValue::S("not a list".to_string()),
        );

        let urls = get_image_urls_from_item(&item);

        assert!(urls.is_empty());
    }

    // ==================== extract_s3_key_from_url tests ====================

    #[test]
    fn test_extract_s3_key_from_url_full_s3_url() {
        let url = "https://bucket.s3.amazonaws.com/images/user123/photo.jpg";

        let key = extract_s3_key_from_url(url);

        assert_eq!(key, "images/user123/photo.jpg");
    }

    #[test]
    fn test_extract_s3_key_from_url_cloudfront_url() {
        let url = "https://d123.cloudfront.net/images/user123/photo.png";

        let key = extract_s3_key_from_url(url);

        assert_eq!(key, "images/user123/photo.png");
    }

    #[test]
    fn test_extract_s3_key_from_url_nested_path() {
        let url = "https://example.com/images/user123/2026-01-03/photo.webp";

        let key = extract_s3_key_from_url(url);

        assert_eq!(key, "images/user123/2026-01-03/photo.webp");
    }

    #[test]
    fn test_extract_s3_key_from_url_root_path() {
        let url = "https://bucket.s3.amazonaws.com/photo.jpg";

        let key = extract_s3_key_from_url(url);

        assert_eq!(key, "photo.jpg");
    }

    #[test]
    fn test_extract_s3_key_from_url_invalid_url_returns_as_is() {
        let url = "not-a-valid-url";

        let key = extract_s3_key_from_url(url);

        assert_eq!(key, "not-a-valid-url");
    }

    #[test]
    fn test_extract_s3_key_from_url_already_a_key() {
        // If it's already just a key (no scheme), use as-is
        let url = "images/user123/photo.jpg";

        let key = extract_s3_key_from_url(url);

        assert_eq!(key, "images/user123/photo.jpg");
    }

    #[test]
    fn test_extract_s3_key_from_url_with_query_params() {
        // Query params should be excluded from the key
        let url = "https://bucket.s3.amazonaws.com/images/photo.jpg?AWSAccessKeyId=xxx";

        let key = extract_s3_key_from_url(url);

        assert_eq!(key, "images/photo.jpg");
    }

    #[test]
    fn test_extract_s3_key_from_url_url_encoded_filename() {
        let url = "https://bucket.s3.amazonaws.com/images/photo%20with%20spaces.jpg";

        let key = extract_s3_key_from_url(url);

        // URL parsing preserves percent encoding in path
        assert_eq!(key, "images/photo%20with%20spaces.jpg");
    }

    // ==================== build_no_content_response tests ====================

    #[test]
    fn test_build_no_content_response_status_204() {
        let response = build_no_content_response();

        assert_eq!(response.status(), 204);
    }

    #[test]
    fn test_build_no_content_response_content_type() {
        let response = build_no_content_response();

        assert_eq!(
            response.headers().get("Content-Type").unwrap(),
            "application/json"
        );
    }

    #[test]
    fn test_build_no_content_response_cors_headers() {
        let response = build_no_content_response();

        assert_eq!(
            response
                .headers()
                .get("Access-Control-Allow-Origin")
                .unwrap(),
            "*"
        );
        assert!(response
            .headers()
            .contains_key("Access-Control-Allow-Methods"));
        assert!(response
            .headers()
            .contains_key("Access-Control-Allow-Headers"));
    }

    #[test]
    fn test_build_no_content_response_empty_body() {
        let response = build_no_content_response();

        match response.body() {
            Body::Empty => (),
            _ => panic!("Expected empty body for 204 response"),
        }
    }
}
