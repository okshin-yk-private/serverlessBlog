//! Integration tests for DynamoDB operations.
//!
//! These tests verify CRUD operations against DynamoDB Local.
//! Run with: `./scripts/run-integration-tests.sh`

use aws_sdk_dynamodb::types::AttributeValue;
use std::collections::HashMap;

use super::test_helpers::{
    cleanup_test_data, create_dynamodb_client, create_test_post_item, generate_test_id,
    TestConfig,
};

/// Test: Create and read a blog post from DynamoDB.
#[tokio::test]
#[ignore] // Requires DynamoDB Local running
async fn test_dynamodb_create_and_get_item() {
    let client = create_dynamodb_client().await;
    let config = TestConfig::from_env();
    let post_id = generate_test_id();

    // Create test item
    let item = create_test_post_item(&post_id, "Integration Test Post", "tech", "draft");

    // Put item
    let put_result = client
        .put_item()
        .table_name(&config.table_name)
        .set_item(Some(item))
        .send()
        .await;

    assert!(put_result.is_ok(), "PutItem should succeed");

    // Get item
    let get_result = client
        .get_item()
        .table_name(&config.table_name)
        .key("id", AttributeValue::S(post_id.clone()))
        .send()
        .await;

    assert!(get_result.is_ok(), "GetItem should succeed");
    let item = get_result.unwrap().item.expect("Item should exist");
    assert_eq!(
        item.get("title").unwrap().as_s().unwrap(),
        "Integration Test Post"
    );
    assert_eq!(
        item.get("category").unwrap().as_s().unwrap(),
        "tech"
    );

    // Cleanup
    cleanup_test_data(&client, &config.table_name, &[post_id]).await;
}

/// Test: Update a blog post in DynamoDB.
#[tokio::test]
#[ignore] // Requires DynamoDB Local running
async fn test_dynamodb_update_item() {
    let client = create_dynamodb_client().await;
    let config = TestConfig::from_env();
    let post_id = generate_test_id();

    // Create test item
    let item = create_test_post_item(&post_id, "Original Title", "tech", "draft");
    client
        .put_item()
        .table_name(&config.table_name)
        .set_item(Some(item))
        .send()
        .await
        .expect("PutItem should succeed");

    // Update item
    let update_result = client
        .update_item()
        .table_name(&config.table_name)
        .key("id", AttributeValue::S(post_id.clone()))
        .update_expression("SET title = :title, publishStatus = :status")
        .expression_attribute_values(":title", AttributeValue::S("Updated Title".to_string()))
        .expression_attribute_values(":status", AttributeValue::S("published".to_string()))
        .send()
        .await;

    assert!(update_result.is_ok(), "UpdateItem should succeed");

    // Verify update
    let get_result = client
        .get_item()
        .table_name(&config.table_name)
        .key("id", AttributeValue::S(post_id.clone()))
        .send()
        .await
        .expect("GetItem should succeed");

    let item = get_result.item.expect("Item should exist");
    assert_eq!(
        item.get("title").unwrap().as_s().unwrap(),
        "Updated Title"
    );
    assert_eq!(
        item.get("publishStatus").unwrap().as_s().unwrap(),
        "published"
    );

    // Cleanup
    cleanup_test_data(&client, &config.table_name, &[post_id]).await;
}

/// Test: Delete a blog post from DynamoDB.
#[tokio::test]
#[ignore] // Requires DynamoDB Local running
async fn test_dynamodb_delete_item() {
    let client = create_dynamodb_client().await;
    let config = TestConfig::from_env();
    let post_id = generate_test_id();

    // Create test item
    let item = create_test_post_item(&post_id, "Delete Test Post", "tech", "draft");
    client
        .put_item()
        .table_name(&config.table_name)
        .set_item(Some(item))
        .send()
        .await
        .expect("PutItem should succeed");

    // Delete item
    let delete_result = client
        .delete_item()
        .table_name(&config.table_name)
        .key("id", AttributeValue::S(post_id.clone()))
        .send()
        .await;

    assert!(delete_result.is_ok(), "DeleteItem should succeed");

    // Verify deletion
    let get_result = client
        .get_item()
        .table_name(&config.table_name)
        .key("id", AttributeValue::S(post_id.clone()))
        .send()
        .await
        .expect("GetItem should succeed");

    assert!(get_result.item.is_none(), "Item should be deleted");
}

