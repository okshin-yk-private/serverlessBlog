//! Tracing configuration for Lambda functions.
//!
//! Configures structured JSON logging compatible with CloudWatch Logs Insights.

use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

/// Initializes the tracing subscriber for Lambda functions.
///
/// This function configures:
/// - JSON-formatted log output for CloudWatch compatibility
/// - Environment-based log level filtering (via `RUST_LOG` env var)
/// - Request context fields in log entries
///
/// # Panics
///
/// Panics if called more than once in the same process.
///
/// # Examples
///
/// ```no_run
/// use common::tracing_config::init_tracing;
///
/// init_tracing();
/// tracing::info!("Lambda function started");
/// ```
pub fn init_tracing() {
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));

    tracing_subscriber::registry()
        .with(filter)
        .with(
            fmt::layer()
                .json()
                .with_current_span(false)
                .with_ansi(false)
                .without_time() // CloudWatch adds timestamps
                .with_target(false)
                .flatten_event(true),
        )
        .init();
}

/// Initializes tracing for test environments.
///
/// Uses a more readable format suitable for test output.
#[cfg(test)]
pub fn init_test_tracing() {
    let _ = tracing_subscriber::fmt()
        .with_test_writer()
        .with_max_level(tracing::Level::DEBUG)
        .try_init();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_init_test_tracing() {
        // Should not panic when called multiple times
        init_test_tracing();
        init_test_tracing();
    }
}
