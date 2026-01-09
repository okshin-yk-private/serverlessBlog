#!/bin/bash
# Terraform Import Validation Script
# Requirements: 9.2 - Validation script comparing Terraform state with actual AWS resources
#
# Usage:
#   ./scripts/validate-import.sh [dev|prd]
#
# Prerequisites:
#   - AWS CLI configured with appropriate credentials
#   - Terraform initialized in the environment directory
#   - jq installed for JSON parsing

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ENVIRONMENT="${1:-dev}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_DIR="$PROJECT_ROOT/environments/$ENVIRONMENT"

echo "=========================================="
echo " Terraform Import Validation Script"
echo " Environment: $ENVIRONMENT"
echo "=========================================="

# Check prerequisites
check_prerequisites() {
    echo -e "\n${YELLOW}Checking prerequisites...${NC}"

    if ! command -v aws &> /dev/null; then
        echo -e "${RED}Error: AWS CLI is not installed${NC}"
        exit 1
    fi

    if ! command -v terraform &> /dev/null; then
        echo -e "${RED}Error: Terraform is not installed${NC}"
        exit 1
    fi

    if ! command -v jq &> /dev/null; then
        echo -e "${RED}Error: jq is not installed${NC}"
        exit 1
    fi

    if [ ! -d "$ENV_DIR" ]; then
        echo -e "${RED}Error: Environment directory not found: $ENV_DIR${NC}"
        exit 1
    fi

    echo -e "${GREEN}All prerequisites met.${NC}"
}

# Validate DynamoDB Table
validate_dynamodb() {
    echo -e "\n${YELLOW}Validating DynamoDB...${NC}"

    local table_name="serverless-blog-posts-$ENVIRONMENT"

    # Get table from AWS
    if aws dynamodb describe-table --table-name "$table_name" &> /dev/null; then
        echo -e "${GREEN}[OK] DynamoDB table exists: $table_name${NC}"

        # Check billing mode
        local billing_mode=$(aws dynamodb describe-table --table-name "$table_name" --query 'Table.BillingModeSummary.BillingMode' --output text)
        if [ "$billing_mode" == "PAY_PER_REQUEST" ]; then
            echo -e "${GREEN}[OK] Billing mode: PAY_PER_REQUEST${NC}"
        else
            echo -e "${RED}[WARN] Billing mode mismatch: $billing_mode (expected: PAY_PER_REQUEST)${NC}"
        fi

        # Check PITR
        local pitr_status=$(aws dynamodb describe-continuous-backups --table-name "$table_name" --query 'ContinuousBackupsDescription.PointInTimeRecoveryDescription.PointInTimeRecoveryStatus' --output text)
        if [ "$pitr_status" == "ENABLED" ]; then
            echo -e "${GREEN}[OK] Point-in-time recovery: ENABLED${NC}"
        else
            echo -e "${RED}[WARN] PITR status: $pitr_status (expected: ENABLED)${NC}"
        fi

        # Check GSIs
        local gsi_count=$(aws dynamodb describe-table --table-name "$table_name" --query 'length(Table.GlobalSecondaryIndexes)' --output text)
        if [ "$gsi_count" == "2" ]; then
            echo -e "${GREEN}[OK] GSI count: 2 (CategoryIndex, PublishStatusIndex)${NC}"
        else
            echo -e "${RED}[WARN] GSI count: $gsi_count (expected: 2)${NC}"
        fi
    else
        echo -e "${RED}[ERROR] DynamoDB table not found: $table_name${NC}"
    fi
}

# Validate S3 Buckets
validate_s3() {
    echo -e "\n${YELLOW}Validating S3 Buckets...${NC}"

    local account_id=$(aws sts get-caller-identity --query 'Account' --output text)
    local buckets=(
        "serverless-blog-images-$ENVIRONMENT-$account_id"
        "serverless-blog-public-site-$ENVIRONMENT-$account_id"
        "serverless-blog-admin-site-$ENVIRONMENT-$account_id"
    )

    for bucket in "${buckets[@]}"; do
        if aws s3api head-bucket --bucket "$bucket" 2>/dev/null; then
            echo -e "${GREEN}[OK] S3 bucket exists: $bucket${NC}"

            # Check versioning (for images bucket only)
            if [[ "$bucket" == *"images"* ]]; then
                local versioning=$(aws s3api get-bucket-versioning --bucket "$bucket" --query 'Status' --output text)
                if [ "$versioning" == "Enabled" ]; then
                    echo -e "${GREEN}[OK] Versioning enabled: $bucket${NC}"
                else
                    echo -e "${RED}[WARN] Versioning not enabled: $bucket${NC}"
                fi
            fi

            # Check encryption
            if aws s3api get-bucket-encryption --bucket "$bucket" &> /dev/null; then
                echo -e "${GREEN}[OK] Encryption enabled: $bucket${NC}"
            else
                echo -e "${RED}[WARN] Encryption not configured: $bucket${NC}"
            fi

            # Check public access block
            local public_block=$(aws s3api get-public-access-block --bucket "$bucket" --query 'PublicAccessBlockConfiguration.BlockPublicAcls' --output text 2>/dev/null || echo "false")
            if [ "$public_block" == "True" ]; then
                echo -e "${GREEN}[OK] Public access blocked: $bucket${NC}"
            else
                echo -e "${RED}[WARN] Public access not fully blocked: $bucket${NC}"
            fi
        else
            echo -e "${RED}[ERROR] S3 bucket not found: $bucket${NC}"
        fi
    done
}