/// Test: Query posts by category using CategoryIndex GSI.
#[tokio::test]
#[ignore] // Requires DynamoDB Local running
async fn test_dynamodb_query_by_category() {
    let client = create_dynamodb_client().await;
    let config = TestConfig::from_env();
    let unique_category = format!("test-category-{}", generate_test_id());
    let post_ids: Vec<String> = (0..3).map(|_| generate_test_id()).collect();

    // Create test items with same category
    for (i, post_id) in post_ids.iter().enumerate() {
        let item = create_test_post_item(
            post_id,
            &format!("Category Test Post {}", i),
            &unique_category,
            "published",
        );
        client
            .put_item()
            .table_name(&config.table_name)
            .set_item(Some(item))
            .send()
            .await
            .expect("PutItem should succeed");
    }

    // Query by category
    let query_result = client
        .query()
        .table_name(&config.table_name)
        .index_name("CategoryIndex")
        .key_condition_expression("category = :category")
        .expression_attribute_values(":category", AttributeValue::S(unique_category.clone()))
        .scan_index_forward(false) // DESC order by createdAt
        .send()
        .await;

    assert!(query_result.is_ok(), "Query should succeed");
    let items = query_result.unwrap().items.unwrap_or_default();
    assert_eq!(items.len(), 3, "Should find 3 items");

    // Cleanup
    cleanup_test_data(&client, &config.table_name, &post_ids).await;
}

/// Test: Query posts by publish status using PublishStatusIndex GSI.
#[tokio::test]
#[ignore] // Requires DynamoDB Local running
async fn test_dynamodb_query_by_publish_status() {
    let client = create_dynamodb_client().await;
    let config = TestConfig::from_env();
    let unique_tag = format!("unique-{}", generate_test_id());
    let draft_ids: Vec<String> = (0..2).map(|_| generate_test_id()).collect();
    let published_ids: Vec<String> = (0..3).map(|_| generate_test_id()).collect();

    // Create draft posts
    for (i, post_id) in draft_ids.iter().enumerate() {
        let mut item = create_test_post_item(post_id, &format!("Draft Post {}", i), &unique_tag, "draft");
        client
            .put_item()
            .table_name(&config.table_name)
            .set_item(Some(item))
            .send()
            .await
            .expect("PutItem should succeed");
    }

    // Create published posts
    for (i, post_id) in published_ids.iter().enumerate() {
        let item = create_test_post_item(post_id, &format!("Published Post {}", i), &unique_tag, "published");
        client
            .put_item()
            .table_name(&config.table_name)
            .set_item(Some(item))
            .send()
            .await
            .expect("PutItem should succeed");
    }

    // Query published posts
    let query_result = client
        .query()
        .table_name(&config.table_name)
        .index_name("PublishStatusIndex")
        .key_condition_expression("publishStatus = :status")
        .expression_attribute_values(":status", AttributeValue::S("published".to_string()))
        .send()
        .await;

    assert!(query_result.is_ok(), "Query should succeed");
    let items = query_result.unwrap().items.unwrap_or_default();

    // Filter by our unique tag to count only our test items
    let our_items: Vec<_> = items
        .iter()
        .filter(|item| {
            item.get("category")
                .and_then(|v| v.as_s().ok())
                .map(|c| c == &unique_tag)
                .unwrap_or(false)
        })
        .collect();

    assert!(our_items.len() >= 3, "Should find at least 3 published items with our tag");

    // Cleanup
    let mut all_ids = draft_ids;
    all_ids.extend(published_ids);
    cleanup_test_data(&client, &config.table_name, &all_ids).await;
}

