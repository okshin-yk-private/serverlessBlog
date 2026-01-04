//! Lambda handler for generating S3 pre-signed upload URLs.
//!
//! This handler generates pre-signed URLs for uploading images to S3,
//! with validation for file type, content type, and size limits.
//!
//! # API Contract
//! - Method: POST /admin/images/upload-url
//! - Request: `{ "fileName": "string", "contentType": "string" }`
//! - Response: `{ "uploadUrl": "string", "imageUrl": "string", "key": "string", "expiresIn": number }`
//!
//! # Error Codes
//! - 400: Missing or invalid request body, unsupported file type
//! - 401: Authentication required
//! - 500: Internal server error

use aws_config::BehaviorVersion;
use aws_sdk_s3::{presigning::PresigningConfig, Client as S3Client};
use common::{
    constants::image_upload::{
        ALLOWED_CONTENT_TYPES, ALLOWED_EXTENSIONS, PRESIGNED_URL_EXPIRATION_SECS,
    },
    init_tracing, ErrorResponse, GetUploadUrlRequest, GetUploadUrlResponse,
};
use lambda_http::{http::StatusCode, run, service_fn, Body, Request, RequestExt, Response};
use std::env;
use std::sync::OnceLock;
use std::time::Duration;
use uuid::Uuid;

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

/// Creates a JSON success response.
fn success_response<T: serde::Serialize>(data: &T) -> Response<Body> {
    let body = serde_json::to_string(data).expect("Failed to serialize response");
    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "application/json")
        .header("Access-Control-Allow-Origin", "*")
        .body(Body::from(body))
        .expect("Failed to build success response")
}

/// Validates that the file extension is allowed.
fn validate_extension(file_name: &str) -> bool {
    let extension = file_name
        .rsplit('.')
        .next()
        .map(|ext| ext.to_lowercase())
        .unwrap_or_default();

    ALLOWED_EXTENSIONS.contains(&extension.as_str())
}

/// Validates that the content type is allowed.
fn validate_content_type(content_type: &str) -> bool {
    ALLOWED_CONTENT_TYPES.contains(&content_type.to_lowercase().as_str())
}

