//! Test helper utilities for integration tests.

use aws_sdk_dynamodb::types::AttributeValue;
use std::collections::HashMap;
use uuid::Uuid;

/// Configuration for integration test environment.
pub struct TestConfig {
    pub dynamodb_endpoint: String,
    pub s3_endpoint: String,
    pub cognito_endpoint: String,
    pub table_name: String,
    pub bucket_name: String,
    pub user_pool_id: String,
    pub client_id: String,
}

impl TestConfig {
    /// Load configuration from environment variables.
    pub fn from_env() -> Self {
        Self {
            dynamodb_endpoint: std::env::var("DYNAMODB_ENDPOINT")
                .unwrap_or_else(|_| "http://localhost:8000".to_string()),
            s3_endpoint: std::env::var("S3_ENDPOINT")
                .unwrap_or_else(|_| "http://localhost:4566".to_string()),
            cognito_endpoint: std::env::var("COGNITO_ENDPOINT")
                .unwrap_or_else(|_| "http://localhost:4566".to_string()),
            table_name: std::env::var("TABLE_NAME").unwrap_or_else(|_| "BlogPosts".to_string()),
            bucket_name: std::env::var("BUCKET_NAME")
                .unwrap_or_else(|_| "serverless-blog-images".to_string()),
            user_pool_id: std::env::var("USER_POOL_ID")
                .unwrap_or_else(|_| "local_user_pool".to_string()),
            client_id: std::env::var("USER_POOL_CLIENT_ID")
                .unwrap_or_else(|_| "local_client_id".to_string()),
        }
    }
}

/// Creates a DynamoDB client configured for local testing.
pub async fn create_dynamodb_client() -> aws_sdk_dynamodb::Client {
    let config = TestConfig::from_env();
    let aws_config = aws_config::defaults(aws_config::BehaviorVersion::latest())
        .endpoint_url(&config.dynamodb_endpoint)
        .region(aws_config::Region::new("us-east-1"))
        .load()
        .await;
    aws_sdk_dynamodb::Client::new(&aws_config)
}

/// Creates an S3 client configured for LocalStack.
pub async fn create_s3_client() -> aws_sdk_s3::Client {
    let config = TestConfig::from_env();
    let aws_config = aws_config::defaults(aws_config::BehaviorVersion::latest())
        .endpoint_url(&config.s3_endpoint)
        .region(aws_config::Region::new("us-east-1"))
        .load()
        .await;
    aws_sdk_s3::Client::from_conf(
        aws_sdk_s3::Config::builder()
            .behavior_version(aws_config::BehaviorVersion::latest())
            .endpoint_url(&config.s3_endpoint)
            .region(aws_config::Region::new("us-east-1"))
            .force_path_style(true)
            .credentials_provider(aws_config.credentials_provider().unwrap().clone())
            .build(),
    )
}

/// Creates a Cognito client configured for LocalStack.
pub async fn create_cognito_client() -> aws_sdk_cognitoidentityprovider::Client {
    let config = TestConfig::from_env();
    let aws_config = aws_config::defaults(aws_config::BehaviorVersion::latest())
        .endpoint_url(&config.cognito_endpoint)
        .region(aws_config::Region::new("us-east-1"))
        .load()
        .await;
    aws_sdk_cognitoidentityprovider::Client::new(&aws_config)
}

/// Generates a unique test post ID.
pub fn generate_test_id() -> String {
    Uuid::new_v4().to_string()
}

/// Creates a test blog post item for DynamoDB.
pub fn create_test_post_item(
    id: &str,
    title: &str,
    category: &str,
    publish_status: &str,
) -> HashMap<String, AttributeValue> {
    let now = chrono::Utc::now().to_rfc3339();
    let mut item = HashMap::new();

    item.insert("id".to_string(), AttributeValue::S(id.to_string()));
    item.insert("title".to_string(), AttributeValue::S(title.to_string()));
    item.insert(
        "contentMarkdown".to_string(),
        AttributeValue::S("# Test Content".to_string()),
    );
    item.insert(
        "contentHtml".to_string(),
        AttributeValue::S("<h1>Test Content</h1>".to_string()),
    );
    item.insert(
        "category".to_string(),
        AttributeValue::S(category.to_string()),
    );
    item.insert(
        "tags".to_string(),
        AttributeValue::L(vec![AttributeValue::S("test".to_string())]),
    );
    item.insert(
        "publishStatus".to_string(),
        AttributeValue::S(publish_status.to_string()),
    );
    item.insert(
        "authorId".to_string(),
        AttributeValue::S("test-author".to_string()),
    );
    item.insert("createdAt".to_string(), AttributeValue::S(now.clone()));
    item.insert("updatedAt".to_string(), AttributeValue::S(now.clone()));
    item.insert("imageUrls".to_string(), AttributeValue::L(vec![]));

    if publish_status == "published" {
        item.insert("publishedAt".to_string(), AttributeValue::S(now));
    }

    item
}

/// Cleans up test data from DynamoDB.
pub async fn cleanup_test_data(
    client: &aws_sdk_dynamodb::Client,
    table_name: &str,
    ids: &[String],
) {
    for id in ids {
        let _ = client
            .delete_item()
            .table_name(table_name)
            .key("id", AttributeValue::S(id.clone()))
            .send()
            .await;
    }
}
