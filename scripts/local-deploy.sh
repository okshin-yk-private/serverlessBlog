#!/usr/bin/env bash
# Local Deploy Script
# Replicates GitHub Actions CI/CD pipeline for local development
#
# Usage:
#   ./scripts/local-deploy.sh [OPTIONS]
#
# Requirements: 1.1-1.10 - Local Deploy Script Entry Point
#
# Prerequisites:
#   - AWS CLI configured with appropriate credentials
#   - Go 1.25+ installed
#   - Terraform 1.14+ installed
#   - Bun installed
#   - Node.js 22+ installed

set -euo pipefail

# ===========================================
# Color Constants
# ===========================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ===========================================
# Script Constants
# ===========================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Expected versions (matching GitHub Actions)
EXPECTED_GO_VERSION="1.25"
EXPECTED_TERRAFORM_VERSION="1.14"
EXPECTED_NODE_VERSION="22"

# SSM Parameter paths
SSM_BASIC_AUTH_USER_TEMPLATE="/serverless-blog/{env}/basic-auth/username"
SSM_BASIC_AUTH_PASS_TEMPLATE="/serverless-blog/{env}/basic-auth/password"
SSM_COGNITO_POOL_ID_TEMPLATE="/serverless-blog/{env}/cognito/user-pool-id"
SSM_COGNITO_CLIENT_ID_TEMPLATE="/serverless-blog/{env}/cognito/user-pool-client-id"
SSM_PUBLIC_BUCKET_TEMPLATE="/serverless-blog/{env}/storage/public-site-bucket-name"
SSM_ADMIN_BUCKET_TEMPLATE="/serverless-blog/{env}/storage/admin-site-bucket-name"
SSM_CLOUDFLARE_API_TOKEN_TEMPLATE="/serverless-blog/{env}/cloudflare/apikey"

# Astro SSG paths
ASTRO_PROJECT_PATH="frontend/public-astro"
ASTRO_DIST_PATH="frontend/public-astro/dist"

# Astro SSG paths
ASTRO_PROJECT_PATH="frontend/public-astro"
ASTRO_DIST_PATH="frontend/public-astro/dist"

# Valid Lambda function names
VALID_LAMBDA_FUNCTIONS=(
    "posts-create"
    "posts-get"
    "posts-get_public"
    "posts-list"
    "posts-update"
    "posts-delete"
    "auth-login"
    "auth-logout"
    "auth-refresh"
    "images-get_upload_url"
    "images-delete"
)

# Lambda function name to Terraform resource name mapping
# Format: "cli-name:terraform-resource-name"
# The Terraform resource is in module.lambda.aws_lambda_function.{resource_name}
declare -A LAMBDA_TO_TERRAFORM=(
    ["posts-create"]="create_post"
    ["posts-get"]="get_post"
    ["posts-get_public"]="get_public_post"
    ["posts-list"]="list_posts"
    ["posts-update"]="update_post"
    ["posts-delete"]="delete_post"
    ["auth-login"]="login"
    ["auth-logout"]="logout"
    ["auth-refresh"]="refresh"
    ["images-get_upload_url"]="get_upload_url"
    ["images-delete"]="delete_image"
)

# ===========================================
# Default Options
# ===========================================
TARGET_ENV="dev"
COMPONENT="all"
DRY_RUN=false
AUTO_APPROVE=false
SKIP_PREREQ_CHECK=false
NO_INVALIDATION=false
TARGET_LAMBDA=""
TARGET_FRONTEND=""
DEPLOY_ASTRO=false
PARALLEL=true
VERBOSE=false
STRICT_VERSIONS=false

# Tracking variables
DEPLOY_START_TIME=""
DEPLOYED_COMPONENTS=()
FAILED_STEPS=()

# ===========================================
# Usage / Help
# ===========================================
show_usage() {
    echo -e "${CYAN}========================================${NC}"
    echo -e " ${CYAN}Local Deploy Script${NC}"
    echo -e " ${CYAN}Replicates GitHub Actions CI/CD workflow${NC}"
    echo -e "${CYAN}========================================${NC}"
    echo ""
    echo -e "${YELLOW}Usage:${NC}"
    echo "  ./scripts/local-deploy.sh [OPTIONS]"
    echo ""
    echo -e "${YELLOW}Options:${NC}"
    echo "  --env <dev|prd>           Target environment (default: dev)"
    echo "  --component <all|infrastructure|frontend>"
    echo "                            Component to deploy (default: all)"
    echo "  --dry-run                 Show what would be deployed without making changes"
    echo "  --auto-approve            Skip confirmation prompts"
    echo "  --skip-prereq-check       Skip prerequisite validation"
    echo "  --no-invalidation         Skip CloudFront cache invalidation"
    echo "  --lambda <function-name>  Deploy only specific Lambda function"
    echo "  --frontend <public|admin> Deploy only specific frontend site"
    echo "  --astro                   Deploy Astro SSG site (frontend/public-astro)"
    echo "  --parallel                Enable parallel builds (default: enabled)"
    echo "  --no-parallel             Disable parallel builds"
    echo "  --verbose                 Show detailed output from each step"
    echo "  --strict-versions         Exit with error if tool versions don't match GitHub Actions"
    echo "  --help, -h                Show this help message"
    echo ""
    echo -e "${YELLOW}Lambda Functions:${NC}"
    echo "  posts-create, posts-get, posts-get_public, posts-list,"
    echo "  posts-update, posts-delete, auth-login, auth-logout,"
    echo "  auth-refresh, images-get_upload_url, images-delete"
    echo ""
    echo -e "${YELLOW}Examples:${NC}"
    echo "  # Full deploy to dev environment"
    echo "  ./scripts/local-deploy.sh --env dev"
    echo ""
    echo "  # Infrastructure only (Lambda + Terraform)"
    echo "  ./scripts/local-deploy.sh --component infrastructure"
    echo ""
    echo "  # Frontend only (Public + Admin sites)"
    echo "  ./scripts/local-deploy.sh --component frontend"
    echo ""
    echo "  # Dry-run to see planned changes"
    echo "  ./scripts/local-deploy.sh --dry-run"
    echo ""
    echo "  # Deploy single Lambda function"
    echo "  ./scripts/local-deploy.sh --lambda posts-create"
    echo ""
    echo "  # Deploy only public site"
    echo "  ./scripts/local-deploy.sh --frontend public"
    echo ""
    echo "  # Production deploy with auto-approve (use with caution!)"
    echo "  ./scripts/local-deploy.sh --env prd --auto-approve"
    echo ""
    echo -e "${YELLOW}Environment Variables:${NC}"
    echo "  AWS_PROFILE           AWS profile to use (optional)"
    echo "  AWS_REGION            AWS region (default: from AWS config)"
}

