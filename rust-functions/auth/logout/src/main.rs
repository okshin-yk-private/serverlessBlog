//! Lambda handler for user logout (global sign out).
//!
//! This handler signs out users from all devices via Cognito GlobalSignOut
//! and invalidates all existing tokens.
//!
//! # API Contract
//! - Method: POST /auth/logout
//! - Request: `{ "accessToken": "string" }`
//! - Response: `{ "message": "ログアウトしました" }` (200 OK)
//!
//! # Error Codes
//! - 400: Missing or invalid request body
//! - 401: Invalid or expired access token
//! - 500: Internal server error

use aws_config::BehaviorVersion;
use aws_sdk_cognitoidentityprovider::{
    operation::global_sign_out::GlobalSignOutError, Client as CognitoClient,
};
use common::{init_tracing, ErrorResponse, LogoutRequest};
use lambda_http::{http::StatusCode, run, service_fn, Body, Error, Request, Response};
use serde::Serialize;
use std::env;
use std::sync::OnceLock;

/// Global Cognito client instance for connection reuse across invocations.
static COGNITO_CLIENT: OnceLock<CognitoClient> = OnceLock::new();

/// Success response for logout.
#[derive(Debug, Clone, Serialize)]
pub struct LogoutResponse {
    pub message: String,
}

