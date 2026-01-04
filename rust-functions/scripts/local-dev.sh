#!/bin/bash
# local-dev.sh - Start cargo lambda watch with environment variables for local development

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUST_FUNCTIONS_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default function (can be overridden by first argument)
FUNCTION_NAME="${1:-create_post}"
PORT="${2:-9000}"

print_usage() {
    echo -e "${CYAN}Usage: ./scripts/local-dev.sh [FUNCTION_NAME] [PORT]${NC}"
    echo ""
    echo "Arguments:"
    echo "  FUNCTION_NAME   Lambda function to watch (default: create_post)"
    echo "  PORT            Port for the local server (default: 9000)"
    echo ""
    echo "Available functions:"
    echo "  Posts:    create_post, get_post, get_public_post, list_posts, update_post, delete_post"
    echo "  Auth:     login, logout, refresh"
    echo "  Images:   get_upload_url, delete_image"
    echo ""
    echo "Examples:"
    echo "  ./scripts/local-dev.sh create_post 9000"
    echo "  ./scripts/local-dev.sh login 9001"
    echo "  ./scripts/local-dev.sh list_posts"
}

# Check if help flag is passed
if [[ "$1" == "-h" ]] || [[ "$1" == "--help" ]]; then
    print_usage
    exit 0
fi

# Load environment variables from .env.local if it exists
ENV_FILE="$RUST_FUNCTIONS_DIR/.env.local"
if [ -f "$ENV_FILE" ]; then
    echo -e "${GREEN}Loading environment from .env.local${NC}"
    set -a
    source "$ENV_FILE"
    set +a
else
    echo -e "${YELLOW}Warning: .env.local not found. Using defaults.${NC}"
    echo "Create .env.local from the template for LocalStack integration."
fi

# Check prerequisites
if ! command -v cargo-lambda &> /dev/null; then
    echo -e "${RED}Error: cargo-lambda is not installed${NC}"
    echo "Install with: cargo install cargo-lambda"
    exit 1
fi

cd "$RUST_FUNCTIONS_DIR"

echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}Starting Rust Lambda Local Development${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "Function:    ${GREEN}${FUNCTION_NAME}${NC}"
echo -e "Port:        ${GREEN}${PORT}${NC}"
echo -e "Endpoint:    ${GREEN}http://localhost:${PORT}${NC}"
echo ""
echo -e "${YELLOW}Environment Variables:${NC}"
echo "  TABLE_NAME:        ${TABLE_NAME:-<not set>}"
echo "  BUCKET_NAME:       ${BUCKET_NAME:-<not set>}"
echo "  DYNAMODB_ENDPOINT: ${DYNAMODB_ENDPOINT:-<not set>}"
echo "  S3_ENDPOINT:       ${S3_ENDPOINT:-<not set>}"
echo "  COGNITO_ENDPOINT:  ${COGNITO_ENDPOINT:-<not set>}"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
echo ""

# Start cargo lambda watch
cargo lambda watch -p "$FUNCTION_NAME" --port "$PORT"