# ===========================================
# Argument Parsing
# ===========================================
parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --env)
                if [[ -z "${2:-}" ]]; then
                    echo -e "${RED}Error: --env requires a value (dev|prd)${NC}"
                    exit 1
                fi
                TARGET_ENV="$2"
                if [[ "$TARGET_ENV" != "dev" && "$TARGET_ENV" != "prd" ]]; then
                    echo -e "${RED}Error: Invalid environment '$TARGET_ENV'. Valid options: dev, prd${NC}"
                    exit 1
                fi
                shift 2
                ;;
            --component)
                if [[ -z "${2:-}" ]]; then
                    echo -e "${RED}Error: --component requires a value (all|infrastructure|frontend)${NC}"
                    exit 1
                fi
                COMPONENT="$2"
                if [[ "$COMPONENT" != "all" && "$COMPONENT" != "infrastructure" && "$COMPONENT" != "frontend" ]]; then
                    echo -e "${RED}Error: Invalid component '$COMPONENT'. Valid options: all, infrastructure, frontend${NC}"
                    exit 1
                fi
                shift 2
                ;;
            --dry-run)
                DRY_RUN=true
                shift
                ;;
            --auto-approve)
                AUTO_APPROVE=true
                shift
                ;;
            --skip-prereq-check)
                SKIP_PREREQ_CHECK=true
                shift
                ;;
            --no-invalidation)
                NO_INVALIDATION=true
                shift
                ;;
            --lambda)
                if [[ -z "${2:-}" ]]; then
                    echo -e "${RED}Error: --lambda requires a function name${NC}"
                    echo -e "Valid functions: ${VALID_LAMBDA_FUNCTIONS[*]}"
                    exit 1
                fi
                TARGET_LAMBDA="$2"
                # Validate function name
                local valid=false
                for func in "${VALID_LAMBDA_FUNCTIONS[@]}"; do
                    if [[ "$func" == "$TARGET_LAMBDA" ]]; then
                        valid=true
                        break
                    fi
                done
                if [[ "$valid" == false ]]; then
                    echo -e "${RED}Error: Invalid Lambda function '$TARGET_LAMBDA'${NC}"
                    echo -e "Valid functions: ${VALID_LAMBDA_FUNCTIONS[*]}"
                    exit 1
                fi
                shift 2
                ;;
            --frontend)
                if [[ -z "${2:-}" ]]; then
                    echo -e "${RED}Error: --frontend requires a value (public|admin)${NC}"
                    exit 1
                fi
                TARGET_FRONTEND="$2"
                if [[ "$TARGET_FRONTEND" != "public" && "$TARGET_FRONTEND" != "admin" ]]; then
                    echo -e "${RED}Error: Invalid frontend '$TARGET_FRONTEND'. Valid options: public, admin${NC}"
                    exit 1
                fi
                shift 2
                ;;
            --astro)
                DEPLOY_ASTRO=true
                shift
                ;;
            --parallel)
                PARALLEL=true
                shift
                ;;
            --no-parallel)
                PARALLEL=false
                shift
                ;;
            --verbose)
                VERBOSE=true
                shift
                ;;
            --strict-versions)
                STRICT_VERSIONS=true
                shift
                ;;
            --help|-h)
                show_usage
                exit 0
                ;;
            *)
                echo -e "${RED}Error: Unknown option '$1'${NC}"
                echo "Use --help for usage information"
                exit 1
                ;;
        esac
    done
}

# ===========================================
# Logging Utilities
# ===========================================
log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*"
}

log_section() {
    echo ""
    echo -e "${CYAN}===========================================${NC}"
    echo -e "${CYAN} $*${NC}"
    echo -e "${CYAN}===========================================${NC}"
}

log_verbose() {
    if [[ "$VERBOSE" == true ]]; then
        echo -e "${BLUE}[VERBOSE]${NC} $*" >&2
    fi
}

# ===========================================
# Lambda to Terraform Resource Mapping
# ===========================================

# Convert Lambda function name (CLI format) to Terraform resource address
# Arguments:
#   $1 - Lambda function name (e.g., "posts-create", "auth-login")
# Returns:
#   Terraform resource address (e.g., "module.lambda.aws_lambda_function.create_post")
get_terraform_target() {
    local lambda_name="$1"
    local tf_resource="${LAMBDA_TO_TERRAFORM[$lambda_name]:-}"

    if [[ -z "$tf_resource" ]]; then
        log_error "Unknown Lambda function: $lambda_name"
        log_info "Valid functions: ${VALID_LAMBDA_FUNCTIONS[*]}"
        return 1
    fi

    echo "module.lambda.aws_lambda_function.${tf_resource}"
}

# ===========================================
# Version Extraction Utilities
# ===========================================
extract_major_minor() {
    # Extract major.minor from version string (e.g., "1.25.5" -> "1.25")
    echo "$1" | grep -oE '[0-9]+\.[0-9]+' | head -1
}

compare_versions() {
    local current="$1"
    local expected="$2"
    local name="$3"

    local current_mm
    local expected_mm
    current_mm=$(extract_major_minor "$current")
    expected_mm=$(extract_major_minor "$expected")

    if [[ "$current_mm" == "$expected_mm" ]]; then
        log_success "$name version: $current (matches expected $expected)"
        return 0
    else
        log_warning "$name version: $current (expected $expected)"
        if [[ "$STRICT_VERSIONS" == true ]]; then
            log_error "Version mismatch with --strict-versions enabled"
            return 1
        fi
        return 0
    fi
}

