//! Lambda handler for user authentication (login).
//!
//! This handler authenticates users via Cognito using USER_PASSWORD_AUTH flow
//! and returns JWT tokens upon successful authentication.
//!
//! # API Contract
//! - Method: POST /auth/login
//! - Request: `{ "email": "string", "password": "string" }`
//! - Response: `{ "accessToken": "string", "refreshToken": "string", "idToken": "string", "expiresIn": number }`
//!
//! # Error Codes
//! - 400: Missing or invalid request body
//! - 401: Invalid credentials, user not found, or user not confirmed
//! - 500: Internal server error

use aws_config::BehaviorVersion;
use aws_sdk_cognitoidentityprovider::{
    operation::initiate_auth::InitiateAuthError, types::AuthFlowType, Client as CognitoClient,
};
use common::{init_tracing, ErrorResponse, LoginRequest, TokenResponse};
use lambda_http::{http::StatusCode, run, service_fn, Body, Error, Request, Response};
use std::env;
use std::sync::OnceLock;

/// Global Cognito client instance for connection reuse across invocations.
static COGNITO_CLIENT: OnceLock<CognitoClient> = OnceLock::new();

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

/// Main Lambda handler for login requests.
#[tracing::instrument(skip(event), fields(email))]
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
    let login_request: LoginRequest = match serde_json::from_str(&body_str) {
        Ok(req) => req,
        Err(e) => {
            tracing::warn!(error = %e, "Failed to parse JSON body");
            return Ok(error_response(
                StatusCode::BAD_REQUEST,
                "リクエストボディが不正です",
            ));
        }
    };

    // Validate email
    if login_request.email.is_empty() {
        tracing::warn!("Email is empty");
        return Ok(error_response(
            StatusCode::BAD_REQUEST,
            "メールアドレスが必要です",
        ));
    }

    // Validate password
    if login_request.password.is_empty() {
        tracing::warn!("Password is empty");
        return Ok(error_response(
            StatusCode::BAD_REQUEST,
            "パスワードが必要です",
        ));
    }

    // Record email in tracing span
    tracing::Span::current().record("email", &login_request.email);
    tracing::info!(email = %login_request.email, "Starting authentication");

    // Get Cognito client and initiate auth
    let client = get_cognito_client().await;
    let client_id = env::var("USER_POOL_CLIENT_ID").unwrap_or_default();

    let auth_result = client
        .initiate_auth()
        .auth_flow(AuthFlowType::UserPasswordAuth)
        .client_id(&client_id)
        .auth_parameters("USERNAME", &login_request.email)
        .auth_parameters("PASSWORD", &login_request.password)
        .send()
        .await;

    match auth_result {
        Ok(response) => {
            // Extract authentication result
            let auth_result = match response.authentication_result() {
                Some(result) => result,
                None => {
                    tracing::error!("Authentication result is missing");
                    return Ok(error_response(
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "サーバーエラーが発生しました",
                    ));
                }
            };

            // Build token response
            let token_response = TokenResponse {
                access_token: auth_result.access_token().unwrap_or_default().to_string(),
                id_token: auth_result.id_token().unwrap_or_default().to_string(),
                refresh_token: auth_result.refresh_token().map(|s| s.to_string()),
                expires_in: auth_result.expires_in(),
            };

            tracing::info!(email = %login_request.email, "Login successful");

            let body = serde_json::to_string(&token_response)
                .map_err(|e| Error::from(format!("Failed to serialize response: {}", e)))?;

            Ok(success_response(&body))
        }
        Err(sdk_error) => {
            // Handle specific Cognito errors
            if let Some(service_error) = sdk_error.as_service_error() {
                match service_error {
                    InitiateAuthError::NotAuthorizedException(_) => {
                        tracing::warn!(email = %login_request.email, "NotAuthorizedException");
                        return Ok(error_response(
                            StatusCode::UNAUTHORIZED,
                            "メールアドレスまたはパスワードが正しくありません",
                        ));
                    }
                    InitiateAuthError::UserNotFoundException(_) => {
                        tracing::warn!(email = %login_request.email, "UserNotFoundException");
                        return Ok(error_response(
                            StatusCode::UNAUTHORIZED,
                            "メールアドレスまたはパスワードが正しくありません",
                        ));
                    }
                    InitiateAuthError::UserNotConfirmedException(_) => {
                        tracing::warn!(email = %login_request.email, "UserNotConfirmedException");
                        return Ok(error_response(
                            StatusCode::UNAUTHORIZED,
                            "ユーザーが確認されていません",
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
            .uri("/auth/login")
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
    async fn test_missing_email_returns_400() {
        let request = create_request(Some(r#"{"password": "password123"}"#));
        let response = handler(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body: ErrorResponse = parse_response_body(&response);
        // Note: This will fail with "リクエストボディが不正です" because serde
        // requires the email field. For exact error message, we'd need custom validation.
        assert!(
            body.message.contains("リクエストボディが不正です")
                || body.message.contains("メールアドレスが必要です")
        );
    }

    #[tokio::test]
    async fn test_missing_password_returns_400() {
        let request = create_request(Some(r#"{"email": "test@example.com"}"#));
        let response = handler(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body: ErrorResponse = parse_response_body(&response);
        // Same note as above - serde will fail on missing required field
        assert!(
            body.message.contains("リクエストボディが不正です")
                || body.message.contains("パスワードが必要です")
        );
    }

    #[tokio::test]
    async fn test_empty_email_returns_400() {
        let request = create_request(Some(r#"{"email": "", "password": "password123"}"#));
        let response = handler(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body: ErrorResponse = parse_response_body(&response);
        assert!(body.message.contains("メールアドレスが必要です"));
    }

    #[tokio::test]
    async fn test_empty_password_returns_400() {
        let request = create_request(Some(r#"{"email": "test@example.com", "password": ""}"#));
        let response = handler(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body: ErrorResponse = parse_response_body(&response);
        assert!(body.message.contains("パスワードが必要です"));
    }

    #[tokio::test]
    async fn test_empty_email_and_password_returns_400_for_email() {
        let request = create_request(Some(r#"{"email": "", "password": ""}"#));
        let response = handler(request).await.unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body: ErrorResponse = parse_response_body(&response);
        // Email is validated first
        assert!(body.message.contains("メールアドレスが必要です"));
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
        let request = create_request(Some(
            r#"{"email": "", "password": "test", "extraField": "ignored"}"#,
        ));
        let response = handler(request).await.unwrap();

        // Should fail validation (empty email), not JSON parsing
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body: ErrorResponse = parse_response_body(&response);
        assert!(body.message.contains("メールアドレスが必要です"));
    }

    #[tokio::test]
    async fn test_binary_body_is_handled() {
        let builder = HttpRequest::builder()
            .method("POST")
            .uri("/auth/login")
            .header("Content-Type", "application/json");

        let json = r#"{"email": "", "password": "test"}"#;
        let request: Request = builder
            .body(Body::Binary(json.as_bytes().to_vec()))
            .unwrap()
            .into();

        let response = handler(request).await.unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        let body: ErrorResponse = parse_response_body(&response);
        assert!(body.message.contains("メールアドレスが必要です"));
    }

    // ==================== Integration Tests (require Cognito) ====================
    // These tests are marked with ignore because they require actual Cognito
    // or LocalStack setup. Run with: cargo test -- --ignored

    #[tokio::test]
    #[ignore = "Requires Cognito/LocalStack setup"]
    async fn test_successful_login_returns_tokens() {
        // This test would require a real Cognito setup or mocking
        // It's here to document the expected behavior
    }

    #[tokio::test]
    #[ignore = "Requires Cognito/LocalStack setup"]
    async fn test_invalid_credentials_returns_401() {
        // This test would require a real Cognito setup or mocking
    }
}
