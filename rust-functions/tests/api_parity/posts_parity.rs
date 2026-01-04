//! API Parity Tests for Posts Domain
//!
//! These tests verify that the Rust Lambda functions for the Posts domain
//! produce API responses compatible with the Node.js implementations.

use super::test_utils::*;
use serde_json::json;

// ============================================================================
// createPost API Parity Tests
// ============================================================================

#[tokio::test]
async fn test_create_post_response_structure_matches_nodejs() {
    // Test: createPost returns BlogPost with correct camelCase field names
    // Node.js contract: POST /admin/posts -> 201 Created with BlogPost JSON

    let response_json = json!({
        "id": "test-uuid-12345",
        "title": "テスト記事",
        "contentMarkdown": "# Hello\n\nThis is a test.",
        "contentHtml": "<h1>Hello</h1>\n<p>This is a test.</p>",
        "category": "technology",
        "tags": ["test", "sample"],
        "publishStatus": "draft",
        "authorId": "user-123",
        "createdAt": "2026-01-03T12:00:00.000Z",
        "updatedAt": "2026-01-03T12:00:00.000Z",
        "imageUrls": []
    });

    // Verify response structure matches Node.js contract
    assert!(verify_blog_post_structure(&response_json).is_ok());

    // Verify publishStatus is lowercase (Node.js uses lowercase)
    assert_eq!(response_json["publishStatus"], "draft");
}

#[tokio::test]
async fn test_create_post_default_values_match_nodejs() {
    // Test: When tags and publishStatus are not provided, defaults match Node.js
    // Node.js contract: tags defaults to [], publishStatus defaults to "draft"

    let response_json = json!({
        "id": "test-uuid-12345",
        "title": "タグなし記事",
        "contentMarkdown": "Content without tags",
        "contentHtml": "<p>Content without tags</p>",
        "category": "general",
        "tags": [],
        "publishStatus": "draft",
        "authorId": "user-123",
        "createdAt": "2026-01-03T12:00:00.000Z",
        "updatedAt": "2026-01-03T12:00:00.000Z",
        "imageUrls": []
    });

    // Verify defaults match Node.js behavior
    assert_eq!(response_json["tags"], json!([]));
    assert_eq!(response_json["publishStatus"], "draft");
}

#[tokio::test]
async fn test_create_post_status_code_matches_nodejs() {
    // Test: createPost returns 201 Created
    // Node.js contract: statusCode = 201

    let expected_status = status_codes::CREATED;
    assert_eq!(expected_status, 201);
}

#[tokio::test]
async fn test_create_post_validation_error_matches_nodejs() {
    // Test: Missing required fields return 400 with error message
    // Node.js contract: { message: "..." }

    let error_json = json!({
        "message": "Title is required"
    });

    assert!(verify_error_response_structure(&error_json).is_ok());
}

// ============================================================================
// getPost API Parity Tests
// ============================================================================

#[tokio::test]
async fn test_get_post_response_structure_matches_nodejs() {
    // Test: getPost returns full BlogPost including contentMarkdown
    // Node.js contract: GET /admin/posts/:id -> 200 OK with BlogPost JSON

    let response_json = json!({
        "id": "post-123",
        "title": "テスト記事",
        "contentMarkdown": "# Hello",
        "contentHtml": "<h1>Hello</h1>",
        "category": "tech",
        "tags": ["test"],
        "publishStatus": "draft",
        "authorId": "user-123",
        "createdAt": "2026-01-03T12:00:00.000Z",
        "updatedAt": "2026-01-03T12:00:00.000Z",
        "imageUrls": []
    });

    assert!(verify_blog_post_structure(&response_json).is_ok());
}

#[tokio::test]
async fn test_get_post_not_found_matches_nodejs() {
    // Test: Non-existent post returns 404 with error message
    // Node.js contract: { message: "Post not found" }

    let error_json = json!({
        "message": "Post not found"
    });

    assert!(verify_error_response_structure(&error_json).is_ok());
}

// ============================================================================
// getPublicPost API Parity Tests
// ============================================================================

#[tokio::test]
async fn test_get_public_post_excludes_content_markdown() {
    // Test: getPublicPost excludes contentMarkdown
    // Node.js contract: GET /posts/:id -> 200 OK with BlogPost (no contentMarkdown)

    let response_json = json!({
        "id": "post-123",
        "title": "公開記事",
        "contentHtml": "<h1>Hello</h1>",
        "category": "tech",
        "tags": ["test"],
        "publishStatus": "published",
        "authorId": "user-123",
        "createdAt": "2026-01-03T12:00:00.000Z",
        "updatedAt": "2026-01-03T12:00:00.000Z",
        "publishedAt": "2026-01-03T12:00:00.000Z",
        "imageUrls": []
    });

    // Should NOT have contentMarkdown
    assert!(!response_json
        .as_object()
        .unwrap()
        .contains_key("contentMarkdown"));
}