/// Returns a shared Cognito client instance, initializing it if necessary.
async fn get_cognito_client() -> &'static CognitoClient {
    COGNITO_CLIENT.get_or_init(|| {
        tokio::runtime::Handle::current().block_on(async {
            let mut config_loader = aws_config::defaults(BehaviorVersion::latest());

            // Support LocalStack endpoint override for testing
            if let Ok(endpoint) = env::var("AWS_ENDPOINT_URL") {
                config_loader = config_loader.endpoint_url(&endpoint);
            }

            let config = config_loader.load().await;
            CognitoClient::new(&config)
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
fn success_response(body: &str) -> Response<Body> {
    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", "application/json")
        .header("Access-Control-Allow-Origin", "*")
        .body(Body::from(body.to_string()))
        .expect("Failed to build success response")
}

/// Main Lambda handler for logout requests.
#[tracing::instrument(skip(event))]
async fn handler(event: Request) -> Result<Response<Body>, Error> {
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
    let logout_request: LogoutRequest = match serde_json::from_str(&body_str) {
        Ok(req) => req,
        Err(e) => {
            tracing::warn!(error = %e, "Failed to parse JSON body");
            return Ok(error_response(
                StatusCode::BAD_REQUEST,
                "リクエストボディが不正です",
            ));
        }
    };

    // Validate access token
    if logout_request.access_token.is_empty() {
        tracing::warn!("Access token is empty");
        return Ok(error_response(
            StatusCode::BAD_REQUEST,
            "アクセストークンが必要です",
        ));
    }

    tracing::info!("Starting global sign out");

    // Get Cognito client and perform global sign out
    let client = get_cognito_client().await;

    let signout_result = client
        .global_sign_out()
        .access_token(&logout_request.access_token)
        .send()
        .await;

    match signout_result {
        Ok(_) => {
            tracing::info!("Global sign out successful");

            let response = LogoutResponse {
                message: "ログアウトしました".to_string(),
            };

            let body = serde_json::to_string(&response)
                .map_err(|e| Error::from(format!("Failed to serialize response: {}", e)))?;

            Ok(success_response(&body))
        }
        Err(sdk_error) => {
            // Handle specific Cognito errors
            if let Some(service_error) = sdk_error.as_service_error() {
                match service_error {
                    GlobalSignOutError::NotAuthorizedException(_) => {
                        tracing::warn!("NotAuthorizedException - invalid or expired access token");
                        return Ok(error_response(
                            StatusCode::UNAUTHORIZED,
                            "アクセストークンが無効または期限切れです",
                        ));
                    }
                    _ => {
                        tracing::error!(error = %sdk_error, "Cognito error");
                        return Ok(error_response(
                            StatusCode::INTERNAL_SERVER_ERROR,
                            "サーバーエラーが発生しました",
                        ));
                    }
                }
            }

            tracing::error!(error = %sdk_error, "Unexpected error");
            Ok(error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "サーバーエラーが発生しました",
            ))
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    init_tracing();
    run(service_fn(handler)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use lambda_http::http::Request as HttpRequest;

    /// Helper to create a test request with the given JSON body.
    fn create_request(body: Option<&str>) -> Request {
        let builder = HttpRequest::builder()
            .method("POST")
            .uri("/auth/logout")
            .header("Content-Type", "application/json");

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

    // ==================== Validation Tests ====================

    #[tokio::test]
    async fn test_missing_request_body_returns_400() {
        let request = create_request(None);
        let response = handler(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body: ErrorResponse = parse_response_body(&response);
        assert!(body.message.contains("リクエストボディが必要です"));
    }

    #[tokio::test]
    async fn test_invalid_json_returns_400() {
        let request = create_request(Some("invalid json"));
        let response = handler(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body: ErrorResponse = parse_response_body(&response);
        assert!(body.message.contains("リクエストボディが不正です"));
    }

    #[tokio::test]
    async fn test_missing_access_token_returns_400() {
        let request = create_request(Some(r#"{}"#));
        let response = handler(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body: ErrorResponse = parse_response_body(&response);
        // serde will fail on missing required field
        assert!(
            body.message.contains("リクエストボディが不正です")
                || body.message.contains("アクセストークンが必要です")
        );
    }

    #[tokio::test]
    async fn test_empty_access_token_returns_400() {
        let request = create_request(Some(r#"{"accessToken": ""}"#));
        let response = handler(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body: ErrorResponse = parse_response_body(&response);
        assert!(body.message.contains("アクセストークンが必要です"));
    }

    // ==================== Response Format Tests ====================

    #[tokio::test]
    async fn test_cors_headers_present() {
        let request = create_request(None);
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

    #[tokio::test]
    async fn test_error_response_has_message_field() {
        let request = create_request(None);
        let response = handler(request).await.unwrap();

        let body: ErrorResponse = parse_response_body(&response);
        assert!(!body.message.is_empty());
    }

    // ==================== Request Parsing Tests ====================

    #[tokio::test]
    async fn test_valid_json_with_extra_fields_is_accepted() {
        // Extra fields should be ignored
        let request = create_request(Some(r#"{"accessToken": "", "extraField": "ignored"}"#));
        let response = handler(request).await.unwrap();

        // Should fail validation (empty token), not JSON parsing
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body: ErrorResponse = parse_response_body(&response);
        assert!(body.message.contains("アクセストークンが必要です"));
    }

    #[tokio::test]
    async fn test_binary_body_is_handled() {
        let builder = HttpRequest::builder()
            .method("POST")
            .uri("/auth/logout")
            .header("Content-Type", "application/json");

        let json = r#"{"accessToken": ""}"#;
        let request: Request = builder
            .body(Body::Binary(json.as_bytes().to_vec()))
            .unwrap()
            .into();

        let response = handler(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body: ErrorResponse = parse_response_body(&response);
        assert!(body.message.contains("アクセストークンが必要です"));
    }

    // ==================== Integration Tests (require Cognito) ====================
    // These tests are marked with ignore because they require actual Cognito
    // or LocalStack setup. Run with: cargo test -- --ignored

    #[tokio::test]
    #[ignore = "Requires Cognito/LocalStack setup"]
    async fn test_successful_logout_returns_200() {
        // This test would require a real Cognito setup or mocking
        // It's here to document the expected behavior
    }

    #[tokio::test]
    #[ignore = "Requires Cognito/LocalStack setup"]
    async fn test_invalid_access_token_returns_401() {
        // This test would require a real Cognito setup or mocking
    }

    #[tokio::test]
    #[ignore = "Requires Cognito/LocalStack setup"]
    async fn test_expired_access_token_returns_401() {
        // This test would require a real Cognito setup or mocking
    }
}
