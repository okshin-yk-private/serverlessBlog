//! Integration tests for Cognito operations.
//!
//! These tests verify Cognito authentication operations against LocalStack.
//! Run with: `./scripts/run-integration-tests.sh`

use aws_sdk_cognitoidentityprovider::types::AuthFlowType;

use super::test_helpers::{create_cognito_client, generate_test_id, TestConfig};

/// Test: Create a user pool.
#[tokio::test]
#[ignore] // Requires LocalStack running
async fn test_cognito_create_user_pool() {
    let client = create_cognito_client().await;
    let pool_name = format!("test-pool-{}", generate_test_id());

    // Create user pool
    let create_result = client
        .create_user_pool()
        .pool_name(&pool_name)
        .auto_verified_attributes(aws_sdk_cognitoidentityprovider::types::VerifiedAttributeType::Email)
        .send()
        .await;

    assert!(create_result.is_ok(), "CreateUserPool should succeed: {:?}", create_result.err());

    let pool = create_result.unwrap().user_pool.unwrap();
    assert_eq!(pool.name(), Some(pool_name.as_str()), "Pool name should match");
    assert!(pool.id().is_some(), "Pool should have an ID");

    // Cleanup
    if let Some(pool_id) = pool.id() {
        let _ = client.delete_user_pool().user_pool_id(pool_id).send().await;
    }
}

/// Test: Create a user pool client.
#[tokio::test]
#[ignore] // Requires LocalStack running
async fn test_cognito_create_user_pool_client() {
    let client = create_cognito_client().await;
    let pool_name = format!("test-pool-{}", generate_test_id());
    let client_name = format!("test-client-{}", generate_test_id());

    // Create user pool first
    let pool = client
        .create_user_pool()
        .pool_name(&pool_name)
        .send()
        .await
        .expect("CreateUserPool should succeed")
        .user_pool
        .unwrap();

    let pool_id = pool.id().unwrap();

    // Create user pool client
    let create_result = client
        .create_user_pool_client()
        .user_pool_id(pool_id)
        .client_name(&client_name)
        .explicit_auth_flows(aws_sdk_cognitoidentityprovider::types::ExplicitAuthFlowsType::AllowUserPasswordAuth)
        .explicit_auth_flows(aws_sdk_cognitoidentityprovider::types::ExplicitAuthFlowsType::AllowRefreshTokenAuth)
        .send()
        .await;

    assert!(create_result.is_ok(), "CreateUserPoolClient should succeed: {:?}", create_result.err());

    let pool_client = create_result.unwrap().user_pool_client.unwrap();
    assert_eq!(pool_client.client_name(), Some(client_name.as_str()), "Client name should match");
    assert!(pool_client.client_id().is_some(), "Client should have an ID");

    // Cleanup
    let _ = client.delete_user_pool().user_pool_id(pool_id).send().await;
}

/// Test: Admin create user.
#[tokio::test]
#[ignore] // Requires LocalStack running
async fn test_cognito_admin_create_user() {
    let client = create_cognito_client().await;
    let pool_name = format!("test-pool-{}", generate_test_id());
    let test_email = format!("test-{}@example.com", generate_test_id());

    // Create user pool
    let pool = client
        .create_user_pool()
        .pool_name(&pool_name)
        .auto_verified_attributes(aws_sdk_cognitoidentityprovider::types::VerifiedAttributeType::Email)
        .send()
        .await
        .expect("CreateUserPool should succeed")
        .user_pool
        .unwrap();

    let pool_id = pool.id().unwrap();

    // Create user
    let create_result = client
        .admin_create_user()
        .user_pool_id(pool_id)
        .username(&test_email)
        .user_attributes(
            aws_sdk_cognitoidentityprovider::types::AttributeType::builder()
                .name("email")
                .value(&test_email)
                .build()
                .unwrap(),
        )
        .user_attributes(
            aws_sdk_cognitoidentityprovider::types::AttributeType::builder()
                .name("email_verified")
                .value("true")
                .build()
                .unwrap(),
        )
        .message_action(aws_sdk_cognitoidentityprovider::types::MessageActionType::Suppress)
        .send()
        .await;

    assert!(create_result.is_ok(), "AdminCreateUser should succeed: {:?}", create_result.err());

    let user = create_result.unwrap().user.unwrap();
    assert_eq!(user.username(), Some(test_email.as_str()), "Username should match");

    // Cleanup
    let _ = client.delete_user_pool().user_pool_id(pool_id).send().await;
}

