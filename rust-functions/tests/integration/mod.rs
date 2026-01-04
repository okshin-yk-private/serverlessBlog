//! Integration test modules for Rust Lambda functions.
//!
//! These tests require DynamoDB Local and LocalStack to be running.
//! Use the `run-integration-tests.sh` script to set up the environment.

pub mod dynamodb_tests;
pub mod s3_tests;
pub mod cognito_tests;
pub mod test_helpers;
