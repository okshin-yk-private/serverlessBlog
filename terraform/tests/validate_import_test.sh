#!/usr/bin/env bash
# Test script for validate-import.sh
# Requirements: 9.2 - Validates that the import validation script works correctly
#
# Usage:
#   ./tests/validate_import_test.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VALIDATE_SCRIPT="$PROJECT_ROOT/scripts/validate-import.sh"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

TESTS_PASSED=0
TESTS_FAILED=0

echo "=========================================="
echo " validate-import.sh Test Suite"
echo "=========================================="

# Test 1: Script exists
test_script_exists() {
    echo -e "\n${YELLOW}Test 1: Script exists${NC}"
    if [ -f "$VALIDATE_SCRIPT" ]; then
        echo -e "${GREEN}[PASS] validate-import.sh exists${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}[FAIL] validate-import.sh not found${NC}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# Test 2: Script is executable
test_script_executable() {
    echo -e "\n${YELLOW}Test 2: Script is executable${NC}"
    if [ -x "$VALIDATE_SCRIPT" ]; then
        echo -e "${GREEN}[PASS] validate-import.sh is executable${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}[FAIL] validate-import.sh is not executable${NC}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# Test 3: Bash syntax is valid
test_bash_syntax() {
    echo -e "\n${YELLOW}Test 3: Bash syntax is valid${NC}"
    if bash -n "$VALIDATE_SCRIPT" 2>/dev/null; then
        echo -e "${GREEN}[PASS] Bash syntax is valid${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}[FAIL] Bash syntax error in validate-import.sh${NC}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# Test 4: Contains required functions
test_required_functions() {
    echo -e "\n${YELLOW}Test 4: Contains required validation functions${NC}"
    local required_functions=(
        "check_prerequisites"
        "validate_dynamodb"
        "validate_s3"
        "validate_cognito"
        "validate_apigateway"
        "validate_lambda"
        "validate_cloudfront"
        "validate_terraform_state"
    )

    local all_found=true
    for func in "${required_functions[@]}"; do
        if grep -q "^$func()" "$VALIDATE_SCRIPT"; then
            echo -e "${GREEN}  [OK] Found function: $func${NC}"
        else
            echo -e "${RED}  [MISSING] Function not found: $func${NC}"
            all_found=false
        fi
    done

    if $all_found; then
        echo -e "${GREEN}[PASS] All required functions present${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}[FAIL] Missing required functions${NC}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# Test 5: Script uses strict mode
test_strict_mode() {
    echo -e "\n${YELLOW}Test 5: Script uses strict mode${NC}"
    if grep -q "set -euo pipefail" "$VALIDATE_SCRIPT"; then
        echo -e "${GREEN}[PASS] Script uses 'set -euo pipefail'${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}[FAIL] Script should use 'set -euo pipefail'${NC}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# Test 6: Script validates Lambda functions count
test_lambda_validation() {
    echo -e "\n${YELLOW}Test 6: Script validates all 11 Lambda functions${NC}"
    local lambda_count
    lambda_count=$(grep -c "blog-.*-go" "$VALIDATE_SCRIPT" || echo "0")
    if [ "$lambda_count" -ge 11 ]; then
        echo -e "${GREEN}[PASS] Script validates $lambda_count Lambda functions (expected: 11)${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}[FAIL] Script validates only $lambda_count Lambda functions (expected: 11)${NC}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# Test 7: Script validates S3 buckets
test_s3_validation() {
    echo -e "\n${YELLOW}Test 7: Script validates all 3 S3 buckets${NC}"
    local bucket_types=("images" "public-site" "admin-site")
    local all_found=true

    for bucket_type in "${bucket_types[@]}"; do
        if grep -q "serverless-blog-$bucket_type" "$VALIDATE_SCRIPT"; then
            echo -e "${GREEN}  [OK] Validates $bucket_type bucket${NC}"
        else
            echo -e "${RED}  [MISSING] Does not validate $bucket_type bucket${NC}"
            all_found=false
        fi
    done

    if $all_found; then
        echo -e "${GREEN}[PASS] Script validates all S3 bucket types${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}[FAIL] Missing S3 bucket validation${NC}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# Test 8: Script checks environment argument
test_environment_argument() {
    echo -e "\n${YELLOW}Test 8: Script accepts environment argument${NC}"
    if grep -q 'ENVIRONMENT="\${1:-dev}"' "$VALIDATE_SCRIPT"; then
        echo -e "${GREEN}[PASS] Script accepts environment argument with default 'dev'${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo -e "${RED}[FAIL] Script should accept environment argument${NC}"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# Run all tests
main() {
    test_script_exists
    test_script_executable
    test_bash_syntax
    test_required_functions
    test_strict_mode
    test_lambda_validation
    test_s3_validation
    test_environment_argument

    echo -e "\n=========================================="
    echo -e " Test Results"
    echo -e "=========================================="
    echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
    echo -e "${RED}Failed: $TESTS_FAILED${NC}"

    if [ "$TESTS_FAILED" -eq 0 ]; then
        echo -e "\n${GREEN}All tests passed!${NC}"
        exit 0
    else
        echo -e "\n${RED}Some tests failed!${NC}"
        exit 1
    fi
}

main