/// Test: Admin set user password.
#[tokio::test]
#[ignore] // Requires LocalStack running
async fn test_cognito_admin_set_user_password() {
    let client = create_cognito_client().await;
    let pool_name = format!("test-pool-{}", generate_test_id());
    let test_email = format!("test-{}@example.com", generate_test_id());
    let password = "TestPassword123!";

    // Create user pool
    let pool = client
        .create_user_pool()
        .pool_name(&pool_name)
        .auto_verified_attributes(aws_sdk_cognitoidentityprovider::types::VerifiedAttributeType::Email)
        .policies(
            aws_sdk_cognitoidentityprovider::types::UserPoolPolicyType::builder()
                .password_policy(
                    aws_sdk_cognitoidentityprovider::types::PasswordPolicyType::builder()
                        .minimum_length(8)
                        .require_uppercase(false)
                        .require_lowercase(false)
                        .require_numbers(false)
                        .require_symbols(false)
                        .build(),
                )
                .build(),
        )
        .send()
        .await
        .expect("CreateUserPool should succeed")
        .user_pool
        .unwrap();

    let pool_id = pool.id().unwrap();

    // Create user
    client
        .admin_create_user()
        .user_pool_id(pool_id)
        .username(&test_email)
        .user_attributes(
            aws_sdk_cognitoidentityprovider::types::AttributeType::builder()
                .name("email")
                .value(&test_email)
                .build()
                .unwrap(),
        )
        .message_action(aws_sdk_cognitoidentityprovider::types::MessageActionType::Suppress)
        .send()
        .await
        .expect("AdminCreateUser should succeed");

    // Set password
    let set_password_result = client
        .admin_set_user_password()
        .user_pool_id(pool_id)
        .username(&test_email)
        .password(password)
        .permanent(true)
        .send()
        .await;

    assert!(set_password_result.is_ok(), "AdminSetUserPassword should succeed: {:?}", set_password_result.err());

    // Cleanup
    let _ = client.delete_user_pool().user_pool_id(pool_id).send().await;
}

/// Test: User authentication with InitiateAuth (USER_PASSWORD_AUTH flow).
#[tokio::test]
#[ignore] // Requires LocalStack running
async fn test_cognito_initiate_auth_user_password() {
    let client = create_cognito_client().await;
    let pool_name = format!("test-pool-{}", generate_test_id());
    let test_email = format!("test-{}@example.com", generate_test_id());
    let password = "TestPassword123!";

    // Create user pool with password policy
    let pool = client
        .create_user_pool()
        .pool_name(&pool_name)
        .auto_verified_attributes(aws_sdk_cognitoidentityprovider::types::VerifiedAttributeType::Email)
        .policies(
            aws_sdk_cognitoidentityprovider::types::UserPoolPolicyType::builder()
                .password_policy(
                    aws_sdk_cognitoidentityprovider::types::PasswordPolicyType::builder()
                        .minimum_length(8)
                        .require_uppercase(false)
                        .require_lowercase(false)
                        .require_numbers(false)
                        .require_symbols(false)
                        .build(),
                )
                .build(),
        )
        .send()
        .await
        .expect("CreateUserPool should succeed")
        .user_pool
        .unwrap();

    let pool_id = pool.id().unwrap();

    // Create user pool client
    let pool_client = client
        .create_user_pool_client()
        .user_pool_id(pool_id)
        .client_name("test-client")
        .explicit_auth_flows(aws_sdk_cognitoidentityprovider::types::ExplicitAuthFlowsType::AllowUserPasswordAuth)
        .explicit_auth_flows(aws_sdk_cognitoidentityprovider::types::ExplicitAuthFlowsType::AllowRefreshTokenAuth)
        .send()
        .await
        .expect("CreateUserPoolClient should succeed")
        .user_pool_client
        .unwrap();

    let client_id = pool_client.client_id().unwrap();

    // Create user and set password
    client
        .admin_create_user()
        .user_pool_id(pool_id)
        .username(&test_email)
        .user_attributes(
            aws_sdk_cognitoidentityprovider::types::AttributeType::builder()
                .name("email")
                .value(&test_email)
                .build()
                .unwrap(),
        )
        .user_attributes(
            aws_sdk_cognitoidentityprovider::types::AttributeType::builder()
                .name("email_verified")
                .value("true")
                .build()
                .unwrap(),
        )
        .message_action(aws_sdk_cognitoidentityprovider::types::MessageActionType::Suppress)
        .send()
        .await
        .expect("AdminCreateUser should succeed");

    client
        .admin_set_user_password()
        .user_pool_id(pool_id)
        .username(&test_email)
        .password(password)
        .permanent(true)
        .send()
        .await
        .expect("AdminSetUserPassword should succeed");

    // Authenticate
    let auth_result = client
        .initiate_auth()
        .auth_flow(AuthFlowType::UserPasswordAuth)
        .client_id(client_id)
        .auth_parameters("USERNAME", &test_email)
        .auth_parameters("PASSWORD", password)
        .send()
        .await;

    assert!(auth_result.is_ok(), "InitiateAuth should succeed: {:?}", auth_result.err());

    let auth_response = auth_result.unwrap();
    let tokens = auth_response.authentication_result().unwrap();
    assert!(tokens.access_token().is_some(), "Should have access token");
    assert!(tokens.id_token().is_some(), "Should have ID token");
    assert!(tokens.refresh_token().is_some(), "Should have refresh token");

    // Cleanup
    let _ = client.delete_user_pool().user_pool_id(pool_id).send().await;
}

