//! API Parity Tests Entry Point
//!
//! These tests verify that the Rust Lambda functions produce API responses
//! that are compatible with the existing Node.js implementations.
//!
//! ## Test Coverage
//!
//! The tests cover:
//! - Response JSON structure (camelCase field names)
//! - HTTP status codes
//! - Error response format
//! - Default values and edge cases
//!
//! ## Running the Tests
//!
//! ```bash
//! cd rust-functions
//! # Run all API parity tests
//! cargo test --test api_parity_tests
//!
//! # Run with DynamoDB Local and LocalStack
//! ./scripts/run-integration-tests.sh
//! cargo test --test api_parity_tests -- --ignored
//! ```

mod api_parity;

// Re-export all parity tests
pub use api_parity::*;
