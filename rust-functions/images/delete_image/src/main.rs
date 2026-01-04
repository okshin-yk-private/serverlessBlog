//! Lambda handler for deleting images from S3.
//!
//! This handler validates ownership and deletes images from S3.
//!
//! # API Contract
//! - Method: DELETE /admin/images/{key+}
//! - Path parameter: key (S3 object key, URL-encoded)
//! - Response: 204 No Content on success
//!
//! # Error Codes
//! - 400: Invalid key or path traversal attempt
//! - 401: Authentication required
//! - 403: User doesn't own the image
//! - 500: Internal server error

use aws_config::BehaviorVersion;
use aws_sdk_s3::Client as S3Client;
use common::{init_tracing, ErrorResponse};
use lambda_http::{http::StatusCode, run, service_fn, Body, Request, RequestExt, Response};
use std::env;
use std::sync::OnceLock;

/// Global S3 client instance for connection reuse across invocations.
static S3_CLIENT: OnceLock<S3Client> = OnceLock::new();

/// Returns a shared S3 client instance, initializing it if necessary.
async fn get_s3_client() -> &'static S3Client {
    S3_CLIENT.get_or_init(|| {
        tokio::runtime::Handle::current().block_on(async {
            let mut config_loader = aws_config::defaults(BehaviorVersion::latest());

            // Support LocalStack endpoint override for testing
            if let Ok(endpoint) = env::var("AWS_ENDPOINT_URL") {
                config_loader = config_loader.endpoint_url(&endpoint);
            }

            let config = config_loader.load().await;
            S3Client::new(&config)
        })
    })
}