/// Test: Token refresh with InitiateAuth (REFRESH_TOKEN_AUTH flow).
#[tokio::test]
#[ignore] // Requires LocalStack running
async fn test_cognito_refresh_token_auth() {
    let client = create_cognito_client().await;
    let pool_name = format!("test-pool-{}", generate_test_id());
    let test_email = format!("test-{}@example.com", generate_test_id());
    let password = "TestPassword123!";

    // Create user pool
    let pool = client
        .create_user_pool()
        .pool_name(&pool_name)
        .policies(
            aws_sdk_cognitoidentityprovider::types::UserPoolPolicyType::builder()
                .password_policy(
                    aws_sdk_cognitoidentityprovider::types::PasswordPolicyType::builder()
                        .minimum_length(8)
                        .require_uppercase(false)
                        .require_lowercase(false)
                        .require_numbers(false)
                        .require_symbols(false)
                        .build(),
                )
                .build(),
        )
        .send()
        .await
        .expect("CreateUserPool should succeed")
        .user_pool
        .unwrap();

    let pool_id = pool.id().unwrap();

    // Create client
    let pool_client = client
        .create_user_pool_client()
        .user_pool_id(pool_id)
        .client_name("test-client")
        .explicit_auth_flows(aws_sdk_cognitoidentityprovider::types::ExplicitAuthFlowsType::AllowUserPasswordAuth)
        .explicit_auth_flows(aws_sdk_cognitoidentityprovider::types::ExplicitAuthFlowsType::AllowRefreshTokenAuth)
        .send()
        .await
        .expect("CreateUserPoolClient should succeed")
        .user_pool_client
        .unwrap();

    let client_id = pool_client.client_id().unwrap();

    // Create user and authenticate
    client
        .admin_create_user()
        .user_pool_id(pool_id)
        .username(&test_email)
        .user_attributes(
            aws_sdk_cognitoidentityprovider::types::AttributeType::builder()
                .name("email")
                .value(&test_email)
                .build()
                .unwrap(),
        )
        .message_action(aws_sdk_cognitoidentityprovider::types::MessageActionType::Suppress)
        .send()
        .await
        .expect("AdminCreateUser should succeed");

    client
        .admin_set_user_password()
        .user_pool_id(pool_id)
        .username(&test_email)
        .password(password)
        .permanent(true)
        .send()
        .await
        .expect("AdminSetUserPassword should succeed");

    // Initial authentication
    let initial_auth = client
        .initiate_auth()
        .auth_flow(AuthFlowType::UserPasswordAuth)
        .client_id(client_id)
        .auth_parameters("USERNAME", &test_email)
        .auth_parameters("PASSWORD", password)
        .send()
        .await
        .expect("Initial auth should succeed");

    let refresh_token = initial_auth
        .authentication_result()
        .unwrap()
        .refresh_token()
        .unwrap()
        .to_string();

    // Refresh token
    let refresh_result = client
        .initiate_auth()
        .auth_flow(AuthFlowType::RefreshTokenAuth)
        .client_id(client_id)
        .auth_parameters("REFRESH_TOKEN", &refresh_token)
        .send()
        .await;

    assert!(refresh_result.is_ok(), "RefreshTokenAuth should succeed: {:?}", refresh_result.err());

    let refresh_response = refresh_result.unwrap();
    let new_tokens = refresh_response.authentication_result().unwrap();
    assert!(new_tokens.access_token().is_some(), "Should have new access token");
    assert!(new_tokens.id_token().is_some(), "Should have new ID token");

    // Cleanup
    let _ = client.delete_user_pool().user_pool_id(pool_id).send().await;
}

