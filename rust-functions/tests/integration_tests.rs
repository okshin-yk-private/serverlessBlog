//! Integration tests for Rust Lambda functions.
//!
//! These tests require DynamoDB Local and LocalStack to be running.
//! Use the `run-integration-tests.sh` script to set up the environment:
//!
//! ```bash
//! cd rust-functions
//! ./scripts/run-integration-tests.sh
//! ```
//!
//! Or run individual tests with:
//!
//! ```bash
//! # Start containers
//! docker compose up -d
//!
//! # Set environment variables
//! export DYNAMODB_ENDPOINT=http://localhost:8000
//! export S3_ENDPOINT=http://localhost:4566
//! export COGNITO_ENDPOINT=http://localhost:4566
//! export TABLE_NAME=BlogPosts
//! export BUCKET_NAME=serverless-blog-images
//!
//! # Run tests (ignored by default)
//! cargo test --test integration_tests -- --ignored
//! ```

mod integration {
    pub mod cognito_tests;
    pub mod dynamodb_tests;
    pub mod s3_tests;
    pub mod test_helpers;
}

// Re-export all tests
pub use integration::*;