/// Test: Pagination with limit and exclusive start key.
#[tokio::test]
#[ignore] // Requires DynamoDB Local running
async fn test_dynamodb_pagination() {
    let client = create_dynamodb_client().await;
    let config = TestConfig::from_env();
    let unique_category = format!("pagination-test-{}", generate_test_id());
    let post_ids: Vec<String> = (0..5).map(|_| generate_test_id()).collect();

    // Create 5 test items
    for (i, post_id) in post_ids.iter().enumerate() {
        let item = create_test_post_item(
            post_id,
            &format!("Pagination Test Post {}", i),
            &unique_category,
            "published",
        );
        client
            .put_item()
            .table_name(&config.table_name)
            .set_item(Some(item))
            .send()
            .await
            .expect("PutItem should succeed");

        // Small delay to ensure different createdAt timestamps
        tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;
    }

    // First page: limit 2
    let first_page = client
        .query()
        .table_name(&config.table_name)
        .index_name("CategoryIndex")
        .key_condition_expression("category = :category")
        .expression_attribute_values(":category", AttributeValue::S(unique_category.clone()))
        .limit(2)
        .send()
        .await
        .expect("First page query should succeed");

    let first_items = first_page.items.unwrap_or_default();
    assert_eq!(first_items.len(), 2, "First page should have 2 items");
    assert!(first_page.last_evaluated_key.is_some(), "Should have next page token");

    // Second page
    let second_page = client
        .query()
        .table_name(&config.table_name)
        .index_name("CategoryIndex")
        .key_condition_expression("category = :category")
        .expression_attribute_values(":category", AttributeValue::S(unique_category.clone()))
        .set_exclusive_start_key(first_page.last_evaluated_key)
        .limit(2)
        .send()
        .await
        .expect("Second page query should succeed");

    let second_items = second_page.items.unwrap_or_default();
    assert_eq!(second_items.len(), 2, "Second page should have 2 items");

    // Cleanup
    cleanup_test_data(&client, &config.table_name, &post_ids).await;
}

/// Test: Scan operation for getting all items.
#[tokio::test]
#[ignore] // Requires DynamoDB Local running
async fn test_dynamodb_scan() {
    let client = create_dynamodb_client().await;
    let config = TestConfig::from_env();
    let unique_author = format!("scan-test-author-{}", generate_test_id());
    let post_ids: Vec<String> = (0..3).map(|_| generate_test_id()).collect();

    // Create test items with unique author
    for (i, post_id) in post_ids.iter().enumerate() {
        let mut item = create_test_post_item(post_id, &format!("Scan Test Post {}", i), "tech", "draft");
        item.insert("authorId".to_string(), AttributeValue::S(unique_author.clone()));
        client
            .put_item()
            .table_name(&config.table_name)
            .set_item(Some(item))
            .send()
            .await
            .expect("PutItem should succeed");
    }

    // Scan with filter
    let scan_result = client
        .scan()
        .table_name(&config.table_name)
        .filter_expression("authorId = :author")
        .expression_attribute_values(":author", AttributeValue::S(unique_author.clone()))
        .send()
        .await;

    assert!(scan_result.is_ok(), "Scan should succeed");
    let items = scan_result.unwrap().items.unwrap_or_default();
    assert_eq!(items.len(), 3, "Should find 3 items from scan");

    // Cleanup
    cleanup_test_data(&client, &config.table_name, &post_ids).await;
}

