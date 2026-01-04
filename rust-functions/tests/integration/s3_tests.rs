//! Integration tests for S3 operations.
//!
//! These tests verify S3 operations against LocalStack.
//! Run with: `./scripts/run-integration-tests.sh`

use aws_sdk_s3::presigning::PresigningConfig;
use std::time::Duration;

use super::test_helpers::{create_s3_client, generate_test_id, TestConfig};

/// Test: Upload and download an object from S3.
#[tokio::test]
#[ignore] // Requires LocalStack running
async fn test_s3_put_and_get_object() {
    let client = create_s3_client().await;
    let config = TestConfig::from_env();
    let object_key = format!("test-images/{}/test-object.txt", generate_test_id());
    let content = "Hello, S3 Integration Test!";

    // Put object
    let put_result = client
        .put_object()
        .bucket(&config.bucket_name)
        .key(&object_key)
        .body(content.as_bytes().to_vec().into())
        .content_type("text/plain")
        .send()
        .await;

    assert!(put_result.is_ok(), "PutObject should succeed: {:?}", put_result.err());

    // Get object
    let get_result = client
        .get_object()
        .bucket(&config.bucket_name)
        .key(&object_key)
        .send()
        .await;

    assert!(get_result.is_ok(), "GetObject should succeed: {:?}", get_result.err());

    let body = get_result.unwrap().body.collect().await.unwrap();
    let body_str = String::from_utf8(body.into_bytes().to_vec()).unwrap();
    assert_eq!(body_str, content, "Object content should match");

    // Cleanup
    let _ = client
        .delete_object()
        .bucket(&config.bucket_name)
        .key(&object_key)
        .send()
        .await;
}

/// Test: Delete an object from S3.
#[tokio::test]
#[ignore] // Requires LocalStack running
async fn test_s3_delete_object() {
    let client = create_s3_client().await;
    let config = TestConfig::from_env();
    let object_key = format!("test-images/{}/delete-test.txt", generate_test_id());

    // Put object first
    client
        .put_object()
        .bucket(&config.bucket_name)
        .key(&object_key)
        .body("Delete me".as_bytes().to_vec().into())
        .send()
        .await
        .expect("PutObject should succeed");

    // Delete object
    let delete_result = client
        .delete_object()
        .bucket(&config.bucket_name)
        .key(&object_key)
        .send()
        .await;

    assert!(delete_result.is_ok(), "DeleteObject should succeed");

    // Verify deletion (should get error or empty)
    let get_result = client
        .get_object()
        .bucket(&config.bucket_name)
        .key(&object_key)
        .send()
        .await;

    assert!(get_result.is_err(), "Object should not exist after deletion");
}

/// Test: Generate a pre-signed URL for PUT operation.
#[tokio::test]
#[ignore] // Requires LocalStack running
async fn test_s3_presigned_put_url() {
    let client = create_s3_client().await;
    let config = TestConfig::from_env();
    let object_key = format!("test-images/{}/presigned-upload.png", generate_test_id());

    // Generate pre-signed URL for PUT
    let presigning_config = PresigningConfig::builder()
        .expires_in(Duration::from_secs(900)) // 15 minutes
        .build()
        .expect("Failed to build presigning config");

    let presigned_request = client
        .put_object()
        .bucket(&config.bucket_name)
        .key(&object_key)
        .content_type("image/png")
        .presigned(presigning_config)
        .await;

    assert!(presigned_request.is_ok(), "Pre-signed URL generation should succeed");

    let url = presigned_request.unwrap().uri().to_string();
    assert!(url.contains(&config.bucket_name), "URL should contain bucket name");
    assert!(url.contains(&object_key), "URL should contain object key");
    assert!(url.contains("X-Amz-Signature"), "URL should contain signature");

    // Cleanup (object may not exist if not uploaded)
    let _ = client
        .delete_object()
        .bucket(&config.bucket_name)
        .key(&object_key)
        .send()
        .await;
}