# Validate Cognito
validate_cognito() {
    echo -e "\n${YELLOW}Validating Cognito...${NC}"

    local pool_name="serverless-blog-$ENVIRONMENT"

    # List user pools and find by name
    local pool_id=$(aws cognito-idp list-user-pools --max-results 60 --query "UserPools[?Name=='$pool_name'].Id" --output text)

    if [ -n "$pool_id" ] && [ "$pool_id" != "None" ]; then
        echo -e "${GREEN}[OK] Cognito User Pool exists: $pool_name (ID: $pool_id)${NC}"

        # Check MFA configuration
        local mfa_config=$(aws cognito-idp describe-user-pool --user-pool-id "$pool_id" --query 'UserPool.MfaConfiguration' --output text)
        if [ "$mfa_config" == "OPTIONAL" ]; then
            echo -e "${GREEN}[OK] MFA configuration: OPTIONAL${NC}"
        else
            echo -e "${YELLOW}[INFO] MFA configuration: $mfa_config${NC}"
        fi

        # Check password policy
        local min_length=$(aws cognito-idp describe-user-pool --user-pool-id "$pool_id" --query 'UserPool.Policies.PasswordPolicy.MinimumLength' --output text)
        if [ "$min_length" -ge 12 ]; then
            echo -e "${GREEN}[OK] Password minimum length: $min_length${NC}"
        else
            echo -e "${RED}[WARN] Password minimum length: $min_length (expected: >= 12)${NC}"
        fi

        # Check app clients
        local client_count=$(aws cognito-idp list-user-pool-clients --user-pool-id "$pool_id" --query 'length(UserPoolClients)' --output text)
        echo -e "${GREEN}[OK] App clients count: $client_count${NC}"
    else
        echo -e "${RED}[ERROR] Cognito User Pool not found: $pool_name${NC}"
    fi
}

# Validate API Gateway
validate_apigateway() {
    echo -e "\n${YELLOW}Validating API Gateway...${NC}"

    local api_name="serverless-blog-api-$ENVIRONMENT"

    # Find REST API by name
    local api_id=$(aws apigateway get-rest-apis --query "items[?name=='$api_name'].id" --output text)

    if [ -n "$api_id" ] && [ "$api_id" != "None" ]; then
        echo -e "${GREEN}[OK] REST API exists: $api_name (ID: $api_id)${NC}"

        # Check authorizers
        local authorizer_count=$(aws apigateway get-authorizers --rest-api-id "$api_id" --query 'length(items)' --output text)
        echo -e "${GREEN}[OK] Authorizers count: $authorizer_count${NC}"

        # Check resources
        local resource_count=$(aws apigateway get-resources --rest-api-id "$api_id" --query 'length(items)' --output text)
        echo -e "${GREEN}[OK] Resources count: $resource_count${NC}"

        # Check stage
        if aws apigateway get-stage --rest-api-id "$api_id" --stage-name "$ENVIRONMENT" &> /dev/null; then
            echo -e "${GREEN}[OK] Stage exists: $ENVIRONMENT${NC}"
        else
            echo -e "${RED}[ERROR] Stage not found: $ENVIRONMENT${NC}"
        fi
    else
        echo -e "${RED}[ERROR] REST API not found: $api_name${NC}"
    fi
}

