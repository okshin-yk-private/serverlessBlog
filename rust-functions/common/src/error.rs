//! Domain error types and HTTP response mapping.

use lambda_http::{http::StatusCode, Body, Response};
use serde_json::json;
use thiserror::Error;

/// Domain-level errors that can occur in Lambda handlers.
#[derive(Error, Debug)]
pub enum DomainError {
    /// Validation error (400 Bad Request)
    #[error("Validation error: {0}")]
    Validation(String),

    /// Resource not found (404 Not Found)
    #[error("Resource not found: {0}")]
    NotFound(String),

    /// Authentication required or failed (401 Unauthorized)
    #[error("Unauthorized: {0}")]
    Unauthorized(String),

    /// Access denied (403 Forbidden)
    #[error("Forbidden: {0}")]
    Forbidden(String),

    /// DynamoDB operation failed (500 Internal Server Error)
    #[error("DynamoDB error: {0}")]
    DynamoDB(String),

    /// S3 operation failed (500 Internal Server Error)
    #[error("S3 error: {0}")]
    S3(String),

    /// Cognito operation failed (500 Internal Server Error)
    #[error("Cognito error: {0}")]
    Cognito(String),

    /// Internal server error (500 Internal Server Error)
    #[error("Internal error: {0}")]
    Internal(String),
}

impl DomainError {
    /// Returns the HTTP status code for this error.
    pub fn status_code(&self) -> StatusCode {
        match self {
            Self::Validation(_) => StatusCode::BAD_REQUEST,
            Self::NotFound(_) => StatusCode::NOT_FOUND,
            Self::Unauthorized(_) => StatusCode::UNAUTHORIZED,
            Self::Forbidden(_) => StatusCode::FORBIDDEN,
            Self::DynamoDB(_) | Self::S3(_) | Self::Cognito(_) | Self::Internal(_) => {
                StatusCode::INTERNAL_SERVER_ERROR
            }
        }
    }

    /// Returns the user-facing error message.
    pub fn user_message(&self) -> String {
        match self {
            Self::Validation(msg) => msg.clone(),
            Self::NotFound(msg) => msg.clone(),
            Self::Unauthorized(msg) => msg.clone(),
            Self::Forbidden(msg) => msg.clone(),
            // Don't expose internal error details to users
            Self::DynamoDB(_) | Self::S3(_) | Self::Cognito(_) | Self::Internal(_) => {
                "Internal Server Error".to_string()
            }
        }
    }

    /// Converts the error into an HTTP response.
    pub fn into_response(self) -> Response<Body> {
        let status = self.status_code();
        let message = self.user_message();

        // Log the full error for debugging
        tracing::error!(
            error = %self,
            status = %status.as_u16(),
            "Request failed"
        );

        Response::builder()
            .status(status)
            .header("Content-Type", "application/json")
            .header("Access-Control-Allow-Origin", "*")
            .body(Body::from(json!({ "message": message }).to_string()))
            .expect("Failed to build error response")
    }
}

/// Extension trait for converting DynamoDB errors to domain errors.
pub trait DynamoDbErrorExt<T> {
    fn map_dynamodb_err(self) -> Result<T, DomainError>;
}

impl<T, E: std::fmt::Display, R> DynamoDbErrorExt<T>
    for Result<T, aws_smithy_runtime_api::client::result::SdkError<E, R>>
{
    fn map_dynamodb_err(self) -> Result<T, DomainError> {
        self.map_err(|e| DomainError::DynamoDB(e.to_string()))
    }
}

/// Extension trait for converting S3 errors to domain errors.
pub trait S3ErrorExt<T> {
    fn map_s3_err(self) -> Result<T, DomainError>;
}

impl<T, E: std::fmt::Display, R> S3ErrorExt<T>
    for Result<T, aws_smithy_runtime_api::client::result::SdkError<E, R>>
{
    fn map_s3_err(self) -> Result<T, DomainError> {
        self.map_err(|e| DomainError::S3(e.to_string()))
    }
}

/// Extension trait for converting Cognito errors to domain errors.
pub trait CognitoErrorExt<T> {
    fn map_cognito_err(self) -> Result<T, DomainError>;
}

impl<T, E: std::fmt::Display, R> CognitoErrorExt<T>
    for Result<T, aws_smithy_runtime_api::client::result::SdkError<E, R>>
{
    fn map_cognito_err(self) -> Result<T, DomainError> {
        self.map_err(|e| DomainError::Cognito(e.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validation_error() {
        let err = DomainError::Validation("title is required".to_string());
        assert_eq!(err.status_code(), StatusCode::BAD_REQUEST);
        assert_eq!(err.user_message(), "title is required");
    }

    #[test]
    fn test_not_found_error() {
        let err = DomainError::NotFound("Post not found".to_string());
        assert_eq!(err.status_code(), StatusCode::NOT_FOUND);
    }

    #[test]
    fn test_internal_error_hides_details() {
        let err = DomainError::DynamoDB("Connection timeout".to_string());
        assert_eq!(err.status_code(), StatusCode::INTERNAL_SERVER_ERROR);
        assert_eq!(err.user_message(), "Internal Server Error");
    }
}