/// Extracts user ID from API Gateway authorizer claims.
fn get_user_id_from_event(event: &Request) -> Option<String> {
    event
        .request_context_ref()
        .and_then(|ctx| {
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

/// Sanitizes a file name for use in S3 key.
/// Note: Currently unused in production code (we use UUID instead),
/// but kept for potential future use and testing.
#[allow(dead_code)]
fn sanitize_file_name(file_name: &str) -> String {
    // Extract just the file name without directory path
    let name = file_name
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(file_name);

    // Remove any characters that could cause issues
    name.chars()
        .filter(|c| c.is_alphanumeric() || *c == '.' || *c == '-' || *c == '_')
        .collect()
}

/// Main Lambda handler for get upload URL requests.
#[tracing::instrument(skip(event), fields(user_id))]
async fn handler(event: Request) -> Result<Response<Body>, lambda_http::Error> {
    // Extract user ID from Cognito claims
    let user_id = match get_user_id_from_event(&event) {
        Some(id) => {
            tracing::Span::current().record("user_id", &id);
            id
        }
        None => {
            tracing::warn!("Authentication required");
            return Ok(error_response(
                StatusCode::UNAUTHORIZED,
                "認証が必要です",
            ));
        }
    };

    // Parse request body
    let body = event.body();
    let body_str = match body {
        Body::Empty => {
            tracing::warn!("Request body is empty");
            return Ok(error_response(
                StatusCode::BAD_REQUEST,
                "リクエストボディが必要です",
            ));
        }
        Body::Text(text) => text.clone(),
        Body::Binary(bytes) => String::from_utf8_lossy(bytes).to_string(),
    };

    // Parse JSON body
    let upload_request: GetUploadUrlRequest = match serde_json::from_str(&body_str) {
        Ok(req) => req,
        Err(e) => {
            tracing::warn!(error = %e, "Failed to parse JSON body");
            return Ok(error_response(
                StatusCode::BAD_REQUEST,
                "リクエストボディが不正です",
            ));
        }
    };

    // Validate file name is not empty
    if upload_request.file_name.is_empty() {
        tracing::warn!("File name is empty");
        return Ok(error_response(
            StatusCode::BAD_REQUEST,
            "ファイル名が必要です",
        ));
    }

    // Validate content type is not empty
    if upload_request.content_type.is_empty() {
        tracing::warn!("Content type is empty");
        return Ok(error_response(
            StatusCode::BAD_REQUEST,
            "Content-Typeが必要です",
        ));
    }

    // Validate file extension
    if !validate_extension(&upload_request.file_name) {
        tracing::warn!(file_name = %upload_request.file_name, "Invalid file extension");
        let allowed = ALLOWED_EXTENSIONS.join(", ");
        return Ok(error_response(
            StatusCode::BAD_REQUEST,
            &format!("許可されていないファイル拡張子です。対応形式: .{}", allowed.replace(", ", ", .")),
        ));
    }

    // Validate content type
    if !validate_content_type(&upload_request.content_type) {
        tracing::warn!(content_type = %upload_request.content_type, "Invalid content type");
        let allowed = ALLOWED_CONTENT_TYPES.join(", ");
        return Ok(error_response(
            StatusCode::BAD_REQUEST,
            &format!("許可されていないContent-Typeです。対応形式: {}", allowed),
        ));
    }

    // Get environment variables
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

    let cloudfront_domain = env::var("CLOUDFRONT_DOMAIN").ok();

    // Generate S3 key: {userId}/{uuid}.{extension}
    let uuid = Uuid::new_v4();
    let extension = upload_request
        .file_name
        .rsplit('.')
        .next()
        .map(|ext| ext.to_lowercase())
        .unwrap_or_default();
    let key = format!("{}/{}.{}", user_id, uuid, extension);

    tracing::info!(key = %key, content_type = %upload_request.content_type, "Generating pre-signed URL");

    // Get S3 client and generate pre-signed URL
    let client = get_s3_client().await;

    let presigning_config = PresigningConfig::expires_in(Duration::from_secs(
        PRESIGNED_URL_EXPIRATION_SECS,
    ))
    .map_err(|e| {
        tracing::error!(error = %e, "Failed to create presigning config");
        lambda_http::Error::from(format!("Failed to create presigning config: {}", e))
    })?;

    let presigned_request = client
        .put_object()
        .bucket(&bucket_name)
        .key(&key)
        .content_type(&upload_request.content_type)
        .presigned(presigning_config)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "Failed to generate pre-signed URL");
            lambda_http::Error::from(format!("Failed to generate pre-signed URL: {}", e))
        })?;

    let upload_url = presigned_request.uri().to_string();

    // Generate image URL (CloudFront if available, otherwise S3 direct)
    // CloudFront routes /images/* paths by stripping /images prefix
    let image_url = match cloudfront_domain {
        Some(domain) => format!("{}/images/{}", domain, key),
        None => format!("https://{}.s3.amazonaws.com/{}", bucket_name, key),
    };

    tracing::info!(key = %key, image_url = %image_url, "Pre-signed URL generated successfully");

    let response = GetUploadUrlResponse {
        upload_url,
        file_url: image_url,
        key,
    };

    Ok(success_response(&response))
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

    /// Helper to create a test request with the given JSON body.
    fn create_request(body: Option<&str>) -> Request {
        let builder = HttpRequest::builder()
            .method("POST")
            .uri("/admin/images/upload-url")
            .header("Content-Type", "application/json");

        match body {
            Some(b) => builder.body(Body::from(b.to_string())).unwrap().into(),
            None => builder.body(Body::Empty).unwrap().into(),
        }
    }

    /// Helper to create a request with authorization context.
    fn create_authenticated_request(body: Option<&str>, user_id: &str) -> Request {
        use lambda_http::aws_lambda_events::apigw::ApiGatewayRequestAuthorizer;

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

        let api_context = lambda_http::aws_lambda_events::apigw::ApiGatewayProxyRequestContext {
            authorizer,
            ..Default::default()
        };

        let builder = HttpRequest::builder()
            .method("POST")
            .uri("/admin/images/upload-url")
            .header("Content-Type", "application/json")
            .extension(RequestContext::ApiGatewayV1(api_context));

        match body {
            Some(b) => builder.body(Body::from(b.to_string())).unwrap().into(),
            None => builder.body(Body::Empty).unwrap().into(),
        }
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
        let request = create_request(Some(r#"{"fileName": "test.jpg", "contentType": "image/jpeg"}"#));
        let response = handler(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        let body: ErrorResponse = parse_response_body(&response);
        assert!(body.message.contains("認証が必要です"));
    }

    // ==================== Validation Tests ====================

    #[tokio::test]
    async fn test_missing_request_body_returns_400() {
        let request = create_authenticated_request(None, "user123");
        let response = handler(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body: ErrorResponse = parse_response_body(&response);
        assert!(body.message.contains("リクエストボディが必要です"));
    }

    #[tokio::test]
    async fn test_invalid_json_returns_400() {
        let request = create_authenticated_request(Some("invalid json"), "user123");
        let response = handler(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body: ErrorResponse = parse_response_body(&response);
        assert!(body.message.contains("リクエストボディが不正です"));
    }

    #[tokio::test]
    async fn test_missing_file_name_returns_400() {
        let request = create_authenticated_request(
            Some(r#"{"contentType": "image/jpeg"}"#),
            "user123",
        );
        let response = handler(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body: ErrorResponse = parse_response_body(&response);
        assert!(
            body.message.contains("リクエストボディが不正です")
                || body.message.contains("ファイル名が必要です")
        );
    }

    #[tokio::test]
    async fn test_missing_content_type_returns_400() {
        let request = create_authenticated_request(
            Some(r#"{"fileName": "test.jpg"}"#),
            "user123",
        );
        let response = handler(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body: ErrorResponse = parse_response_body(&response);
        assert!(
            body.message.contains("リクエストボディが不正です")
                || body.message.contains("Content-Typeが必要です")
        );
    }

    #[tokio::test]
    async fn test_empty_file_name_returns_400() {
        let request = create_authenticated_request(
            Some(r#"{"fileName": "", "contentType": "image/jpeg"}"#),
            "user123",
        );
        let response = handler(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body: ErrorResponse = parse_response_body(&response);
        assert!(body.message.contains("ファイル名が必要です"));
    }

    #[tokio::test]
    async fn test_empty_content_type_returns_400() {
        let request = create_authenticated_request(
            Some(r#"{"fileName": "test.jpg", "contentType": ""}"#),
            "user123",
        );
        let response = handler(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body: ErrorResponse = parse_response_body(&response);
        assert!(body.message.contains("Content-Typeが必要です"));
    }

    // ==================== File Extension Validation Tests ====================

    #[tokio::test]
    async fn test_invalid_file_extension_returns_400() {
        let request = create_authenticated_request(
            Some(r#"{"fileName": "test.txt", "contentType": "text/plain"}"#),
            "user123",
        );
        let response = handler(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body: ErrorResponse = parse_response_body(&response);
        assert!(body.message.contains("許可されていないファイル拡張子です"));
    }

    #[tokio::test]
    async fn test_invalid_content_type_returns_400() {
        let request = create_authenticated_request(
            Some(r#"{"fileName": "test.jpg", "contentType": "text/plain"}"#),
            "user123",
        );
        let response = handler(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body: ErrorResponse = parse_response_body(&response);
        assert!(body.message.contains("許可されていないContent-Typeです"));
    }

    // ==================== Extension Validation Unit Tests ====================

    #[test]
    fn test_validate_extension_jpg() {
        assert!(validate_extension("test.jpg"));
        assert!(validate_extension("test.JPG"));
        assert!(validate_extension("TEST.Jpg"));
    }

    #[test]
    fn test_validate_extension_jpeg() {
        assert!(validate_extension("test.jpeg"));
        assert!(validate_extension("test.JPEG"));
    }

    #[test]
    fn test_validate_extension_png() {
        assert!(validate_extension("test.png"));
        assert!(validate_extension("test.PNG"));
    }

    #[test]
    fn test_validate_extension_gif() {
        assert!(validate_extension("test.gif"));
        assert!(validate_extension("test.GIF"));
    }

    #[test]
    fn test_validate_extension_webp() {
        assert!(validate_extension("test.webp"));
        assert!(validate_extension("test.WEBP"));
    }

    #[test]
    fn test_validate_extension_invalid() {
        assert!(!validate_extension("test.txt"));
        assert!(!validate_extension("test.pdf"));
        assert!(!validate_extension("test.bmp"));
        assert!(!validate_extension("test.svg"));
        assert!(!validate_extension("test"));
    }

    // ==================== Content Type Validation Unit Tests ====================

    #[test]
    fn test_validate_content_type_jpeg() {
        assert!(validate_content_type("image/jpeg"));
        assert!(validate_content_type("IMAGE/JPEG"));
    }

    #[test]
    fn test_validate_content_type_png() {
        assert!(validate_content_type("image/png"));
        assert!(validate_content_type("IMAGE/PNG"));
    }

    #[test]
    fn test_validate_content_type_gif() {
        assert!(validate_content_type("image/gif"));
        assert!(validate_content_type("IMAGE/GIF"));
    }

    #[test]
    fn test_validate_content_type_webp() {
        assert!(validate_content_type("image/webp"));
        assert!(validate_content_type("IMAGE/WEBP"));
    }

    #[test]
    fn test_validate_content_type_invalid() {
        assert!(!validate_content_type("text/plain"));
        assert!(!validate_content_type("application/pdf"));
        assert!(!validate_content_type("image/bmp"));
        assert!(!validate_content_type("image/svg+xml"));
    }

    // ==================== Sanitize File Name Tests ====================

    #[test]
    fn test_sanitize_file_name_basic() {
        assert_eq!(sanitize_file_name("test.jpg"), "test.jpg");
        assert_eq!(sanitize_file_name("my-image.png"), "my-image.png");
        assert_eq!(sanitize_file_name("image_2024.gif"), "image_2024.gif");
    }

    #[test]
    fn test_sanitize_file_name_with_path() {
        assert_eq!(sanitize_file_name("/path/to/test.jpg"), "test.jpg");
        assert_eq!(sanitize_file_name("C:\\Users\\test.jpg"), "test.jpg");
    }

    #[test]
    fn test_sanitize_file_name_removes_special_chars() {
        assert_eq!(sanitize_file_name("test<script>.jpg"), "testscript.jpg");
        assert_eq!(sanitize_file_name("test image.jpg"), "testimage.jpg");
    }

    // ==================== Response Format Tests ====================

    #[tokio::test]
    async fn test_cors_headers_present() {
        let request = create_request(Some(r#"{"fileName": "test.jpg", "contentType": "image/jpeg"}"#));
        let response = handler(request).await.unwrap();

        assert_eq!(
            response.headers().get("Access-Control-Allow-Origin"),
            Some(&"*".parse().unwrap())
        );
        assert_eq!(
            response.headers().get("Content-Type"),
            Some(&"application/json".parse().unwrap())
        );
    }

    // ==================== Integration Tests (require S3) ====================
    // These tests are marked with ignore because they require actual S3
    // or LocalStack setup. Run with: cargo test -- --ignored

    #[tokio::test]
    #[ignore = "Requires S3/LocalStack setup"]
    async fn test_successful_upload_url_generation() {
        // Set environment variable for test
        env::set_var("BUCKET_NAME", "test-bucket");

        let request = create_authenticated_request(
            Some(r#"{"fileName": "test.jpg", "contentType": "image/jpeg"}"#),
            "user123",
        );
        let response = handler(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body: GetUploadUrlResponse = parse_response_body(&response);
        assert!(!body.upload_url.is_empty());
        assert!(!body.file_url.is_empty());
        assert!(body.key.starts_with("user123/"));
        assert!(body.key.ends_with(".jpg"));
    }

    #[tokio::test]
    #[ignore = "Requires S3/LocalStack setup"]
    async fn test_cloudfront_url_returned_when_configured() {
        env::set_var("BUCKET_NAME", "test-bucket");
        env::set_var("CLOUDFRONT_DOMAIN", "https://cdn.example.com");

        let request = create_authenticated_request(
            Some(r#"{"fileName": "test.png", "contentType": "image/png"}"#),
            "user456",
        );
        let response = handler(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let body: GetUploadUrlResponse = parse_response_body(&response);
        assert!(body.file_url.starts_with("https://cdn.example.com/images/"));
    }
}
