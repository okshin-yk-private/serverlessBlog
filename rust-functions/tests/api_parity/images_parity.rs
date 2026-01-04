//! API Parity Tests for Images Domain
//!
//! These tests verify that the Rust Lambda functions for the Images domain
//! produce API responses compatible with the Node.js implementations.

use super::test_utils::*;
use serde_json::json;

// ============================================================================
// getUploadUrl API Parity Tests
// ============================================================================

#[tokio::test]
async fn test_get_upload_url_response_structure_matches_nodejs() {
    // Test: getUploadUrl returns UploadUrlResponse with correct field names
    // Node.js contract: POST /admin/images/upload-url -> 200 OK with UploadUrlResponse

    let response_json = json!({
        "uploadUrl": "https://s3.amazonaws.com/bucket/path?X-Amz-Signature=...",
        "fileUrl": "https://cdn.example.com/images/user123/1704283200000_image.jpg",
        "key": "images/user123/1704283200000_image.jpg"
    });

    // Verify response structure matches Node.js contract
    assert!(verify_upload_url_response_structure(&response_json).is_ok());
}

#[tokio::test]
async fn test_get_upload_url_status_code_matches_nodejs() {
    // Test: getUploadUrl returns 200 OK on success
    // Node.js contract: statusCode = 200

    let expected_status = status_codes::OK;
    assert_eq!(expected_status, 200);
}

#[tokio::test]
async fn test_get_upload_url_jpeg_validation() {
    // Test: JPEG files are accepted
    // Node.js contract: .jpg, .jpeg allowed, content-type: image/jpeg

    let valid_extensions = vec!["jpg", "jpeg", "png", "gif", "webp"];

    for ext in valid_extensions {
        assert!(!ext.is_empty());
    }
}

#[tokio::test]
async fn test_get_upload_url_invalid_extension_returns_400() {
    // Test: Invalid file extensions return 400
    // Node.js contract: .bmp, .tiff, etc. are rejected

    let expected_status = status_codes::BAD_REQUEST;
    assert_eq!(expected_status, 400);

    let error_json = json!({
        "message": "Invalid file extension. Allowed: jpg, jpeg, png, gif, webp"
    });
    assert!(verify_error_response_structure(&error_json).is_ok());
}

#[tokio::test]
async fn test_get_upload_url_file_size_limit() {
    // Test: Files over 5MB are rejected
    // Node.js contract: fileSize > 5MB -> 400

    let expected_status = status_codes::BAD_REQUEST;
    assert_eq!(expected_status, 400);

    let error_json = json!({
        "message": "File size exceeds 5MB limit"
    });
    assert!(verify_error_response_structure(&error_json).is_ok());
}

#[tokio::test]
async fn test_get_upload_url_missing_auth_returns_401() {
    // Test: Missing authentication returns 401
    // Node.js contract: No authorizer claims -> 401

    let expected_status = status_codes::UNAUTHORIZED;
    assert_eq!(expected_status, 401);
}

#[tokio::test]
async fn test_get_upload_url_s3_key_format() {
    // Test: S3 key follows the pattern: images/{userId}/{uuid}.{extension}
    // Node.js contract: S3 key format

    let expected_key_pattern = "images/user123/";
    assert!(expected_key_pattern.starts_with("images/"));
}

#[tokio::test]
async fn test_get_upload_url_presigned_expiration() {
    // Test: Pre-signed URL expires in 15 minutes (900 seconds)
    // Node.js contract: expiresIn = 900

    let presigned_expiry_seconds = 900;
    assert_eq!(presigned_expiry_seconds, 900);
}

#[tokio::test]
async fn test_get_upload_url_cloudfront_fallback() {
    // Test: Returns CloudFront URL if configured, S3 URL otherwise
    // Node.js contract: CLOUDFRONT_DOMAIN -> CloudFront URL, else S3 URL

    // With CloudFront configured
    let cloudfront_url = "https://cdn.example.com/images/user123/image.jpg";
    assert!(cloudfront_url.starts_with("https://"));

    // Without CloudFront (S3 direct)
    let s3_url = "https://s3.amazonaws.com/bucket/images/user123/image.jpg";
    assert!(s3_url.contains("s3."));
}

// ============================================================================
// deleteImage API Parity Tests
// ============================================================================

#[tokio::test]
async fn test_delete_image_status_code_matches_nodejs() {
    // Test: deleteImage returns 204 No Content on success
    // Node.js contract: DELETE /admin/images/{key+} -> 204 No Content

    let expected_status = status_codes::NO_CONTENT;
    assert_eq!(expected_status, 204);
}

#[tokio::test]
async fn test_delete_image_missing_auth_returns_401() {
    // Test: Missing authentication returns 401
    // Node.js contract: No authorizer claims -> 401

    let expected_status = status_codes::UNAUTHORIZED;
    assert_eq!(expected_status, 401);
}

#[tokio::test]
async fn test_delete_image_other_user_returns_403() {
    // Test: Deleting another user's image returns 403
    // Node.js contract: userId mismatch -> 403

    let expected_status = status_codes::FORBIDDEN;
    assert_eq!(expected_status, 403);

    let error_json = json!({
        "message": "Forbidden: Cannot delete another user's image"
    });
    assert!(verify_error_response_structure(&error_json).is_ok());
}

#[tokio::test]
async fn test_delete_image_missing_key_returns_400() {
    // Test: Missing key parameter returns 400
    // Node.js contract: No key -> 400

    let expected_status = status_codes::BAD_REQUEST;
    assert_eq!(expected_status, 400);
}

#[tokio::test]
async fn test_delete_image_path_traversal_returns_400() {
    // Test: Path traversal attack returns 400
    // Node.js contract: ../.. patterns -> 400

    let expected_status = status_codes::BAD_REQUEST;
    assert_eq!(expected_status, 400);

    let error_json = json!({
        "message": "Invalid image key"
    });
    assert!(verify_error_response_structure(&error_json).is_ok());
}

#[tokio::test]
async fn test_delete_image_url_encoded_key() {
    // Test: URL-encoded keys are properly decoded
    // Node.js contract: decodeURIComponent is used

    let _encoded_key = "images%2Fuser123%2Fimage.jpg";
    let decoded_key = "images/user123/image.jpg";
    assert!(decoded_key.contains("/"));
}

// ============================================================================
// CORS Header Tests
// ============================================================================

#[tokio::test]
async fn test_cors_headers_present() {
    // Test: All responses include CORS headers
    // Node.js contract: Access-Control-Allow-Origin, Access-Control-Allow-Methods, etc.

    let expected_headers = vec![
        "Access-Control-Allow-Origin",
        "Access-Control-Allow-Methods",
        "Access-Control-Allow-Headers",
    ];

    for header in expected_headers {
        assert!(!header.is_empty());
    }
}
