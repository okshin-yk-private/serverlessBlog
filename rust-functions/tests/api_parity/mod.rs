//! API Parity Tests for Rust Lambda Functions
//!
//! These tests verify that the Rust Lambda functions produce API responses
//! that are compatible with the existing Node.js implementations.
//!
//! ## Test Methodology
//!
//! The tests compare:
//! - HTTP status codes
//! - Response JSON structure and field names
//! - Error response format
//! - camelCase field naming convention
//!
//! ## Running the Tests
//!
//! ```bash
//! cd rust-functions
//! ./scripts/run-integration-tests.sh
//! cargo test --test api_parity_tests -- --ignored
//! ```

pub mod auth_parity;
pub mod images_parity;
pub mod posts_parity;
pub mod test_utils;
