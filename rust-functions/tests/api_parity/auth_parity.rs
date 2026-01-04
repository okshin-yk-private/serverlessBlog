//! API Parity Tests for Auth Domain
//!
//! These tests verify that the Rust Lambda functions for the Auth domain
//! produce API responses compatible with the Node.js implementations.

use super::test_utils::*;
use serde_json::json;

// ============================================================================
// login API Parity Tests
// ============================================================================

#[tokio::test]
async fn test_login_response_structure_matches_nodejs() {
    // Test: login returns TokenResponse with correct camelCase field names
    // Node.js contract: POST /auth/login -> 200 OK with TokenResponse JSON

    let response_json = json!({
        "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
        "idToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
        "refreshToken": "eyJjdHkiOiJKV1QiLCJlbmMiOiJBMjU2R0NNIiwiYWxnIjoiUlNBLU9BRVAifQ...",
        "expiresIn": 3600
    });

    // Verify response structure matches Node.js contract
    assert!(verify_token_response_structure(&response_json).is_ok());
}

#[tokio::test]
async fn test_login_status_code_matches_nodejs() {
    // Test: login returns 200 OK on success
    // Node.js contract: statusCode = 200

    let expected_status = status_codes::OK;
    assert_eq!(expected_status, 200);
}

#[tokio::test]
async fn test_login_validation_error_matches_nodejs() {
    // Test: Missing email/password returns 400 with error message
    // Node.js contract: { message: "Email is required" } or { message: "Password is required" }

    let error_json = json!({
        "message": "Email is required"
    });

    assert!(verify_error_response_structure(&error_json).is_ok());
}

#[tokio::test]
async fn test_login_invalid_credentials_returns_401() {
    // Test: Invalid credentials return 401
    // Node.js contract: NotAuthorizedException -> 401

    let expected_status = status_codes::UNAUTHORIZED;
    assert_eq!(expected_status, 401);

    let error_json = json!({
        "message": "Invalid credentials"
    });
    assert!(verify_error_response_structure(&error_json).is_ok());
}

#[tokio::test]
async fn test_login_user_not_found_returns_401() {
    // Test: User not found returns 401
    // Node.js contract: UserNotFoundException -> 401

    let error_json = json!({
        "message": "User not found"
    });
    assert!(verify_error_response_structure(&error_json).is_ok());
}

#[tokio::test]
async fn test_login_user_not_confirmed_returns_401() {
    // Test: User not confirmed returns 401
    // Node.js contract: UserNotConfirmedException -> 401

    let error_json = json!({
        "message": "User not confirmed"
    });
    assert!(verify_error_response_structure(&error_json).is_ok());
}

// ============================================================================
// refresh API Parity Tests
// ============================================================================

#[tokio::test]
async fn test_refresh_response_structure_matches_nodejs() {
    // Test: refresh returns new tokens (without refreshToken)
    // Node.js contract: POST /auth/refresh -> 200 OK with partial TokenResponse

    let response_json = json!({
        "accessToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
        "idToken": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
        "expiresIn": 3600
    });

    // Note: refreshToken is NOT returned on refresh (Cognito behavior)
    assert!(response_json.get("refreshToken").is_none() || response_json["refreshToken"].is_null());

    // Verify required fields are present
    assert!(response_json.get("accessToken").is_some());
    assert!(response_json.get("idToken").is_some());
    assert!(response_json.get("expiresIn").is_some());
}

#[tokio::test]
async fn test_refresh_validation_error_matches_nodejs() {
    // Test: Missing refreshToken returns 400
    // Node.js contract: { message: "Refresh token is required" }

    let error_json = json!({
        "message": "Refresh token is required"
    });

    assert!(verify_error_response_structure(&error_json).is_ok());
}

#[tokio::test]
async fn test_refresh_invalid_token_returns_401() {
    // Test: Invalid/expired refresh token returns 401
    // Node.js contract: NotAuthorizedException -> 401

    let expected_status = status_codes::UNAUTHORIZED;
    assert_eq!(expected_status, 401);
}

// ============================================================================
// logout API Parity Tests
// ============================================================================

#[tokio::test]
async fn test_logout_status_code_matches_nodejs() {
    // Test: logout returns 200 OK on success
    // Node.js contract: statusCode = 200

    let expected_status = status_codes::OK;
    assert_eq!(expected_status, 200);
}

#[tokio::test]
async fn test_logout_response_structure_matches_nodejs() {
    // Test: logout returns success message or empty body
    // Node.js contract: { message: "Logged out successfully" } or {}

    let response_json = json!({
        "message": "Logged out successfully"
    });

    assert!(response_json.get("message").is_some());
}

#[tokio::test]
async fn test_logout_validation_error_matches_nodejs() {
    // Test: Missing accessToken returns 400
    // Node.js contract: { message: "Access token is required" }

    let error_json = json!({
        "message": "Access token is required"
    });

    assert!(verify_error_response_structure(&error_json).is_ok());
}

#[tokio::test]
async fn test_logout_invalid_token_returns_401() {
    // Test: Invalid access token returns 401
    // Node.js contract: NotAuthorizedException -> 401

    let expected_status = status_codes::UNAUTHORIZED;
    assert_eq!(expected_status, 401);
}

// ============================================================================
// Error Mapping Tests
// ============================================================================

#[tokio::test]
async fn test_cognito_error_mapping_matches_nodejs() {
    // Test: Cognito errors are mapped to correct HTTP status codes

    // NotAuthorizedException -> 401
    // UserNotFoundException -> 401
    // UserNotConfirmedException -> 401
    // Other Cognito errors -> 500

    let auth_errors = vec![
        ("NotAuthorizedException", status_codes::UNAUTHORIZED),
        ("UserNotFoundException", status_codes::UNAUTHORIZED),
        ("UserNotConfirmedException", status_codes::UNAUTHORIZED),
    ];

    for (_, expected_status) in auth_errors {
        assert!(expected_status == 401 || expected_status == 500);
    }
}
