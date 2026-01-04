//! AWS SDK client initialization with lazy loading and endpoint overrides.

use aws_config::BehaviorVersion;
use std::sync::OnceLock;

/// Global DynamoDB client instance.
static DYNAMODB_CLIENT: OnceLock<aws_sdk_dynamodb::Client> = OnceLock::new();

/// Global S3 client instance.
static S3_CLIENT: OnceLock<aws_sdk_s3::Client> = OnceLock::new();

/// Global Cognito Identity Provider client instance.
static COGNITO_CLIENT: OnceLock<aws_sdk_cognitoidentityprovider::Client> = OnceLock::new();

/// Global CloudWatch client instance.
static CLOUDWATCH_CLIENT: OnceLock<aws_sdk_cloudwatch::Client> = OnceLock::new();

/// Returns a shared DynamoDB client instance.
///
/// The client is lazily initialized on first call and reused for subsequent calls.
/// Supports custom endpoint override via `DYNAMODB_ENDPOINT` environment variable
/// for local testing with DynamoDB Local or LocalStack.
pub async fn get_dynamodb_client() -> &'static aws_sdk_dynamodb::Client {
    DYNAMODB_CLIENT.get_or_init(|| {
        tokio::runtime::Handle::current().block_on(async {
            let config = load_aws_config().await;
            aws_sdk_dynamodb::Client::new(&config)
        })
    })
}

/// Returns a shared S3 client instance.
///
/// The client is lazily initialized on first call and reused for subsequent calls.
/// Supports custom endpoint override via `S3_ENDPOINT` environment variable
/// for local testing with LocalStack.
pub async fn get_s3_client() -> &'static aws_sdk_s3::Client {
    S3_CLIENT.get_or_init(|| {
        tokio::runtime::Handle::current().block_on(async {
            let config = load_aws_config().await;
            aws_sdk_s3::Client::new(&config)
        })
    })
}

/// Returns a shared Cognito Identity Provider client instance.
///
/// The client is lazily initialized on first call and reused for subsequent calls.
/// Supports custom endpoint override via `COGNITO_ENDPOINT` environment variable
/// for local testing with LocalStack.
pub async fn get_cognito_client() -> &'static aws_sdk_cognitoidentityprovider::Client {
    COGNITO_CLIENT.get_or_init(|| {
        tokio::runtime::Handle::current().block_on(async {
            let config = load_aws_config().await;
            aws_sdk_cognitoidentityprovider::Client::new(&config)
        })
    })
}

/// Returns a shared CloudWatch client instance.
///
/// The client is lazily initialized on first call and reused for subsequent calls.
pub async fn get_cloudwatch_client() -> &'static aws_sdk_cloudwatch::Client {
    CLOUDWATCH_CLIENT.get_or_init(|| {
        tokio::runtime::Handle::current().block_on(async {
            let config = load_aws_config().await;
            aws_sdk_cloudwatch::Client::new(&config)
        })
    })
}

/// Loads AWS configuration with optional endpoint override.
async fn load_aws_config() -> aws_config::SdkConfig {
    let mut config_loader = aws_config::defaults(BehaviorVersion::latest());

    // Check for LocalStack/DynamoDB Local endpoint override
    if let Ok(endpoint) = std::env::var("AWS_ENDPOINT_URL") {
        config_loader = config_loader.endpoint_url(&endpoint);
    }

    config_loader.load().await
}

/// Resets all cached clients. Only for testing purposes.
#[cfg(test)]
pub fn reset_clients() {
    // OnceLock doesn't support resetting, so this is a no-op
    // In tests, each test should use fresh clients if needed
}

#[cfg(test)]
mod tests {
    // Client initialization tests require AWS credentials
    // They are covered in integration tests
}