/// Test: Generate a pre-signed URL for GET operation.
#[tokio::test]
#[ignore] // Requires LocalStack running
async fn test_s3_presigned_get_url() {
    let client = create_s3_client().await;
    let config = TestConfig::from_env();
    let object_key = format!("test-images/{}/presigned-download.txt", generate_test_id());

    // Put object first
    client
        .put_object()
        .bucket(&config.bucket_name)
        .key(&object_key)
        .body("Content for pre-signed download".as_bytes().to_vec().into())
        .send()
        .await
        .expect("PutObject should succeed");

    // Generate pre-signed URL for GET
    let presigning_config = PresigningConfig::builder()
        .expires_in(Duration::from_secs(300)) // 5 minutes
        .build()
        .expect("Failed to build presigning config");

    let presigned_request = client
        .get_object()
        .bucket(&config.bucket_name)
        .key(&object_key)
        .presigned(presigning_config)
        .await;

    assert!(presigned_request.is_ok(), "Pre-signed GET URL generation should succeed");

    let url = presigned_request.unwrap().uri().to_string();
    assert!(url.contains("X-Amz-Expires"), "URL should contain expiry parameter");

    // Cleanup
    let _ = client
        .delete_object()
        .bucket(&config.bucket_name)
        .key(&object_key)
        .send()
        .await;
}

/// Test: Batch delete multiple objects.
#[tokio::test]
#[ignore] // Requires LocalStack running
async fn test_s3_delete_objects_batch() {
    let client = create_s3_client().await;
    let config = TestConfig::from_env();
    let prefix = format!("test-images/{}", generate_test_id());
    let object_keys: Vec<String> = (0..5)
        .map(|i| format!("{}/image-{}.png", prefix, i))
        .collect();

    // Put multiple objects
    for key in &object_keys {
        client
            .put_object()
            .bucket(&config.bucket_name)
            .key(key)
            .body(format!("Content for {}", key).as_bytes().to_vec().into())
            .send()
            .await
            .expect("PutObject should succeed");
    }

    // Verify objects exist
    for key in &object_keys {
        let result = client
            .head_object()
            .bucket(&config.bucket_name)
            .key(key)
            .send()
            .await;
        assert!(result.is_ok(), "Object {} should exist", key);
    }

    // Build delete objects request
    let objects_to_delete: Vec<aws_sdk_s3::types::ObjectIdentifier> = object_keys
        .iter()
        .map(|key| {
            aws_sdk_s3::types::ObjectIdentifier::builder()
                .key(key)
                .build()
                .unwrap()
        })
        .collect();

    // Batch delete
    let delete_result = client
        .delete_objects()
        .bucket(&config.bucket_name)
        .delete(
            aws_sdk_s3::types::Delete::builder()
                .set_objects(Some(objects_to_delete))
                .build()
                .unwrap(),
        )
        .send()
        .await;

    assert!(delete_result.is_ok(), "DeleteObjects should succeed");

    // Verify all objects are deleted
    for key in &object_keys {
        let result = client
            .head_object()
            .bucket(&config.bucket_name)
            .key(key)
            .send()
            .await;
        assert!(result.is_err(), "Object {} should be deleted", key);
    }
}

/// Test: List objects with prefix.
#[tokio::test]
#[ignore] // Requires LocalStack running
async fn test_s3_list_objects_with_prefix() {
    let client = create_s3_client().await;
    let config = TestConfig::from_env();
    let prefix = format!("test-images/{}", generate_test_id());
    let object_keys: Vec<String> = (0..3)
        .map(|i| format!("{}/file-{}.txt", prefix, i))
        .collect();

    // Put objects
    for key in &object_keys {
        client
            .put_object()
            .bucket(&config.bucket_name)
            .key(key)
            .body("Test content".as_bytes().to_vec().into())
            .send()
            .await
            .expect("PutObject should succeed");
    }

    // List objects with prefix
    let list_result = client
        .list_objects_v2()
        .bucket(&config.bucket_name)
        .prefix(&prefix)
        .send()
        .await;

    assert!(list_result.is_ok(), "ListObjectsV2 should succeed");

    let contents = list_result.unwrap().contents.unwrap_or_default();
    assert_eq!(contents.len(), 3, "Should find 3 objects with prefix");

    // Cleanup
    for key in &object_keys {
        let _ = client
            .delete_object()
            .bucket(&config.bucket_name)
            .key(key)
            .send()
            .await;
    }
}

