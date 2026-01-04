//! Test utilities for API parity testing.

use serde_json::Value;

/// Verify that a JSON value has the expected camelCase field names.
pub fn verify_camel_case_fields(value: &Value, expected_fields: &[&str]) -> Result<(), String> {
    let obj = value
        .as_object()
        .ok_or_else(|| "Expected JSON object".to_string())?;

    for field in expected_fields {
        if !obj.contains_key(*field) {
            return Err(format!("Missing expected field: {}", field));
        }
    }

    Ok(())
}

/// Verify that a blog post response has the correct structure.
pub fn verify_blog_post_structure(value: &Value) -> Result<(), String> {
    let expected_fields = [
        "id",
        "title",
        "contentMarkdown",
        "contentHtml",
        "category",
        "tags",
        "publishStatus",
        "authorId",
        "createdAt",
        "updatedAt",
    ];

    verify_camel_case_fields(value, &expected_fields)
}

/// Verify that a list posts response has the correct structure.
pub fn verify_list_posts_response_structure(value: &Value) -> Result<(), String> {
    let obj = value
        .as_object()
        .ok_or_else(|| "Expected JSON object".to_string())?;

    if !obj.contains_key("items") {
        return Err("Missing 'items' field in list response".to_string());
    }

    let items = obj
        .get("items")
        .and_then(|v: &Value| v.as_array())
        .ok_or_else(|| "'items' should be an array".to_string())?;

    // Verify first item structure if present
    if let Some(first_item) = items.first() {
        verify_blog_post_structure(first_item)?;
    }

    Ok(())
}

/// Verify that a public post response excludes contentMarkdown.
pub fn verify_public_post_structure(value: &Value) -> Result<(), String> {
    let obj = value
        .as_object()
        .ok_or_else(|| "Expected JSON object".to_string())?;

    // contentMarkdown should NOT be present in public posts
    if obj.contains_key("contentMarkdown") {
        return Err("Public post should not include contentMarkdown".to_string());
    }

    let expected_fields = [
        "id",
        "title",
        "contentHtml",
        "category",
        "tags",
        "publishStatus",
        "authorId",
        "createdAt",
        "updatedAt",
    ];

    verify_camel_case_fields(value, &expected_fields)
}

/// Verify that an error response has the correct structure.
pub fn verify_error_response_structure(value: &Value) -> Result<(), String> {
    let obj = value
        .as_object()
        .ok_or_else(|| "Expected JSON object".to_string())?;

    if !obj.contains_key("message") {
        return Err("Error response should have 'message' field".to_string());
    }

    Ok(())
}

/// Verify that a token response has the correct structure.
pub fn verify_token_response_structure(value: &Value) -> Result<(), String> {
    let expected_fields = ["accessToken", "idToken", "expiresIn"];

    verify_camel_case_fields(value, &expected_fields)
}

/// Verify that an upload URL response has the correct structure.
pub fn verify_upload_url_response_structure(value: &Value) -> Result<(), String> {
    let expected_fields = ["uploadUrl", "fileUrl", "key"];

    verify_camel_case_fields(value, &expected_fields)
}

/// HTTP status codes matching Node.js implementation.
pub mod status_codes {
    pub const OK: u16 = 200;
    pub const CREATED: u16 = 201;
    pub const NO_CONTENT: u16 = 204;
    pub const BAD_REQUEST: u16 = 400;
    pub const UNAUTHORIZED: u16 = 401;
    pub const FORBIDDEN: u16 = 403;
    pub const NOT_FOUND: u16 = 404;
    pub const INTERNAL_SERVER_ERROR: u16 = 500;
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_verify_blog_post_structure() {
        let valid_post = json!({
            "id": "123",
            "title": "Test",
            "contentMarkdown": "# Hello",
            "contentHtml": "<h1>Hello</h1>",
            "category": "tech",
            "tags": ["rust"],
            "publishStatus": "draft",
            "authorId": "user123",
            "createdAt": "2026-01-03T00:00:00Z",
            "updatedAt": "2026-01-03T00:00:00Z"
        });

        assert!(verify_blog_post_structure(&valid_post).is_ok());
    }

    #[test]
    fn test_verify_blog_post_structure_missing_field() {
        let invalid_post = json!({
            "id": "123",
            "title": "Test"
        });

        assert!(verify_blog_post_structure(&invalid_post).is_err());
    }

    #[test]
    fn test_verify_error_response_structure() {
        let error = json!({
            "message": "Something went wrong"
        });

        assert!(verify_error_response_structure(&error).is_ok());
    }

    #[test]
    fn test_verify_public_post_excludes_content_markdown() {
        let public_post = json!({
            "id": "123",
            "title": "Test",
            "contentMarkdown": "# Hello",  // Should NOT be present
            "contentHtml": "<h1>Hello</h1>",
            "category": "tech",
            "tags": ["rust"],
            "publishStatus": "published",
            "authorId": "user123",
            "createdAt": "2026-01-03T00:00:00Z",
            "updatedAt": "2026-01-03T00:00:00Z"
        });

        assert!(verify_public_post_structure(&public_post).is_err());
    }
}