/// Creates a JSON error response with the specified status code and message.
fn error_response(status: StatusCode, message: &str) -> Response<Body> {
    let body = serde_json::to_string(&ErrorResponse::new(message))
        .unwrap_or_else(|_| r#"{"message":"Internal Server Error"}"#.to_string());

    Response::builder()
        .status(status)
        .header("Content-Type", "application/json")
        .header("Access-Control-Allow-Origin", "*")
        .body(Body::from(body))
        .expect("Failed to build error response")
}

/// Creates a 204 No Content response for successful deletion.
fn no_content_response() -> Response<Body> {
    Response::builder()
        .status(StatusCode::NO_CONTENT)
        .header("Access-Control-Allow-Origin", "*")
        .body(Body::Empty)
        .expect("Failed to build no content response")
}

/// Extracts user ID from API Gateway authorizer claims.
fn get_user_id_from_event(event: &Request) -> Option<String> {
    event.request_context_ref().and_then(|ctx| {
        if let lambda_http::request::RequestContext::ApiGatewayV1(api_ctx) = ctx {
            api_ctx.authorizer.fields.get("claims").and_then(|claims| {
                if let serde_json::Value::Object(claims_map) = claims {
                    claims_map.get("sub").and_then(|sub| {
                        if let serde_json::Value::String(s) = sub {
                            Some(s.clone())
                        } else {
                            None
                        }
                    })
                } else {
                    None
                }
            })
        } else {
            None
        }
    })
}

/// Extracts the image key from path parameters.
fn get_key_from_path_params(event: &Request) -> Option<String> {
    event
        .path_parameters()
        .first("key")
        .map(|key| {
            // URL decode the key
            urlencoding::decode(key)
                .map(|s| s.into_owned())
                .unwrap_or_else(|_| key.to_string())
        })
}

/// Checks for path traversal attempts in the key.
fn is_path_traversal(key: &str) -> bool {
    key.contains("..")
}

/// Validates that the user owns the image by checking the key prefix.
fn user_owns_image(key: &str, user_id: &str) -> bool {
    key.starts_with(&format!("{}/", user_id))
}

/// Main Lambda handler for delete image requests.
#[tracing::instrument(skip(event), fields(user_id, key))]
async fn handler(event: Request) -> Result<Response<Body>, lambda_http::Error> {
    // Extract user ID from Cognito claims
    let user_id = match get_user_id_from_event(&event) {
        Some(id) => {
            tracing::Span::current().record("user_id", &id);
            id
        }
        None => {
            tracing::warn!("Authentication required");
            return Ok(error_response(StatusCode::UNAUTHORIZED, "認証が必要です"));
        }
    };

    // Get key from path parameters
    let key = match get_key_from_path_params(&event) {
        Some(k) if !k.is_empty() => {
            tracing::Span::current().record("key", &k);
            k
        }
        _ => {
            tracing::warn!("Image key not provided");
            return Ok(error_response(
                StatusCode::BAD_REQUEST,
                "画像キーが指定されていません",
            ));
        }
    };

    // Check for path traversal attacks
    if is_path_traversal(&key) {
        tracing::warn!(key = %key, "Path traversal attempt detected");
        return Ok(error_response(
            StatusCode::BAD_REQUEST,
            "不正なキーが指定されました",
        ));
    }

    // Verify user owns the image
    if !user_owns_image(&key, &user_id) {
        tracing::warn!(key = %key, user_id = %user_id, "User doesn't own the image");
        return Ok(error_response(
            StatusCode::FORBIDDEN,
            "この画像を削除する権限がありません",
        ));
    }

    // Get bucket name from environment
    let bucket_name = match env::var("BUCKET_NAME") {
        Ok(name) => name,
        Err(_) => {
            tracing::error!("BUCKET_NAME environment variable is not set");
            return Ok(error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "サーバー設定エラーが発生しました",
            ));
        }
    };

    // Delete from S3
    let client = get_s3_client().await;
    match client
        .delete_object()
        .bucket(&bucket_name)
        .key(&key)
        .send()
        .await
    {
        Ok(_) => {
            tracing::info!(key = %key, "Image deleted successfully");
            Ok(no_content_response())
        }
        Err(e) => {
            tracing::error!(error = %e, key = %key, "Failed to delete image from S3");
            Ok(error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "サーバーエラーが発生しました",
            ))
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), lambda_http::Error> {
    init_tracing();
    run(service_fn(handler)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use lambda_http::http::Request as HttpRequest;
    use lambda_http::request::RequestContext;
    use serde_json::json;
    use std::collections::HashMap;

    /// Helper to create a test request without authentication (just path params).
    fn create_request_with_key(key: Option<&str>) -> Request {
        // Create path parameters map
        let mut path_params_map: HashMap<String, String> = HashMap::new();
        if let Some(k) = key {
            path_params_map.insert("key".to_string(), k.to_string());
        }

        let request: Request = HttpRequest::builder()
            .method("DELETE")
            .uri(format!("/admin/images/{}", key.unwrap_or("")))
            .header("Content-Type", "application/json")
            .body(Body::Empty)
            .unwrap()
            .into();

        // Use the RequestExt trait method to set path parameters
        request.with_path_parameters(path_params_map)
    }

    /// Helper to create an authenticated request with path parameters properly set.
    fn create_authenticated_request_with_path_params(key: &str, user_id: &str) -> Request {
        use lambda_http::aws_lambda_events::apigw::{
            ApiGatewayProxyRequestContext, ApiGatewayRequestAuthorizer,
        };

        let mut authorizer_fields: HashMap<String, serde_json::Value> = HashMap::new();
        authorizer_fields.insert(
            "claims".to_string(),
            json!({
                "sub": user_id
            }),
        );

        let authorizer = ApiGatewayRequestAuthorizer {
            fields: authorizer_fields,
            ..Default::default()
        };

        let api_context = ApiGatewayProxyRequestContext {
            authorizer,
            ..Default::default()
        };

        // Create path parameters map
        let mut path_params_map: HashMap<String, String> = HashMap::new();
        path_params_map.insert("key".to_string(), key.to_string());

        let request: Request = HttpRequest::builder()
            .method("DELETE")
            .uri(format!("/admin/images/{}", key))
            .header("Content-Type", "application/json")
            .body(Body::Empty)
            .unwrap()
            .into();

        // Use the RequestExt trait methods to set request context and path parameters
        request
            .with_request_context(RequestContext::ApiGatewayV1(api_context))
            .with_path_parameters(path_params_map)
    }

    /// Helper to parse the response body as JSON.
    fn parse_response_body<T: serde::de::DeserializeOwned>(response: &Response<Body>) -> T {
        let body = match response.body() {
            Body::Text(text) => text.clone(),
            Body::Binary(bytes) => String::from_utf8_lossy(bytes).to_string(),
            Body::Empty => String::new(),
        };
        serde_json::from_str(&body).expect("Failed to parse response body")
    }

    // ==================== Authentication Tests ====================

    #[tokio::test]
    async fn test_missing_authentication_returns_401() {
        let request = create_request_with_key(Some("user123/test.jpg"));
        let response = handler(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        let body: ErrorResponse = parse_response_body(&response);
        assert!(body.message.contains("認証が必要です"));
    }

    // ==================== Validation Tests ====================

    #[tokio::test]
    async fn test_missing_key_returns_400() {
        let request = create_authenticated_request_with_path_params("", "user123");
        let response = handler(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body: ErrorResponse = parse_response_body(&response);
        assert!(body.message.contains("画像キーが指定されていません"));
    }

    #[tokio::test]
    async fn test_path_traversal_returns_400() {
        let request = create_authenticated_request_with_path_params("user123/../other/file.jpg", "user123");
        let response = handler(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body: ErrorResponse = parse_response_body(&response);
        assert!(body.message.contains("不正なキーが指定されました"));
    }

    // ==================== Authorization Tests ====================

    #[tokio::test]
    async fn test_other_user_image_returns_403() {
        let request = create_authenticated_request_with_path_params("other-user/image.jpg", "user123");
        let response = handler(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        let body: ErrorResponse = parse_response_body(&response);
        assert!(body.message.contains("この画像を削除する権限がありません"));
    }

    #[tokio::test]
    async fn test_key_without_user_prefix_returns_403() {
        let request = create_authenticated_request_with_path_params("image.jpg", "user123");
        let response = handler(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::FORBIDDEN);
        let body: ErrorResponse = parse_response_body(&response);
        assert!(body.message.contains("この画像を削除する権限がありません"));
    }

    // ==================== Helper Function Tests ====================

    #[test]
    fn test_is_path_traversal_true() {
        assert!(is_path_traversal("user123/../other/file.jpg"));
        assert!(is_path_traversal("../../../etc/passwd"));
        assert!(is_path_traversal("user123/.."));
        assert!(is_path_traversal(".."));
    }

    #[test]
    fn test_is_path_traversal_false() {
        assert!(!is_path_traversal("user123/image.jpg"));
        assert!(!is_path_traversal("user123/uuid.png"));
        assert!(!is_path_traversal("abc123/test-image.webp"));
    }

    #[test]
    fn test_user_owns_image_true() {
        assert!(user_owns_image("user123/image.jpg", "user123"));
        assert!(user_owns_image("user123/subdir/image.jpg", "user123"));
        assert!(user_owns_image("abc-def-123/test.png", "abc-def-123"));
    }

    #[test]
    fn test_user_owns_image_false() {
        assert!(!user_owns_image("other-user/image.jpg", "user123"));
        assert!(!user_owns_image("image.jpg", "user123"));
        assert!(!user_owns_image("user123image.jpg", "user123")); // No slash after user ID
        assert!(!user_owns_image("", "user123"));
    }

    // ==================== CORS Headers Tests ====================

    #[tokio::test]
    async fn test_error_response_has_cors_headers() {
        let request = create_request_with_key(Some("user123/test.jpg"));
        let response = handler(request).await.unwrap();

        assert_eq!(
            response.headers().get("Access-Control-Allow-Origin"),
            Some(&"*".parse().unwrap())
        );
    }

    // ==================== Integration Tests (require S3) ====================

    #[tokio::test]
    #[ignore = "Requires S3/LocalStack setup"]
    async fn test_successful_deletion_returns_204() {
        env::set_var("BUCKET_NAME", "test-bucket");

        let request = create_authenticated_request_with_path_params("user123/test-image.jpg", "user123");
        let response = handler(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::NO_CONTENT);
        assert!(matches!(response.body(), Body::Empty));
    }

    #[tokio::test]
    #[ignore = "Requires S3/LocalStack setup"]
    async fn test_url_encoded_key_is_decoded() {
        env::set_var("BUCKET_NAME", "test-bucket");

        // URL encoded key: user123/my%20image.jpg should be decoded to user123/my image.jpg
        let request = create_authenticated_request_with_path_params("user123/my%20image.jpg", "user123");
        let response = handler(request).await.unwrap();

        // Should process successfully (key gets decoded)
        assert_eq!(response.status(), StatusCode::NO_CONTENT);
    }

    #[tokio::test]
    async fn test_missing_bucket_name_returns_500() {
        // Make sure BUCKET_NAME is not set
        env::remove_var("BUCKET_NAME");

        let request = create_authenticated_request_with_path_params("user123/test.jpg", "user123");
        let response = handler(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
        let body: ErrorResponse = parse_response_body(&response);
        assert!(body.message.contains("サーバー設定エラーが発生しました"));
    }
}