/// Test: Global sign out.
#[tokio::test]
#[ignore] // Requires LocalStack running
async fn test_cognito_global_sign_out() {
    let client = create_cognito_client().await;
    let pool_name = format!("test-pool-{}", generate_test_id());
    let test_email = format!("test-{}@example.com", generate_test_id());
    let password = "TestPassword123!";

    // Create user pool and client
    let pool = client
        .create_user_pool()
        .pool_name(&pool_name)
        .policies(
            aws_sdk_cognitoidentityprovider::types::UserPoolPolicyType::builder()
                .password_policy(
                    aws_sdk_cognitoidentityprovider::types::PasswordPolicyType::builder()
                        .minimum_length(8)
                        .require_uppercase(false)
                        .require_lowercase(false)
                        .require_numbers(false)
                        .require_symbols(false)
                        .build(),
                )
                .build(),
        )
        .send()
        .await
        .expect("CreateUserPool should succeed")
        .user_pool
        .unwrap();

    let pool_id = pool.id().unwrap();

    let pool_client = client
        .create_user_pool_client()
        .user_pool_id(pool_id)
        .client_name("test-client")
        .explicit_auth_flows(aws_sdk_cognitoidentityprovider::types::ExplicitAuthFlowsType::AllowUserPasswordAuth)
        .explicit_auth_flows(aws_sdk_cognitoidentityprovider::types::ExplicitAuthFlowsType::AllowRefreshTokenAuth)
        .send()
        .await
        .expect("CreateUserPoolClient should succeed")
        .user_pool_client
        .unwrap();

    let client_id = pool_client.client_id().unwrap();

    // Create user, set password, and authenticate
    client
        .admin_create_user()
        .user_pool_id(pool_id)
        .username(&test_email)
        .user_attributes(
            aws_sdk_cognitoidentityprovider::types::AttributeType::builder()
                .name("email")
                .value(&test_email)
                .build()
                .unwrap(),
        )
        .message_action(aws_sdk_cognitoidentityprovider::types::MessageActionType::Suppress)
        .send()
        .await
        .expect("AdminCreateUser should succeed");

    client
        .admin_set_user_password()
        .user_pool_id(pool_id)
        .username(&test_email)
        .password(password)
        .permanent(true)
        .send()
        .await
        .expect("AdminSetUserPassword should succeed");

    let auth_response = client
        .initiate_auth()
        .auth_flow(AuthFlowType::UserPasswordAuth)
        .client_id(client_id)
        .auth_parameters("USERNAME", &test_email)
        .auth_parameters("PASSWORD", password)
        .send()
        .await
        .expect("InitiateAuth should succeed");

    let access_token = auth_response
        .authentication_result()
        .unwrap()
        .access_token()
        .unwrap()
        .to_string();

    // Global sign out
    let signout_result = client
        .global_sign_out()
        .access_token(&access_token)
        .send()
        .await;

    assert!(signout_result.is_ok(), "GlobalSignOut should succeed: {:?}", signout_result.err());

    // Cleanup
    let _ = client.delete_user_pool().user_pool_id(pool_id).send().await;
}

