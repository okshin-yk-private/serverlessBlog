//! Application constants matching the Node.js implementation.

/// HTTP status codes used in responses.
pub mod http_status {
    pub const OK: u16 = 200;
    pub const CREATED: u16 = 201;
    pub const NO_CONTENT: u16 = 204;
    pub const BAD_REQUEST: u16 = 400;
    pub const UNAUTHORIZED: u16 = 401;
    pub const FORBIDDEN: u16 = 403;
    pub const NOT_FOUND: u16 = 404;
    pub const INTERNAL_SERVER_ERROR: u16 = 500;
}

/// CORS headers for API responses.
pub mod cors {
    pub const ALLOW_ORIGIN: &str = "*";
    pub const ALLOW_METHODS: &str = "GET, POST, PUT, DELETE, OPTIONS";
    pub const ALLOW_HEADERS: &str = "Content-Type, Authorization";
}

/// Publication status values.
pub mod publish_status {
    pub const DRAFT: &str = "draft";
    pub const PUBLISHED: &str = "published";
}

/// DynamoDB index names.
pub mod dynamodb_indexes {
    pub const PUBLISH_STATUS_INDEX: &str = "PublishStatusIndex";
    pub const CATEGORY_INDEX: &str = "CategoryIndex";
}

/// Default pagination values.
pub mod pagination {
    pub const DEFAULT_LIMIT: i32 = 10;
    pub const MAX_LIMIT: i32 = 100;
}

/// Image upload configuration.
pub mod image_upload {
    /// Pre-signed URL expiration in seconds (15 minutes).
    pub const PRESIGNED_URL_EXPIRATION_SECS: u64 = 900;

    /// Maximum file size in bytes (5 MB).
    pub const MAX_FILE_SIZE_BYTES: u64 = 5 * 1024 * 1024;

    /// Allowed file extensions.
    pub const ALLOWED_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "gif", "webp"];

    /// Allowed content types.
    pub const ALLOWED_CONTENT_TYPES: &[&str] =
        &["image/jpeg", "image/png", "image/gif", "image/webp"];
}

/// CloudWatch metrics configuration.
pub mod metrics {
    pub const NAMESPACE: &str = "BlogPlatform";
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_allowed_extensions() {
        assert!(image_upload::ALLOWED_EXTENSIONS.contains(&"jpg"));
        assert!(image_upload::ALLOWED_EXTENSIONS.contains(&"webp"));
        assert!(!image_upload::ALLOWED_EXTENSIONS.contains(&"bmp"));
    }

    #[test]
    fn test_allowed_content_types() {
        assert!(image_upload::ALLOWED_CONTENT_TYPES.contains(&"image/jpeg"));
        assert!(!image_upload::ALLOWED_CONTENT_TYPES.contains(&"image/bmp"));
    }
}