# ===========================================
# AWS Credential Validation (Requirement 2)
# ===========================================
validate_aws() {
    log_section "AWS Credential Validation"

    # Check AWS CLI installation
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed"
        echo ""
        echo "Installation instructions:"
        echo "  macOS:  brew install awscli"
        echo "  Linux:  curl \"https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip\" -o \"awscliv2.zip\" && unzip awscliv2.zip && sudo ./aws/install"
        echo "  See:    https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
        return 1
    fi
    log_success "AWS CLI is installed"

    # Validate credentials
    log_info "Validating AWS credentials..."
    local caller_identity
    if ! caller_identity=$(aws sts get-caller-identity 2>&1); then
        log_error "AWS credentials are invalid or expired"
        echo ""
        echo "Possible solutions:"
        echo "  1. Run 'aws configure' to set up credentials"
        echo "  2. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables"
        echo "  3. Run 'aws sso login' if using AWS SSO"
        echo "  4. Check AWS_PROFILE environment variable"
        return 1
    fi

    # Extract and display account info
    local account_id
    local user_arn
    local region
    account_id=$(echo "$caller_identity" | jq -r '.Account')
    user_arn=$(echo "$caller_identity" | jq -r '.Arn')
    region=$(aws configure get region 2>/dev/null || echo "${AWS_REGION:-ap-northeast-1}")

    log_success "AWS credentials validated"
    echo -e "  Account ID: ${GREEN}$account_id${NC}"
    echo -e "  User ARN:   ${GREEN}$user_arn${NC}"
    echo -e "  Region:     ${GREEN}$region${NC}"

    return 0
}