/// Test: Conditional write (create only if not exists).
#[tokio::test]
#[ignore] // Requires DynamoDB Local running
async fn test_dynamodb_conditional_write() {
    let client = create_dynamodb_client().await;
    let config = TestConfig::from_env();
    let post_id = generate_test_id();

    // Create initial item
    let item = create_test_post_item(&post_id, "Conditional Write Test", "tech", "draft");
    client
        .put_item()
        .table_name(&config.table_name)
        .set_item(Some(item))
        .send()
        .await
        .expect("Initial PutItem should succeed");

    // Try to create again with condition (should fail)
    let duplicate_item = create_test_post_item(&post_id, "Duplicate Post", "tech", "draft");
    let conditional_put = client
        .put_item()
        .table_name(&config.table_name)
        .set_item(Some(duplicate_item))
        .condition_expression("attribute_not_exists(id)")
        .send()
        .await;

    assert!(conditional_put.is_err(), "Conditional write should fail for existing item");

    // Cleanup
    cleanup_test_data(&client, &config.table_name, &[post_id]).await;
}

/// Test: Batch write operations.
#[tokio::test]
#[ignore] // Requires DynamoDB Local running
async fn test_dynamodb_batch_write() {
    let client = create_dynamodb_client().await;
    let config = TestConfig::from_env();
    let post_ids: Vec<String> = (0..5).map(|_| generate_test_id()).collect();

    // Create batch write requests
    let write_requests: Vec<aws_sdk_dynamodb::types::WriteRequest> = post_ids
        .iter()
        .enumerate()
        .map(|(i, id)| {
            let item = create_test_post_item(id, &format!("Batch Post {}", i), "tech", "draft");
            aws_sdk_dynamodb::types::WriteRequest::builder()
                .put_request(
                    aws_sdk_dynamodb::types::PutRequest::builder()
                        .set_item(Some(item))
                        .build()
                        .unwrap(),
                )
                .build()
        })
        .collect();

    // Batch write
    let batch_result = client
        .batch_write_item()
        .request_items(&config.table_name, write_requests)
        .send()
        .await;

    assert!(batch_result.is_ok(), "Batch write should succeed");

    // Verify all items exist
    for post_id in &post_ids {
        let get_result = client
            .get_item()
            .table_name(&config.table_name)
            .key("id", AttributeValue::S(post_id.clone()))
            .send()
            .await
            .expect("GetItem should succeed");

        assert!(get_result.item.is_some(), "Item should exist");
    }

    // Cleanup
    cleanup_test_data(&client, &config.table_name, &post_ids).await;
}

/// Test: TransactWriteItems for atomic operations.
#[tokio::test]
#[ignore] // Requires DynamoDB Local running
async fn test_dynamodb_transact_write() {
    let client = create_dynamodb_client().await;
    let config = TestConfig::from_env();
    let post_ids: Vec<String> = (0..2).map(|_| generate_test_id()).collect();

    // Create transact write items
    let transact_items: Vec<aws_sdk_dynamodb::types::TransactWriteItem> = post_ids
        .iter()
        .enumerate()
        .map(|(i, id)| {
            let item = create_test_post_item(id, &format!("Transact Post {}", i), "tech", "draft");
            aws_sdk_dynamodb::types::TransactWriteItem::builder()
                .put(
                    aws_sdk_dynamodb::types::Put::builder()
                        .table_name(&config.table_name)
                        .set_item(Some(item))
                        .build()
                        .unwrap(),
                )
                .build()
        })
        .collect();

    // Execute transaction
    let transact_result = client
        .transact_write_items()
        .set_transact_items(Some(transact_items))
        .send()
        .await;

    assert!(transact_result.is_ok(), "Transact write should succeed");

    // Verify all items exist
    for post_id in &post_ids {
        let get_result = client
            .get_item()
            .table_name(&config.table_name)
            .key("id", AttributeValue::S(post_id.clone()))
            .send()
            .await
            .expect("GetItem should succeed");

        assert!(get_result.item.is_some(), "Item should exist after transaction");
    }

    // Cleanup
    cleanup_test_data(&client, &config.table_name, &post_ids).await;
}
