#!/bin/bash
# LocalStack initialization script for Rust integration tests
# This script runs when LocalStack is ready

set -e

echo "Initializing LocalStack resources for Rust integration tests..."

# Create S3 bucket
echo "Creating S3 bucket..."
awslocal s3 mb s3://serverless-blog-images || true
awslocal s3api put-bucket-cors --bucket serverless-blog-images --cors-configuration '{
  "CORSRules": [
    {
      "AllowedOrigins": ["*"],
      "AllowedMethods": ["GET", "PUT", "POST", "DELETE", "HEAD"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3000
    }
  ]
}'

# Create Cognito User Pool
echo "Creating Cognito User Pool..."
POOL_ID=$(awslocal cognito-idp create-user-pool \
  --pool-name test-user-pool \
  --policies '{"PasswordPolicy":{"MinimumLength":8,"RequireUppercase":false,"RequireLowercase":false,"RequireNumbers":false,"RequireSymbols":false}}' \
  --auto-verified-attributes email \
  --username-attributes email \
  --query 'UserPool.Id' \
  --output text)

echo "User Pool created with ID: $POOL_ID"

# Create User Pool Client
echo "Creating User Pool Client..."
CLIENT_ID=$(awslocal cognito-idp create-user-pool-client \
  --user-pool-id "$POOL_ID" \
  --client-name test-client \
  --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH \
  --query 'UserPoolClient.ClientId' \
  --output text)

echo "User Pool Client created with ID: $CLIENT_ID"

# Create a test user
echo "Creating test user..."
awslocal cognito-idp admin-create-user \
  --user-pool-id "$POOL_ID" \
  --username test@example.com \
  --user-attributes Name=email,Value=test@example.com Name=email_verified,Value=true \
  --message-action SUPPRESS || true

# Set user password
awslocal cognito-idp admin-set-user-password \
  --user-pool-id "$POOL_ID" \
  --username test@example.com \
  --password TestPassword123! \
  --permanent || true

# Write config file for tests
echo "Writing test configuration..."
cat > /tmp/localstack-config.json <<EOF
{
  "user_pool_id": "$POOL_ID",
  "client_id": "$CLIENT_ID",
  "bucket_name": "serverless-blog-images",
  "test_user_email": "test@example.com",
  "test_user_password": "TestPassword123!"
}
EOF

echo "LocalStack initialization complete!"
echo "User Pool ID: $POOL_ID"
echo "Client ID: $CLIENT_ID"