# ===========================================
# Prerequisite Validation (Requirement 3)
# ===========================================
validate_prereq() {
    log_section "Prerequisite Validation"

    local has_error=false

    # Check Go
    if command -v go &> /dev/null; then
        local go_version
        go_version=$(go version | grep -oE 'go[0-9]+\.[0-9]+(\.[0-9]+)?' | sed 's/go//')
        if ! compare_versions "$go_version" "$EXPECTED_GO_VERSION" "Go"; then
            has_error=true
        fi
    else
        log_error "Go is not installed"
        echo "  Install: https://go.dev/doc/install"
        has_error=true
    fi

    # Check Terraform
    if command -v terraform &> /dev/null; then
        local tf_version
        tf_version=$(terraform version -json 2>/dev/null | jq -r '.terraform_version' 2>/dev/null || terraform version | head -1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+')
        if ! compare_versions "$tf_version" "$EXPECTED_TERRAFORM_VERSION" "Terraform"; then
            has_error=true
        fi
    else
        log_error "Terraform is not installed"
        echo "  Install: https://developer.hashicorp.com/terraform/downloads"
        has_error=true
    fi

    # Check Bun
    if command -v bun &> /dev/null; then
        local bun_version
        bun_version=$(bun --version)
        log_success "Bun version: $bun_version"
    else
        log_error "Bun is not installed"
        echo "  Install: curl -fsSL https://bun.sh/install | bash"
        has_error=true
    fi

    # Check Node.js
    if command -v node &> /dev/null; then
        local node_version
        node_version=$(node --version | sed 's/v//')
        if ! compare_versions "$node_version" "$EXPECTED_NODE_VERSION" "Node.js"; then
            has_error=true
        fi
    else
        log_error "Node.js is not installed"
        echo "  Install: https://nodejs.org/"
        has_error=true
    fi

    # Check jq (for JSON parsing)
    if command -v jq &> /dev/null; then
        log_success "jq is installed"
    else
        log_error "jq is not installed (required for JSON parsing)"
        echo "  Install: brew install jq (macOS) or apt-get install jq (Linux)"
        has_error=true
    fi

    if [[ "$has_error" == true ]]; then
        log_error "Prerequisite validation failed"
        return 1
    fi

    log_success "All prerequisites met"
    return 0
}

# ===========================================
# SSM Parameter Fetching (Requirement 12)
# ===========================================

# Mask sensitive value for logging (shows first 2 and last 2 chars)
mask_sensitive_value() {
    local value="$1"
    local length=${#value}

    if [[ $length -le 4 ]]; then
        echo "****"
    else
        echo "${value:0:2}$( printf '*%.0s' $(seq 1 $((length - 4))) )${value: -2}"
    fi
}

# Log SSM parameter fetch with optional masking
log_ssm_fetch() {
    local param_name="$1"
    local value="$2"
    local is_sensitive="${3:-false}"

    if [[ "$VERBOSE" == true ]]; then
        if [[ "$is_sensitive" == true ]]; then
            local masked
            masked=$(mask_sensitive_value "$value")
            log_verbose "SSM: $param_name = $masked"
        else
            log_verbose "SSM: $param_name = $value"
        fi
    fi
}

# Fetch SSM parameter with optional decryption and masking
# Arguments:
#   $1 - Parameter name (full path)
#   $2 - With decryption flag (true|false, default: false)
# Returns:
#   Parameter value on stdout
#   Exit code 0 on success, 1 on failure
fetch_ssm() {
    local param_name="$1"
    local with_decryption="${2:-false}"

    local decrypt_flag=""
    if [[ "$with_decryption" == true ]]; then
        decrypt_flag="--with-decryption"
    fi

    local value
    local error_output
    # shellcheck disable=SC2086
    if ! value=$(aws ssm get-parameter --name "$param_name" $decrypt_flag --query "Parameter.Value" --output text 2>&1); then
        error_output="$value"
        log_error "Failed to retrieve SSM parameter: $param_name"

        # Check for specific error types
        if echo "$error_output" | grep -q "ParameterNotFound"; then
            echo "  Parameter not found at path: $param_name"
        elif echo "$error_output" | grep -q "AccessDeniedException"; then
            echo "  Access denied. Check IAM permissions for ssm:GetParameter"
        else
            echo "  Error: $error_output"
        fi
        return 1
    fi

    # Log with masking for sensitive values (decrypted parameters are considered sensitive)
    log_ssm_fetch "$param_name" "$value" "$with_decryption"

    echo "$value"
}

# ===========================================
# Lambda Build (Requirement 4)
# ===========================================
build_lambdas() {
    local target_function="${1:-}"

    log_section "Go Lambda Build"

    cd "$PROJECT_ROOT/go-functions"

    local start_time
    start_time=$(date +%s)

    if [[ -n "$target_function" ]]; then
        # Single function build using Makefile's build-one target
        log_info "Building single Lambda function: $target_function"

        # Convert function name format (posts-create -> posts/create)
        local func_path
        func_path=$(echo "$target_function" | sed 's/-/\//')

        log_verbose "Using: make build-one FUNC=$func_path"

        if [[ "$VERBOSE" == true ]]; then
            make build-one FUNC="$func_path"
        else
            make build-one FUNC="$func_path" 2>&1 | tail -5
        fi

        # Verify the binary was created
        if [[ ! -f "bin/$target_function/bootstrap" ]]; then
            log_error "Build failed: binary not found at bin/$target_function/bootstrap"
            return 1
        fi

        log_success "Built: $target_function"
    else
        # Build all functions
        log_info "Building all Lambda functions..."

        if [[ "$PARALLEL" == true ]]; then
            log_info "Using parallel build (make -j$(nproc))"
            if [[ "$VERBOSE" == true ]]; then
                make -j"$(nproc)" build
            else
                make -j"$(nproc)" build 2>&1 | tail -20
            fi
        else
            log_info "Using sequential build"
            if [[ "$VERBOSE" == true ]]; then
                make build
            else
                make build 2>&1 | tail -20
            fi
        fi

        # Verify all binaries exist
        local count=0
        for func in "${VALID_LAMBDA_FUNCTIONS[@]}"; do
            if [[ -f "bin/$func/bootstrap" ]]; then
                ((count++))
                log_verbose "Verified: $func"
            else
                log_error "Missing binary: $func"
            fi
        done

        log_success "Built $count/${#VALID_LAMBDA_FUNCTIONS[@]} Lambda functions"
    fi

    local end_time
    end_time=$(date +%s)
    local duration=$((end_time - start_time))
    log_info "Build time: ${duration}s"

    cd "$PROJECT_ROOT"
    DEPLOYED_COMPONENTS+=("Lambda Build")

    # Record timing for summary
    local details=""
    if [[ -n "$target_function" ]]; then
        details="Single function: $target_function"
    else
        details="All ${#VALID_LAMBDA_FUNCTIONS[@]} functions"
    fi
    record_step_timing "Lambda Build" "$duration" "$details"

    return 0
}

# ===========================================
# Terraform Deployment (Requirement 5)
# ===========================================
run_terraform() {
    local env="$1"
    local dry_run="${2:-false}"
    local auto_approve="${3:-false}"
    local target="${4:-}"

    log_section "Terraform Deployment (${env})"

    local tf_start_time
    tf_start_time=$(date +%s)

    local env_dir="$PROJECT_ROOT/terraform/environments/$env"

    if [[ ! -d "$env_dir" ]]; then
        log_error "Environment directory not found: $env_dir"
        return 1
    fi

    cd "$env_dir"

    # Fetch Basic Auth credentials from SSM (for dev environment)
    if [[ "$env" == "dev" ]]; then
        log_info "Fetching Basic Auth credentials from SSM..."
        local ssm_user_path="${SSM_BASIC_AUTH_USER_TEMPLATE//\{env\}/$env}"
        local ssm_pass_path="${SSM_BASIC_AUTH_PASS_TEMPLATE//\{env\}/$env}"

        local basic_auth_user
        local basic_auth_pass
        # Use --with-decryption for both parameters (safe for non-SecureString too)
        if basic_auth_user=$(fetch_ssm "$ssm_user_path" true) && \
           basic_auth_pass=$(fetch_ssm "$ssm_pass_path" true); then
            export TF_VAR_basic_auth_username="$basic_auth_user"
            export TF_VAR_basic_auth_password="$basic_auth_pass"
            log_success "Basic Auth credentials loaded from SSM (user: $basic_auth_user)"
        else
            log_warning "Could not fetch Basic Auth credentials, continuing without them"
            log_warning "Basic Auth will be disabled for this deployment"
        fi
    fi

    # Fetch Cloudflare API token from SSM (for custom domain configuration)
    log_info "Checking for Cloudflare API token in SSM..."
    local ssm_cloudflare_path="${SSM_CLOUDFLARE_API_TOKEN_TEMPLATE//\{env\}/$env}"
    local cloudflare_api_token
    if cloudflare_api_token=$(fetch_ssm "$ssm_cloudflare_path" true 2>/dev/null); then
        export TF_VAR_cloudflare_api_token="$cloudflare_api_token"
        log_success "Cloudflare API token loaded from SSM"
    else
        log_warning "Could not fetch Cloudflare API token from SSM"
        log_warning "Custom domain configuration will be disabled (set enable_custom_domain=false)"
        # Export empty string to avoid Terraform variable error
        export TF_VAR_cloudflare_api_token=""
    fi

    # Terraform init
    log_info "Running terraform init..."
    if [[ "$VERBOSE" == true ]]; then
        terraform init
    else
        terraform init -input=false > /dev/null 2>&1
    fi
    log_success "Terraform initialized"

    # Terraform plan
    log_info "Running terraform plan..."
    local target_flag=""
    if [[ -n "$target" ]]; then
        target_flag="-target=$target"
        log_info "Targeting specific resource: $target"
    fi

    local plan_output
    local plan_exit_code
    # shellcheck disable=SC2086
    plan_output=$(terraform plan -out=tfplan.binary $target_flag -detailed-exitcode 2>&1) && plan_exit_code=0 || plan_exit_code=$?

    if [[ "$VERBOSE" == true ]]; then
        echo "$plan_output"
    else
        echo "$plan_output" | tail -30
    fi

    # Check plan result
    if [[ $plan_exit_code -eq 0 ]]; then
        log_info "No changes required"
        cd "$PROJECT_ROOT"
        return 0
    elif [[ $plan_exit_code -eq 1 ]]; then
        log_error "Terraform plan failed"
        cd "$PROJECT_ROOT"
        return 1
    fi
    # exit code 2 means there are changes

    # Dry-run mode - skip apply
    if [[ "$dry_run" == true ]]; then
        log_info "Dry-run mode: Skipping terraform apply"
        cd "$PROJECT_ROOT"
        return 0
    fi

    # Confirmation prompt
    if [[ "$auto_approve" != true ]]; then
        echo ""
        if [[ "$env" == "prd" ]]; then
            # Double confirmation for production
            log_warning "⚠️  You are about to deploy to PRODUCTION!"
            echo -n "Type 'I understand this is production' to confirm: "
            read -r confirmation
            if [[ "$confirmation" != "I understand this is production" ]]; then
                log_info "Deployment cancelled"
                cd "$PROJECT_ROOT"
                return 0
            fi
        else
            echo -n "Apply these changes? (y/N): "
            read -r confirmation
            if [[ "$confirmation" != "y" && "$confirmation" != "Y" ]]; then
                log_info "Deployment cancelled"
                cd "$PROJECT_ROOT"
                return 0
            fi
        fi
    fi

    # Terraform apply
    log_info "Running terraform apply..."
    local apply_exit_code
    if [[ "$VERBOSE" == true ]]; then
        terraform apply tfplan.binary
        apply_exit_code=$?
    else
        terraform apply tfplan.binary 2>&1 | tail -30
        apply_exit_code=${PIPESTATUS[0]}
    fi

    if [[ $apply_exit_code -ne 0 ]]; then
        log_error "Terraform apply failed"
        FAILED_STEPS+=("Terraform Apply")
        cd "$PROJECT_ROOT"
        return 1
    fi

    log_success "Terraform apply completed"

    # Get outputs
    log_info "Retrieving deployment outputs..."
    local cloudfront_domain
    local api_endpoint
    cloudfront_domain=$(terraform output -raw cloudfront_domain_name 2>/dev/null || echo "N/A")
    api_endpoint=$(terraform output -raw api_endpoint 2>/dev/null || echo "N/A")

    echo ""
    echo -e "  CloudFront: ${GREEN}$cloudfront_domain${NC}"
    echo -e "  API:        ${GREEN}$api_endpoint${NC}"

    cd "$PROJECT_ROOT"
    DEPLOYED_COMPONENTS+=("Terraform ($env)")

    # Record timing for summary
    local tf_end_time
    tf_end_time=$(date +%s)
    local tf_duration=$((tf_end_time - tf_start_time))
    local details=""
    if [[ -n "$target" ]]; then
        details="Targeted: $target"
    else
        details="Full infrastructure"
    fi
    record_step_timing "Terraform ($env)" "$tf_duration" "$details"

    return 0
}

# ===========================================
# Frontend Build (Requirement 6)
# ===========================================
build_frontend() {
    local env="$1"
    local target="${2:-}"

    log_section "Frontend Build"

    local start_time
    start_time=$(date +%s)

    # Build Public Site
    if [[ -z "$target" || "$target" == "public" ]]; then
        log_info "Building Public Site..."
        cd "$PROJECT_ROOT/frontend/public"

        log_verbose "Running: bun install --frozen-lockfile"
        if ! bun install --frozen-lockfile > /dev/null 2>&1; then
            log_error "Public Site: Failed to install dependencies"
            log_error "Run 'cd frontend/public && bun install' to see detailed error"
            FAILED_STEPS+=("Frontend Public Install")
            return 1
        fi
        log_verbose "Dependencies installed"

        log_verbose "Running: NODE_ENV=production bun run build"
        local build_output
        if ! build_output=$(NODE_ENV=production bun run build 2>&1); then
            log_error "Public Site: Build failed"
            echo "$build_output" | tail -20
            FAILED_STEPS+=("Frontend Public Build")
            return 1
        fi

        if [[ "$VERBOSE" == true ]]; then
            echo "$build_output"
        fi

        local public_size
        public_size=$(du -sh dist 2>/dev/null | cut -f1)
        log_success "Public Site built ($public_size)"
    fi

    # Build Admin Site
    if [[ -z "$target" || "$target" == "admin" ]]; then
        log_info "Building Admin Site..."

        # Fetch Cognito config from SSM
        local ssm_pool_path="${SSM_COGNITO_POOL_ID_TEMPLATE//\{env\}/$env}"
        local ssm_client_path="${SSM_COGNITO_CLIENT_ID_TEMPLATE//\{env\}/$env}"

        local cognito_pool_id
        local cognito_client_id

        if cognito_pool_id=$(fetch_ssm "$ssm_pool_path" false) && \
           cognito_client_id=$(fetch_ssm "$ssm_client_path" false); then
            export VITE_COGNITO_USER_POOL_ID="$cognito_pool_id"
            export VITE_COGNITO_USER_POOL_CLIENT_ID="$cognito_client_id"
            export VITE_API_URL="/api"
            log_success "Cognito config loaded from SSM"
        else
            log_warning "Could not fetch Cognito config, using environment variables"
        fi

        cd "$PROJECT_ROOT/frontend/admin"

        log_verbose "Running: bun install --frozen-lockfile"
        if ! bun install --frozen-lockfile > /dev/null 2>&1; then
            log_error "Admin Site: Failed to install dependencies"
            log_error "Run 'cd frontend/admin && bun install' to see detailed error"
            FAILED_STEPS+=("Frontend Admin Install")
            return 1
        fi
        log_verbose "Dependencies installed"

        log_verbose "Running: NODE_ENV=production bun run build"
        local build_output
        if ! build_output=$(NODE_ENV=production bun run build 2>&1); then
            log_error "Admin Site: Build failed"
            echo "$build_output" | tail -20
            FAILED_STEPS+=("Frontend Admin Build")
            return 1
        fi

        if [[ "$VERBOSE" == true ]]; then
            echo "$build_output"
        fi

        local admin_size
        admin_size=$(du -sh dist 2>/dev/null | cut -f1)
        log_success "Admin Site built ($admin_size)"
    fi

    local end_time
    end_time=$(date +%s)
    local duration=$((end_time - start_time))
    log_info "Build time: ${duration}s"

    cd "$PROJECT_ROOT"
    DEPLOYED_COMPONENTS+=("Frontend Build")

    # Record timing for summary
    local details=""
    if [[ -n "$target" ]]; then
        details="$target site only"
    else
        details="Public + Admin sites"
    fi
    record_step_timing "Frontend Build" "$duration" "$details"

    return 0
}

# ===========================================
# Astro SSG Build and Deploy (Requirements 9.1, 9.2, 9.9, 9.10, 9.11)
# Task 5.2: ローカルデプロイスクリプト更新
# ===========================================
build_and_deploy_astro() {
    local env="$1"
    local dry_run="${2:-false}"

    log_section "Astro SSG Build and Deploy"

    local astro_start_time
    astro_start_time=$(date +%s)

    local astro_path="$PROJECT_ROOT/$ASTRO_PROJECT_PATH"

    if [[ ! -d "$astro_path" ]]; then
        log_error "Astro project not found: $astro_path"
        return 1
    fi

    cd "$astro_path"

    # Install dependencies (Requirement 9.1)
    log_info "Installing Astro dependencies..."
    if ! bun install --frozen-lockfile > /dev/null 2>&1; then
        log_error "Failed to install Astro dependencies"
        log_error "Run 'cd $ASTRO_PROJECT_PATH && bun install' to see detailed error"
        FAILED_STEPS+=("Astro Install")
        return 1
    fi
    log_success "Astro dependencies installed"

    # Get API URL from Terraform or SSM (Requirement 9.10)
    local api_url=""
    local env_dir="$PROJECT_ROOT/terraform/environments/$env"
    if [[ -d "$env_dir" ]]; then
        cd "$env_dir"
        # Ensure Terraform is initialized
        if [[ ! -d ".terraform" ]]; then
            terraform init -input=false > /dev/null 2>&1
        fi
        api_url=$(terraform output -raw api_endpoint 2>/dev/null || echo "")
        cd "$astro_path"
    fi

    if [[ -z "$api_url" ]]; then
        log_warning "Could not fetch API URL from Terraform, using default"
        api_url="/api"
    fi

    # Build Astro project (Requirement 9.1)
    log_info "Building Astro project..."
    log_verbose "API_URL: $api_url"

    local build_output
    if ! build_output=$(PUBLIC_API_URL="$api_url" API_URL="$api_url" NODE_ENV=production bun run build 2>&1); then
        log_error "Astro build failed"
        echo "$build_output" | tail -20
        FAILED_STEPS+=("Astro Build")
        return 1
    fi

    if [[ "$VERBOSE" == true ]]; then
        echo "$build_output"
    fi

    local dist_size
    dist_size=$(du -sh dist 2>/dev/null | cut -f1)
    log_success "Astro built ($dist_size)"

    local build_time
    build_time=$(date +%s)
    local build_duration=$((build_time - astro_start_time))
    log_info "Build time: ${build_duration}s"

    # Dry-run mode - skip deploy
    if [[ "$dry_run" == true ]]; then
        log_info "Dry-run mode: Skipping Astro S3 deployment"
        cd "$PROJECT_ROOT"
        DEPLOYED_COMPONENTS+=("Astro Build (dry-run)")
        record_step_timing "Astro Build" "$build_duration" "Dry-run mode"
        return 0
    fi

    # Fetch bucket and distribution from SSM/Terraform
    local bucket_name=""
    local distribution_id=""

    # Get public bucket from SSM
    local ssm_public_path="${SSM_PUBLIC_BUCKET_TEMPLATE//\{env\}/$env}"
    if ! bucket_name=$(fetch_ssm "$ssm_public_path" false); then
        log_error "Could not fetch public bucket name"
        return 1
    fi

    # Get CloudFront distribution ID from Terraform
    if [[ -d "$env_dir" ]]; then
        cd "$env_dir"
        distribution_id=$(terraform output -raw cloudfront_distribution_id 2>/dev/null || echo "")
        cd "$astro_path"
    fi

    if [[ -z "$distribution_id" ]]; then
        log_warning "Could not fetch CloudFront distribution ID, invalidation may fail"
        distribution_id="UNKNOWN"
    fi

    # Deploy using atomic deployment script (Requirement 9.2)
    log_info "Deploying to S3 using atomic deployment..."
    log_verbose "Bucket: $bucket_name"
    log_verbose "Distribution: $distribution_id"

    local region
    region=$(aws configure get region 2>/dev/null || echo "ap-northeast-1")

    cd "$PROJECT_ROOT/scripts/deploy"

    # Install deploy script dependencies if needed
    if [[ ! -d "node_modules" ]]; then
        log_info "Installing deploy script dependencies..."
        bun install --frozen-lockfile > /dev/null 2>&1
    fi

    local deploy_args=(
        "--project-root" "$PROJECT_ROOT"
        "--bucket" "$bucket_name"
        "--distribution" "$distribution_id"
        "--api-url" "$api_url"
        "--region" "$region"
        "--astro-path" "$ASTRO_PROJECT_PATH"
    )

    if [[ "$VERBOSE" == true ]]; then
        deploy_args+=("--verbose")
    fi

    # Run the atomic deployment
    local deploy_output
    if ! deploy_output=$(bun run astro-deploy -- "${deploy_args[@]}" 2>&1); then
        log_error "Astro S3 deployment failed"
        echo "$deploy_output" | tail -30
        FAILED_STEPS+=("Astro S3 Deploy")
        cd "$PROJECT_ROOT"
        return 1
    fi

    if [[ "$VERBOSE" == true ]]; then
        echo "$deploy_output"
    fi

    log_success "Astro deployed to S3"

    cd "$PROJECT_ROOT"

    local end_time
    end_time=$(date +%s)
    local total_duration=$((end_time - astro_start_time))

    # Check 5-minute time limit (Requirement 9.11)
    if [[ $total_duration -gt 300 ]]; then
        log_warning "Astro build and deploy exceeded 5-minute target (${total_duration}s)"
    else
        log_info "Astro build and deploy completed in ${total_duration}s (under 5-minute target)"
    fi

    DEPLOYED_COMPONENTS+=("Astro SSG Deploy")
    record_step_timing "Astro SSG Deploy" "$total_duration" "Build + Atomic S3 Deploy"

    return 0
}

# ===========================================
# S3 Deployment (Requirement 7)
# ===========================================
deploy_s3() {
    local env="$1"
    local target="${2:-}"

    log_section "S3 Deployment"

    local s3_start_time
    s3_start_time=$(date +%s)

    # Fetch bucket names from SSM
    local ssm_public_path="${SSM_PUBLIC_BUCKET_TEMPLATE//\{env\}/$env}"
    local ssm_admin_path="${SSM_ADMIN_BUCKET_TEMPLATE//\{env\}/$env}"

    local public_bucket
    local admin_bucket

    if ! public_bucket=$(fetch_ssm "$ssm_public_path" false); then
        log_error "Could not fetch public bucket name"
        return 1
    fi

    if ! admin_bucket=$(fetch_ssm "$ssm_admin_path" false); then
        log_error "Could not fetch admin bucket name"
        return 1
    fi

    # Deploy Public Site
    if [[ -z "$target" || "$target" == "public" ]]; then
        log_info "Deploying Public Site to S3..."
        local public_output
        public_output=$(aws s3 sync "$PROJECT_ROOT/frontend/public/dist/" "s3://$public_bucket/" --delete 2>&1)

        if [[ $? -eq 0 ]]; then
            local upload_count
            upload_count=$(echo "$public_output" | grep -c "upload:" || echo "0")
            local delete_count
            delete_count=$(echo "$public_output" | grep -c "delete:" || echo "0")
            log_success "Public Site deployed (uploaded: $upload_count, deleted: $delete_count)"
        else
            log_error "Public Site deployment failed"
            echo "$public_output"
            FAILED_STEPS+=("S3 Public Deploy")
            return 1
        fi
    fi

    # Deploy Admin Site
    # Admin files are stored under /admin/ prefix to avoid CloudFront cache key collision with public site
    if [[ -z "$target" || "$target" == "admin" ]]; then
        log_info "Deploying Admin Site to S3 (under /admin/ prefix)..."
        local admin_output
        admin_output=$(aws s3 sync "$PROJECT_ROOT/frontend/admin/dist/" "s3://$admin_bucket/admin/" --delete 2>&1)

        if [[ $? -eq 0 ]]; then
            local upload_count
            upload_count=$(echo "$admin_output" | grep -c "upload:" || echo "0")
            local delete_count
            delete_count=$(echo "$admin_output" | grep -c "delete:" || echo "0")
            log_success "Admin Site deployed (uploaded: $upload_count, deleted: $delete_count)"
        else
            log_error "Admin Site deployment failed"
            echo "$admin_output"
            FAILED_STEPS+=("S3 Admin Deploy")
            return 1
        fi
    fi

    DEPLOYED_COMPONENTS+=("S3 Deployment")

    # Record timing for summary
    local s3_end_time
    s3_end_time=$(date +%s)
    local s3_duration=$((s3_end_time - s3_start_time))
    local details=""
    if [[ -n "$target" ]]; then
        details="$target site only"
    else
        details="Public + Admin sites"
    fi
    record_step_timing "S3 Deployment" "$s3_duration" "$details"

    return 0
}

# ===========================================
# CloudFront Invalidation (Requirement 8)
# ===========================================
invalidate_cf() {
    local env="$1"

    if [[ "$NO_INVALIDATION" == true ]]; then
        log_info "Skipping CloudFront invalidation (--no-invalidation)"
        return 0
    fi

    log_section "CloudFront Cache Invalidation"

    local cf_start_time
    cf_start_time=$(date +%s)

    # Get distribution ID from Terraform output
    local env_dir="$PROJECT_ROOT/terraform/environments/$env"

    if [[ ! -d "$env_dir" ]]; then
        log_warning "Environment directory not found, skipping invalidation"
        return 0
    fi

    cd "$env_dir"

    # Ensure Terraform is initialized (required for output command)
    if [[ ! -d ".terraform" ]]; then
        log_info "Initializing Terraform for output retrieval..."
        terraform init -input=false > /dev/null 2>&1
    fi

    local distribution_id
    distribution_id=$(terraform output -raw cloudfront_distribution_id 2>/dev/null || echo "")

    if [[ -z "$distribution_id" ]]; then
        # Fallback: try to find distribution from AWS
        log_info "Looking up CloudFront distribution..."
        distribution_id=$(aws cloudfront list-distributions \
            --query "DistributionList.Items[?contains(Origins.Items[].DomainName, 'serverless-blog')].Id" \
            --output text 2>/dev/null | head -1)
    fi

    if [[ -z "$distribution_id" ]]; then
        log_warning "CloudFront distribution not found, skipping invalidation"
        cd "$PROJECT_ROOT"
        return 0
    fi

    log_info "Creating invalidation for distribution: $distribution_id"

    local invalidation_output
    if invalidation_output=$(aws cloudfront create-invalidation \
        --distribution-id "$distribution_id" \
        --paths "/*" 2>&1); then

        local invalidation_id
        invalidation_id=$(echo "$invalidation_output" | jq -r '.Invalidation.Id')
        log_success "CloudFront invalidation created: $invalidation_id"
    else
        log_warning "CloudFront invalidation failed (non-fatal)"
        echo "$invalidation_output"
    fi

    cd "$PROJECT_ROOT"
    DEPLOYED_COMPONENTS+=("CloudFront Invalidation")

    # Record timing for summary
    local cf_end_time
    cf_end_time=$(date +%s)
    local cf_duration=$((cf_end_time - cf_start_time))
    record_step_timing "CloudFront Invalidation" "$cf_duration" "Path: /*"

    return 0
}

# ===========================================
# Deployment Summary (Requirement 9)
# ===========================================

# Step timing storage (associative array for step durations)
declare -A STEP_DURATIONS
declare -A STEP_DETAILS

# Record step timing
record_step_timing() {
    local step_name="$1"
    local duration="$2"
    local details="${3:-}"
    STEP_DURATIONS["$step_name"]="$duration"
    if [[ -n "$details" ]]; then
        STEP_DETAILS["$step_name"]="$details"
    fi
}

# Format duration in human-readable format
format_duration() {
    local seconds="$1"
    if [[ $seconds -ge 60 ]]; then
        local minutes=$((seconds / 60))
        local remaining_seconds=$((seconds % 60))
        echo "${minutes}m ${remaining_seconds}s"
    else
        echo "${seconds}s"
    fi
}

show_summary() {
    local env="$1"
    local end_time
    end_time=$(date +%s)
    local total_duration=$((end_time - DEPLOY_START_TIME))

    log_section "Deployment Summary"

    # Basic information
    echo -e "  Environment:  ${GREEN}$env${NC}"
    echo -e "  Duration:     ${GREEN}$(format_duration $total_duration)${NC}"

    # Show timestamps in verbose mode
    if [[ "$VERBOSE" == true ]]; then
        local start_datetime
        local end_datetime
        start_datetime=$(date -d "@$DEPLOY_START_TIME" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || date -r "$DEPLOY_START_TIME" "+%Y-%m-%d %H:%M:%S")
        end_datetime=$(date -d "@$end_time" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || date -r "$end_time" "+%Y-%m-%d %H:%M:%S")
        echo -e "  Started:      ${BLUE}$start_datetime${NC}"
        echo -e "  Finished:     ${BLUE}$end_datetime${NC}"
    fi
    echo ""

    # Deployed components
    echo -e "${CYAN}Deployed Components:${NC}"
    if [[ ${#DEPLOYED_COMPONENTS[@]} -eq 0 ]]; then
        echo "  (none)"
    else
        for component in "${DEPLOYED_COMPONENTS[@]}"; do
            local duration_info=""
            if [[ -n "${STEP_DURATIONS[$component]:-}" ]]; then
                duration_info=" (${STEP_DURATIONS[$component]}s)"
            fi
            echo -e "  ${GREEN}✓${NC} $component$duration_info"

            # Show step details in verbose mode
            if [[ "$VERBOSE" == true && -n "${STEP_DETAILS[$component]:-}" ]]; then
                echo -e "      ${BLUE}${STEP_DETAILS[$component]}${NC}"
            fi
        done
    fi

    # Failed steps
    if [[ ${#FAILED_STEPS[@]} -gt 0 ]]; then
        echo ""
        echo -e "${RED}Failed Steps:${NC}"
        for step in "${FAILED_STEPS[@]}"; do
            echo -e "  ${RED}✗${NC} $step"
        done
    fi

    # Get URLs from Terraform if available
    local env_dir="$PROJECT_ROOT/terraform/environments/$env"
    if [[ -d "$env_dir" ]]; then
        cd "$env_dir"
        local cloudfront_domain
        local api_endpoint
        cloudfront_domain=$(terraform output -raw cloudfront_domain_name 2>/dev/null || echo "")
        api_endpoint=$(terraform output -raw api_endpoint 2>/dev/null || echo "")

        if [[ -n "$cloudfront_domain" || -n "$api_endpoint" ]]; then
            echo ""
            echo -e "${CYAN}Endpoints:${NC}"
            [[ -n "$cloudfront_domain" ]] && echo -e "  CloudFront: ${GREEN}https://$cloudfront_domain${NC}"
            [[ -n "$api_endpoint" ]] && echo -e "  API:        ${GREEN}$api_endpoint${NC}"
        fi
        cd "$PROJECT_ROOT"
    fi

    # Verbose mode: show all step timings
    if [[ "$VERBOSE" == true && ${#STEP_DURATIONS[@]} -gt 0 ]]; then
        echo ""
        echo -e "${CYAN}Step Timings:${NC}"
        for step in "${!STEP_DURATIONS[@]}"; do
            echo -e "  $step: ${BLUE}${STEP_DURATIONS[$step]}s${NC}"
        done
    fi

    echo ""
    if [[ ${#FAILED_STEPS[@]} -eq 0 ]]; then
        echo -e "${GREEN}✓ Deployment completed successfully!${NC}"
        return 0
    else
        echo -e "${RED}✗ Deployment completed with errors${NC}"
        return 1
    fi
}

# ===========================================
# Main Execution
# ===========================================
main() {
    DEPLOY_START_TIME=$(date +%s)

    echo -e "${CYAN}===========================================${NC}"
    echo -e "${CYAN} Local Deploy Script${NC}"
    echo -e "${CYAN} Environment: $TARGET_ENV${NC}"
    echo -e "${CYAN} Component: $COMPONENT${NC}"
    [[ "$DEPLOY_ASTRO" == true ]] && echo -e "${CYAN} Astro: Enabled${NC}"
    [[ "$DRY_RUN" == true ]] && echo -e "${CYAN} Mode: DRY-RUN${NC}"
    echo -e "${CYAN}===========================================${NC}"

    # Step 1: Prerequisite validation
    if [[ "$SKIP_PREREQ_CHECK" != true ]]; then
        if ! validate_prereq; then
            exit 1
        fi
    else
        log_info "Skipping prerequisite check (--skip-prereq-check)"
    fi

    # Step 2: AWS credential validation
    if ! validate_aws; then
        exit 1
    fi

    # Step 3: Astro deployment (if requested separately)
    if [[ "$DEPLOY_ASTRO" == true && "$COMPONENT" == "all" ]]; then
        # Astro is included in full deployment, handled below
        :
    elif [[ "$DEPLOY_ASTRO" == true ]]; then
        # Deploy only Astro
        if ! build_and_deploy_astro "$TARGET_ENV" "$DRY_RUN"; then
            exit 1
        fi
        show_summary "$TARGET_ENV"
        return
    fi

    # Step 4: Deploy based on component selection
    case "$COMPONENT" in
        infrastructure)
            # Build Lambda first
            if [[ -n "$TARGET_LAMBDA" ]]; then
                if ! build_lambdas "$TARGET_LAMBDA"; then
                    exit 1
                fi
                # Targeted Terraform apply for single Lambda
                local target_resource
                if ! target_resource=$(get_terraform_target "$TARGET_LAMBDA"); then
                    exit 1
                fi
                log_info "Targeting Terraform resource: $target_resource"
                if ! run_terraform "$TARGET_ENV" "$DRY_RUN" "$AUTO_APPROVE" "$target_resource"; then
                    exit 1
                fi
            else
                if ! build_lambdas; then
                    exit 1
                fi
                if ! run_terraform "$TARGET_ENV" "$DRY_RUN" "$AUTO_APPROVE"; then
                    exit 1
                fi
            fi
            ;;
        frontend)
            if ! build_frontend "$TARGET_ENV" "$TARGET_FRONTEND"; then
                exit 1
            fi
            if [[ "$DRY_RUN" != true ]]; then
                if ! deploy_s3 "$TARGET_ENV" "$TARGET_FRONTEND"; then
                    exit 1
                fi
                if ! invalidate_cf "$TARGET_ENV"; then
                    exit 1
                fi
            fi
            ;;
        all)
            # Full deployment
            if [[ -n "$TARGET_LAMBDA" ]]; then
                if ! build_lambdas "$TARGET_LAMBDA"; then
                    exit 1
                fi
                local target_resource
                if ! target_resource=$(get_terraform_target "$TARGET_LAMBDA"); then
                    exit 1
                fi
                log_info "Targeting Terraform resource: $target_resource"
                if ! run_terraform "$TARGET_ENV" "$DRY_RUN" "$AUTO_APPROVE" "$target_resource"; then
                    exit 1
                fi
            else
                if ! build_lambdas; then
                    exit 1
                fi
                if ! run_terraform "$TARGET_ENV" "$DRY_RUN" "$AUTO_APPROVE"; then
                    exit 1
                fi
            fi

            if [[ -n "$TARGET_FRONTEND" ]]; then
                if ! build_frontend "$TARGET_ENV" "$TARGET_FRONTEND"; then
                    exit 1
                fi
            else
                if ! build_frontend "$TARGET_ENV"; then
                    exit 1
                fi
            fi

            if [[ "$DRY_RUN" != true ]]; then
                if ! deploy_s3 "$TARGET_ENV" "$TARGET_FRONTEND"; then
                    exit 1
                fi
                if ! invalidate_cf "$TARGET_ENV"; then
                    exit 1
                fi
            fi

            # Astro SSG deployment (if --astro flag is set)
            if [[ "$DEPLOY_ASTRO" == true ]]; then
                if ! build_and_deploy_astro "$TARGET_ENV" "$DRY_RUN"; then
                    exit 1
                fi
            fi
            ;;
    esac

    # Show summary
    show_summary "$TARGET_ENV"
}

# ===========================================
# Script Entry Point
# ===========================================

# Show help if no arguments and stdin is terminal
if [[ $# -eq 0 ]] && [[ -t 0 ]]; then
    show_usage
    exit 0
fi

# Parse arguments
parse_args "$@"

# Run main
main