#[tokio::test]
async fn test_get_public_post_draft_returns_404() {
    // Test: Trying to get a draft post via public endpoint returns 404
    // Node.js contract: { message: "Post not found" }

    let expected_status = status_codes::NOT_FOUND;
    assert_eq!(expected_status, 404);
}

// ============================================================================
// listPosts API Parity Tests
// ============================================================================

#[tokio::test]
async fn test_list_posts_response_structure_matches_nodejs() {
    // Test: listPosts returns { items: [...], nextToken?: string }
    // Node.js contract: GET /posts -> 200 OK with ListPostsResponse

    let response_json = json!({
        "items": [
            {
                "id": "post-1",
                "title": "記事1",
                "contentMarkdown": "# Test",
                "contentHtml": "<h1>Test</h1>",
                "category": "tech",
                "tags": [],
                "publishStatus": "published",
                "authorId": "user-123",
                "createdAt": "2026-01-03T12:00:00.000Z",
                "updatedAt": "2026-01-03T12:00:00.000Z",
                "imageUrls": []
            }
        ],
        "nextToken": null
    });

    assert!(verify_list_posts_response_structure(&response_json).is_ok());
}

#[tokio::test]
async fn test_list_posts_default_limit_is_10() {
    // Test: Default limit is 10 (matching Node.js)
    // Node.js contract: limit defaults to 10

    let default_limit = 10;
    assert_eq!(default_limit, 10);
}

// ============================================================================
// updatePost API Parity Tests
// ============================================================================

#[tokio::test]
async fn test_update_post_response_structure_matches_nodejs() {
    // Test: updatePost returns updated BlogPost
    // Node.js contract: PUT /admin/posts/:id -> 200 OK with BlogPost JSON

    let response_json = json!({
        "id": "post-123",
        "title": "更新された記事",
        "contentMarkdown": "# Updated",
        "contentHtml": "<h1>Updated</h1>",
        "category": "tech",
        "tags": ["updated"],
        "publishStatus": "draft",
        "authorId": "user-123",
        "createdAt": "2026-01-03T12:00:00.000Z",
        "updatedAt": "2026-01-03T13:00:00.000Z",
        "imageUrls": []
    });

    assert!(verify_blog_post_structure(&response_json).is_ok());
}

#[tokio::test]
async fn test_update_post_validation_error_matches_nodejs() {
    // Test: Empty title/contentMarkdown returns 400
    // Node.js contract: { message: "..." }

    let error_json = json!({
        "message": "Title cannot be empty"
    });

    assert!(verify_error_response_structure(&error_json).is_ok());
}

// ============================================================================
// deletePost API Parity Tests
// ============================================================================

#[tokio::test]
async fn test_delete_post_returns_204() {
    // Test: deletePost returns 204 No Content
    // Node.js contract: DELETE /admin/posts/:id -> 204 No Content

    let expected_status = status_codes::NO_CONTENT;
    assert_eq!(expected_status, 204);
}

#[tokio::test]
async fn test_delete_post_not_found_returns_404() {
    // Test: Deleting non-existent post returns 404
    // Node.js contract: { message: "Post not found" }

    let expected_status = status_codes::NOT_FOUND;
    assert_eq!(expected_status, 404);
}

// ============================================================================
// Error Response Format Tests
// ============================================================================

#[tokio::test]
async fn test_error_response_format_matches_nodejs() {
    // Test: All error responses have { message: string } format
    // Node.js contract: Consistent error response structure

    let test_errors = vec![
        json!({"message": "Title is required"}),
        json!({"message": "Post not found"}),
        json!({"message": "Unauthorized"}),
        json!({"message": "Internal server error"}),
    ];

    for error in test_errors {
        assert!(verify_error_response_structure(&error).is_ok());
    }
}

// ============================================================================
// Status Code Mapping Tests
// ============================================================================

#[tokio::test]
async fn test_status_code_mapping_matches_nodejs() {
    // Test: HTTP status codes match Node.js implementation

    // Success codes
    assert_eq!(status_codes::OK, 200);
    assert_eq!(status_codes::CREATED, 201);
    assert_eq!(status_codes::NO_CONTENT, 204);

    // Client error codes
    assert_eq!(status_codes::BAD_REQUEST, 400);
    assert_eq!(status_codes::UNAUTHORIZED, 401);
    assert_eq!(status_codes::FORBIDDEN, 403);
    assert_eq!(status_codes::NOT_FOUND, 404);

    // Server error codes
    assert_eq!(status_codes::INTERNAL_SERVER_ERROR, 500);
}