# Validate Lambda Functions
validate_lambda() {
    echo -e "\n${YELLOW}Validating Lambda Functions...${NC}"

    local functions=(
        "blog-create-post-go"
        "blog-get-post-go"
        "blog-get-public-post-go"
        "blog-list-posts-go"
        "blog-update-post-go"
        "blog-delete-post-go"
        "blog-login-go"
        "blog-logout-go"
        "blog-refresh-go"
        "blog-upload-url-go"
        "blog-delete-image-go"
    )

    local found=0
    local total=${#functions[@]}

    for func in "${functions[@]}"; do
        if aws lambda get-function --function-name "$func" &> /dev/null; then
            # Check runtime
            local runtime=$(aws lambda get-function --function-name "$func" --query 'Configuration.Runtime' --output text)
            local arch=$(aws lambda get-function --function-name "$func" --query 'Configuration.Architectures[0]' --output text)

            if [ "$runtime" == "provided.al2023" ] && [ "$arch" == "arm64" ]; then
                echo -e "${GREEN}[OK] Lambda: $func (runtime: $runtime, arch: $arch)${NC}"
            else
                echo -e "${YELLOW}[WARN] Lambda: $func (runtime: $runtime, arch: $arch)${NC}"
            fi
            ((found++))
        else
            echo -e "${RED}[ERROR] Lambda not found: $func${NC}"
        fi
    done

    echo -e "\n${GREEN}Lambda functions: $found/$total found${NC}"
}

# Validate CloudFront
validate_cloudfront() {
    echo -e "\n${YELLOW}Validating CloudFront...${NC}"

    # List distributions and find by comment
    local dist_id=$(aws cloudfront list-distributions --query "DistributionList.Items[?contains(Comment, 'Unified CDN for blog')].Id" --output text 2>/dev/null || echo "")

    if [ -n "$dist_id" ] && [ "$dist_id" != "None" ]; then
        echo -e "${GREEN}[OK] CloudFront distribution found: $dist_id${NC}"

        # Check enabled status
        local enabled=$(aws cloudfront get-distribution --id "$dist_id" --query 'Distribution.DistributionConfig.Enabled' --output text)
        if [ "$enabled" == "true" ]; then
            echo -e "${GREEN}[OK] Distribution enabled${NC}"
        else
            echo -e "${RED}[WARN] Distribution disabled${NC}"
        fi

        # Check price class
        local price_class=$(aws cloudfront get-distribution --id "$dist_id" --query 'Distribution.DistributionConfig.PriceClass' --output text)
        echo -e "${GREEN}[OK] Price class: $price_class${NC}"

        # Check origins count
        local origin_count=$(aws cloudfront get-distribution --id "$dist_id" --query 'length(Distribution.DistributionConfig.Origins.Items)' --output text)
        echo -e "${GREEN}[OK] Origins count: $origin_count${NC}"
    else
        echo -e "${YELLOW}[WARN] CloudFront distribution not found (may have different comment)${NC}"

        # Fallback: list all distributions
        echo -e "${YELLOW}Listing all distributions...${NC}"
        aws cloudfront list-distributions --query 'DistributionList.Items[*].[Id,Comment]' --output table
    fi
}

# Validate Terraform state
validate_terraform_state() {
    echo -e "\n${YELLOW}Validating Terraform State...${NC}"

    cd "$ENV_DIR"

    # Check if state exists
    if terraform state list &> /dev/null; then
        local resource_count=$(terraform state list | wc -l)
        echo -e "${GREEN}[OK] Terraform state has $resource_count resources${NC}"

        # Show resource summary
        echo -e "\n${YELLOW}Resource summary:${NC}"
        terraform state list | grep -E '^module\.' | cut -d'.' -f1-2 | sort | uniq -c | while read count module; do
            echo "  $count resources in $module"
        done
    else
        echo -e "${YELLOW}[INFO] No Terraform state found (initial import required)${NC}"
    fi
}

# Run terraform plan
run_terraform_plan() {
    echo -e "\n${YELLOW}Running Terraform Plan...${NC}"

    cd "$ENV_DIR"

    # Initialize if needed
    if [ ! -d ".terraform" ]; then
        echo -e "${YELLOW}Initializing Terraform...${NC}"
        terraform init -backend=false
    fi

    # Run plan with local backend (for validation only)
    echo -e "${YELLOW}Running plan (this may show expected changes for import)...${NC}"
    terraform plan -input=false 2>&1 | head -50
}

# Main execution
main() {
    check_prerequisites
    validate_dynamodb
    validate_s3
    validate_cognito
    validate_apigateway
    validate_lambda
    validate_cloudfront
    validate_terraform_state

    echo -e "\n=========================================="
    echo -e " Validation Complete"
    echo -e "=========================================="
    echo -e "\n${YELLOW}Next Steps:${NC}"
    echo "1. Review any warnings or errors above"
    echo "2. Uncomment import blocks in modules/*/import.tf"
    echo "3. Update import IDs with actual values from AWS"
    echo "4. Run 'terraform plan' to preview import"
    echo "5. Run 'terraform apply' to execute import"
    echo "6. Run this script again to verify state matches"
}

main