/// Test: Copy object within bucket.
#[tokio::test]
#[ignore] // Requires LocalStack running
async fn test_s3_copy_object() {
    let client = create_s3_client().await;
    let config = TestConfig::from_env();
    let source_key = format!("test-images/{}/source.txt", generate_test_id());
    let dest_key = format!("test-images/{}/destination.txt", generate_test_id());
    let content = "Content to be copied";

    // Put source object
    client
        .put_object()
        .bucket(&config.bucket_name)
        .key(&source_key)
        .body(content.as_bytes().to_vec().into())
        .send()
        .await
        .expect("PutObject should succeed");

    // Copy object
    let copy_result = client
        .copy_object()
        .bucket(&config.bucket_name)
        .key(&dest_key)
        .copy_source(format!("{}/{}", config.bucket_name, source_key))
        .send()
        .await;

    assert!(copy_result.is_ok(), "CopyObject should succeed");

    // Verify destination exists with same content
    let get_result = client
        .get_object()
        .bucket(&config.bucket_name)
        .key(&dest_key)
        .send()
        .await
        .expect("GetObject should succeed");

    let body = get_result.body.collect().await.unwrap();
    let body_str = String::from_utf8(body.into_bytes().to_vec()).unwrap();
    assert_eq!(body_str, content, "Copied content should match");

    // Cleanup
    let _ = client.delete_object().bucket(&config.bucket_name).key(&source_key).send().await;
    let _ = client.delete_object().bucket(&config.bucket_name).key(&dest_key).send().await;
}

/// Test: Object metadata (content type, custom metadata).
#[tokio::test]
#[ignore] // Requires LocalStack running
async fn test_s3_object_metadata() {
    let client = create_s3_client().await;
    let config = TestConfig::from_env();
    let object_key = format!("test-images/{}/metadata-test.png", generate_test_id());

    // Put object with metadata
    let put_result = client
        .put_object()
        .bucket(&config.bucket_name)
        .key(&object_key)
        .body(vec![0u8; 100].into()) // Dummy PNG-like content
        .content_type("image/png")
        .metadata("x-amz-meta-user-id", "test-user-123")
        .metadata("x-amz-meta-upload-source", "integration-test")
        .send()
        .await;

    assert!(put_result.is_ok(), "PutObject with metadata should succeed");

    // Get object metadata
    let head_result = client
        .head_object()
        .bucket(&config.bucket_name)
        .key(&object_key)
        .send()
        .await;

    assert!(head_result.is_ok(), "HeadObject should succeed");

    let metadata = head_result.unwrap();
    assert_eq!(metadata.content_type(), Some("image/png"), "Content type should match");

    // Cleanup
    let _ = client.delete_object().bucket(&config.bucket_name).key(&object_key).send().await;
}

/// Test: Pre-signed URL with content length restriction.
#[tokio::test]
#[ignore] // Requires LocalStack running
async fn test_s3_presigned_with_content_length() {
    let client = create_s3_client().await;
    let config = TestConfig::from_env();
    let object_key = format!("test-images/{}/size-restricted.png", generate_test_id());
    let max_size: i64 = 5 * 1024 * 1024; // 5MB

    // Generate pre-signed URL with content length
    let presigning_config = PresigningConfig::builder()
        .expires_in(Duration::from_secs(900))
        .build()
        .expect("Failed to build presigning config");

    let presigned_request = client
        .put_object()
        .bucket(&config.bucket_name)
        .key(&object_key)
        .content_type("image/png")
        .content_length(max_size)
        .presigned(presigning_config)
        .await;

    assert!(presigned_request.is_ok(), "Pre-signed URL with content length should succeed");

    let url = presigned_request.unwrap().uri().to_string();
    assert!(!url.is_empty(), "Pre-signed URL should not be empty");
}
