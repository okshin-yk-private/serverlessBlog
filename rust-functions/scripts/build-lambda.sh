#!/bin/bash
# build-lambda.sh - Build all Rust Lambda functions for ARM64

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUST_FUNCTIONS_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Lambda functions to build
FUNCTIONS=(
    "posts/create_post"
    "posts/get_post"
    "posts/get_public_post"
    "posts/list_posts"
    "posts/update_post"
    "posts/delete_post"
    "auth/login"
    "auth/logout"
    "auth/refresh"
    "images/get_upload_url"
    "images/delete_image"
)

echo -e "${YELLOW}Building Rust Lambda functions for ARM64...${NC}"
echo ""

# Check prerequisites
check_prereqs() {
    if ! command -v cargo-lambda &> /dev/null; then
        echo -e "${RED}Error: cargo-lambda is not installed${NC}"
        echo "Install with: cargo install cargo-lambda"
        exit 1
    fi

    if ! command -v zig &> /dev/null; then
        echo -e "${RED}Error: Zig is not installed${NC}"
        echo "Install with: brew install zig (macOS) or snap install zig (Linux)"
        exit 1
    fi

    # Check ARM64 target
    if ! rustup target list --installed 2>/dev/null | grep -q "aarch64-unknown-linux-musl"; then
        echo -e "${YELLOW}Installing aarch64-unknown-linux-musl target...${NC}"
        rustup target add aarch64-unknown-linux-musl
    fi
}

# Build a single function
build_function() {
    local func_path="$1"
    local func_name=$(basename "$func_path")

    echo -e "${YELLOW}Building ${func_name}...${NC}"

    cd "$RUST_FUNCTIONS_DIR"

    # Build with cargo-lambda
    if cargo lambda build --release --arm64 -p "$func_name" 2>&1; then
        echo -e "${GREEN}✓ ${func_name} built successfully${NC}"
        return 0
    else
        echo -e "${RED}✗ ${func_name} build failed${NC}"
        return 1
    fi
}

# Main build process
main() {
    check_prereqs

    cd "$RUST_FUNCTIONS_DIR"

    local failed=0
    local success=0

    for func in "${FUNCTIONS[@]}"; do
        if build_function "$func"; then
            ((success++))
        else
            ((failed++))
        fi
        echo ""
    done

    echo "========================================"
    echo -e "${GREEN}Successful: ${success}${NC}"
    if [ $failed -gt 0 ]; then
        echo -e "${RED}Failed: ${failed}${NC}"
    fi
    echo "========================================"

    # Show binary sizes
    echo ""
    echo "Binary sizes:"
    echo "----------------------------------------"
    for func in "${FUNCTIONS[@]}"; do
        local func_name=$(basename "$func")
        local binary="$RUST_FUNCTIONS_DIR/target/lambda/${func_name}/bootstrap"
        if [ -f "$binary" ]; then
            local size=$(du -h "$binary" | cut -f1)
            echo "  ${func_name}: ${size}"
        fi
    done
    echo "----------------------------------------"

    if [ $failed -gt 0 ]; then
        exit 1
    fi
}

main "$@"
