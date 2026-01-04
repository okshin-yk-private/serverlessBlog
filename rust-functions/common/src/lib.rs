//! Common library for serverless blog Lambda functions.
//!
//! This crate provides shared types, utilities, and configurations
//! used across all Lambda function handlers.

pub mod clients;
pub mod constants;
pub mod error;
pub mod markdown;
pub mod metrics;
pub mod tracing_config;
pub mod types;

// Re-export commonly used items
pub use error::{CognitoErrorExt, DomainError, DynamoDbErrorExt, S3ErrorExt};
pub use markdown::markdown_to_safe_html;
pub use metrics::{create_metrics_recorder, MetricsRecorder};
pub use tracing_config::init_tracing;
pub use types::*;