/// Test: Invalid credentials return error.
#[tokio::test]
#[ignore] // Requires LocalStack running
async fn test_cognito_invalid_credentials() {
    let client = create_cognito_client().await;
    let pool_name = format!("test-pool-{}", generate_test_id());
    let test_email = format!("test-{}@example.com", generate_test_id());

    // Create user pool and client
    let pool = client
        .create_user_pool()
        .pool_name(&pool_name)
        .policies(
            aws_sdk_cognitoidentityprovider::types::UserPoolPolicyType::builder()
                .password_policy(
                    aws_sdk_cognitoidentityprovider::types::PasswordPolicyType::builder()
                        .minimum_length(8)
                        .build(),
                )
                .build(),
        )
        .send()
        .await
        .expect("CreateUserPool should succeed")
        .user_pool
        .unwrap();

    let pool_id = pool.id().unwrap();

    let pool_client = client
        .create_user_pool_client()
        .user_pool_id(pool_id)
        .client_name("test-client")
        .explicit_auth_flows(aws_sdk_cognitoidentityprovider::types::ExplicitAuthFlowsType::AllowUserPasswordAuth)
        .send()
        .await
        .expect("CreateUserPoolClient should succeed")
        .user_pool_client
        .unwrap();

    let client_id = pool_client.client_id().unwrap();

    // Create user with password
    client
        .admin_create_user()
        .user_pool_id(pool_id)
        .username(&test_email)
        .user_attributes(
            aws_sdk_cognitoidentityprovider::types::AttributeType::builder()
                .name("email")
                .value(&test_email)
                .build()
                .unwrap(),
        )
        .message_action(aws_sdk_cognitoidentityprovider::types::MessageActionType::Suppress)
        .send()
        .await
        .expect("AdminCreateUser should succeed");

    client
        .admin_set_user_password()
        .user_pool_id(pool_id)
        .username(&test_email)
        .password("CorrectPassword123!")
        .permanent(true)
        .send()
        .await
        .expect("AdminSetUserPassword should succeed");

    // Try to authenticate with wrong password
    let auth_result = client
        .initiate_auth()
        .auth_flow(AuthFlowType::UserPasswordAuth)
        .client_id(client_id)
        .auth_parameters("USERNAME", &test_email)
        .auth_parameters("PASSWORD", "WrongPassword123!")
        .send()
        .await;

    assert!(auth_result.is_err(), "Authentication with wrong password should fail");

    // Cleanup
    let _ = client.delete_user_pool().user_pool_id(pool_id).send().await;
}

/// Test: Non-existent user returns error.
#[tokio::test]
#[ignore] // Requires LocalStack running
async fn test_cognito_user_not_found() {
    let client = create_cognito_client().await;
    let pool_name = format!("test-pool-{}", generate_test_id());

    // Create user pool and client
    let pool = client
        .create_user_pool()
        .pool_name(&pool_name)
        .send()
        .await
        .expect("CreateUserPool should succeed")
        .user_pool
        .unwrap();

    let pool_id = pool.id().unwrap();

    let pool_client = client
        .create_user_pool_client()
        .user_pool_id(pool_id)
        .client_name("test-client")
        .explicit_auth_flows(aws_sdk_cognitoidentityprovider::types::ExplicitAuthFlowsType::AllowUserPasswordAuth)
        .send()
        .await
        .expect("CreateUserPoolClient should succeed")
        .user_pool_client
        .unwrap();

    let client_id = pool_client.client_id().unwrap();

    // Try to authenticate non-existent user
    let auth_result = client
        .initiate_auth()
        .auth_flow(AuthFlowType::UserPasswordAuth)
        .client_id(client_id)
        .auth_parameters("USERNAME", "nonexistent@example.com")
        .auth_parameters("PASSWORD", "SomePassword123!")
        .send()
        .await;

    assert!(auth_result.is_err(), "Authentication with non-existent user should fail");

    // Cleanup
    let _ = client.delete_user_pool().user_pool_id(pool_id).send().await;
}
