#!/bin/bash
# Integration test runner script for Rust Lambda functions
# Uses DynamoDB Local and LocalStack for AWS service simulation

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Rust Lambda Integration Tests ===${NC}"

# Function to clean up containers
cleanup() {
    echo -e "${YELLOW}Cleaning up containers...${NC}"
    cd "$PROJECT_DIR"
    docker compose down --remove-orphans 2>/dev/null || true
}

# Trap for cleanup on script exit
trap cleanup EXIT

# Start containers
echo -e "${YELLOW}Starting test containers...${NC}"
cd "$PROJECT_DIR"
docker compose up -d

# Wait for DynamoDB Local to be healthy
echo -e "${YELLOW}Waiting for DynamoDB Local to be ready...${NC}"
MAX_ATTEMPTS=30
ATTEMPT=0
while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if curl -sf http://localhost:8000 > /dev/null 2>&1; then
        echo -e "${GREEN}DynamoDB Local is ready!${NC}"
        break
    fi
    ATTEMPT=$((ATTEMPT + 1))
    echo "Waiting for DynamoDB Local... (attempt $ATTEMPT/$MAX_ATTEMPTS)"
    sleep 2
done

if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
    echo -e "${RED}DynamoDB Local failed to start${NC}"
    exit 1
fi

# Wait for LocalStack to be healthy
echo -e "${YELLOW}Waiting for LocalStack to be ready...${NC}"
ATTEMPT=0
while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    if curl -sf http://localhost:4566/_localstack/health 2>/dev/null | grep -q '"s3": "running"'; then
        echo -e "${GREEN}LocalStack is ready!${NC}"
        break
    fi
    ATTEMPT=$((ATTEMPT + 1))
    echo "Waiting for LocalStack... (attempt $ATTEMPT/$MAX_ATTEMPTS)"
    sleep 2
done

if [ $ATTEMPT -eq $MAX_ATTEMPTS ]; then
    echo -e "${RED}LocalStack failed to start${NC}"
    exit 1
fi

# Create DynamoDB table
echo -e "${YELLOW}Creating DynamoDB table...${NC}"
aws dynamodb create-table \
    --endpoint-url http://localhost:8000 \
    --table-name BlogPosts \
    --attribute-definitions \
        AttributeName=id,AttributeType=S \
        AttributeName=category,AttributeType=S \
        AttributeName=publishStatus,AttributeType=S \
        AttributeName=createdAt,AttributeType=S \
    --key-schema AttributeName=id,KeyType=HASH \
    --billing-mode PAY_PER_REQUEST \
    --global-secondary-indexes \
        "[
            {
                \"IndexName\": \"CategoryIndex\",
                \"KeySchema\": [{\"AttributeName\":\"category\",\"KeyType\":\"HASH\"},{\"AttributeName\":\"createdAt\",\"KeyType\":\"RANGE\"}],
                \"Projection\": {\"ProjectionType\":\"ALL\"}
            },
            {
                \"IndexName\": \"PublishStatusIndex\",
                \"KeySchema\": [{\"AttributeName\":\"publishStatus\",\"KeyType\":\"HASH\"},{\"AttributeName\":\"createdAt\",\"KeyType\":\"RANGE\"}],
                \"Projection\": {\"ProjectionType\":\"ALL\"}
            }
        ]" \
    --region us-east-1 \
    2>/dev/null || echo "Table may already exist, continuing..."

# Wait for LocalStack init script to complete
echo -e "${YELLOW}Waiting for LocalStack initialization to complete...${NC}"
sleep 5

# Get Cognito configuration from LocalStack
echo -e "${YELLOW}Retrieving Cognito configuration...${NC}"
USER_POOL_ID=$(aws cognito-idp list-user-pools \
    --endpoint-url http://localhost:4566 \
    --max-results 1 \
    --region us-east-1 \
    --query 'UserPools[0].Id' \
    --output text 2>/dev/null || echo "")

if [ -z "$USER_POOL_ID" ] || [ "$USER_POOL_ID" == "None" ]; then
    echo -e "${YELLOW}Creating Cognito User Pool...${NC}"
    USER_POOL_ID=$(aws cognito-idp create-user-pool \
        --endpoint-url http://localhost:4566 \
        --pool-name test-user-pool \
        --policies '{"PasswordPolicy":{"MinimumLength":8,"RequireUppercase":false,"RequireLowercase":false,"RequireNumbers":false,"RequireSymbols":false}}' \
        --region us-east-1 \
        --query 'UserPool.Id' \
        --output text)
fi

CLIENT_ID=$(aws cognito-idp list-user-pool-clients \
    --endpoint-url http://localhost:4566 \
    --user-pool-id "$USER_POOL_ID" \
    --region us-east-1 \
    --query 'UserPoolClients[0].ClientId' \
    --output text 2>/dev/null || echo "")

if [ -z "$CLIENT_ID" ] || [ "$CLIENT_ID" == "None" ]; then
    echo -e "${YELLOW}Creating User Pool Client...${NC}"
    CLIENT_ID=$(aws cognito-idp create-user-pool-client \
        --endpoint-url http://localhost:4566 \
        --user-pool-id "$USER_POOL_ID" \
        --client-name test-client \
        --explicit-auth-flows ALLOW_USER_PASSWORD_AUTH ALLOW_REFRESH_TOKEN_AUTH \
        --region us-east-1 \
        --query 'UserPoolClient.ClientId' \
        --output text)
fi

echo -e "${GREEN}User Pool ID: $USER_POOL_ID${NC}"
echo -e "${GREEN}Client ID: $CLIENT_ID${NC}"

# Set environment variables for tests
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1
export AWS_ENDPOINT_URL=http://localhost:4566
export DYNAMODB_ENDPOINT=http://localhost:8000
export S3_ENDPOINT=http://localhost:4566
export COGNITO_ENDPOINT=http://localhost:4566
export TABLE_NAME=BlogPosts
export BUCKET_NAME=serverless-blog-images
export USER_POOL_ID="$USER_POOL_ID"
export USER_POOL_CLIENT_ID="$CLIENT_ID"
export RUST_LOG=debug
export RUST_BACKTRACE=1

# Run integration tests
echo -e "${BLUE}Running integration tests...${NC}"
cd "$PROJECT_DIR"
cargo test --test '*' --features integration -- --test-threads=1 "$@"

TEST_EXIT_CODE=$?

if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}=== All integration tests passed! ===${NC}"
else
    echo -e "${RED}=== Some integration tests failed ===${NC}"
fi

exit $TEST_EXIT_CODE
