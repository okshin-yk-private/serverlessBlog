#!/bin/bash
# invoke-local.sh - Invoke a Lambda function locally with a test event

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUST_FUNCTIONS_DIR="$(dirname "$SCRIPT_DIR")"
EVENTS_DIR="$RUST_FUNCTIONS_DIR/events"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default values
FUNCTION_NAME="${1:-}"
EVENT_FILE="${2:-}"

print_usage() {
    echo -e "${CYAN}Usage: ./scripts/invoke-local.sh FUNCTION_NAME [EVENT_FILE]${NC}"
    echo ""
    echo "Arguments:"
    echo "  FUNCTION_NAME   Lambda function to invoke (required)"
    echo "  EVENT_FILE      Event JSON file (optional, defaults to events/{function_name}.json)"
    echo ""
    echo "Available functions and their default event files:"
    echo "  Posts:"
    echo "    create_post      → events/create_post.json"
    echo "    get_post         → events/get_post.json"
    echo "    get_public_post  → events/get_public_post.json"
    echo "    list_posts       → events/list_posts.json"
    echo "    update_post      → events/update_post.json"
    echo "    delete_post      → events/delete_post.json"
    echo ""
    echo "  Auth:"
    echo "    login            → events/login.json"
    echo "    logout           → events/logout.json"
    echo "    refresh          → events/refresh.json"
    echo ""
    echo "  Images:"
    echo "    get_upload_url   → events/get_upload_url.json"
    echo "    delete_image     → events/delete_image.json"
    echo ""
    echo "Examples:"
    echo "  ./scripts/invoke-local.sh create_post"
    echo "  ./scripts/invoke-local.sh login events/login.json"
    echo "  ./scripts/invoke-local.sh get_post events/custom_event.json"
}

# Check if help flag is passed
if [[ "$1" == "-h" ]] || [[ "$1" == "--help" ]]; then
    print_usage
    exit 0
fi

# Validate function name
if [ -z "$FUNCTION_NAME" ]; then
    echo -e "${RED}Error: FUNCTION_NAME is required${NC}"
    echo ""
    print_usage
    exit 1
fi

# Determine event file
if [ -z "$EVENT_FILE" ]; then
    EVENT_FILE="$EVENTS_DIR/${FUNCTION_NAME}.json"
fi

# Check if event file exists
if [ ! -f "$EVENT_FILE" ]; then
    echo -e "${RED}Error: Event file not found: ${EVENT_FILE}${NC}"
    echo ""
    echo "Available event files:"
    ls -1 "$EVENTS_DIR"/*.json 2>/dev/null | sed 's/^/  /'
    exit 1
fi

# Load environment variables from .env.local if it exists
ENV_FILE="$RUST_FUNCTIONS_DIR/.env.local"
if [ -f "$ENV_FILE" ]; then
    echo -e "${GREEN}Loading environment from .env.local${NC}"
    set -a
    source "$ENV_FILE"
    set +a
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
echo -e "${CYAN}Invoking Lambda Function${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "Function:    ${GREEN}${FUNCTION_NAME}${NC}"
echo -e "Event file:  ${GREEN}${EVENT_FILE}${NC}"
echo ""

# Invoke the function
echo -e "${YELLOW}Response:${NC}"
echo ""
cargo lambda invoke "$FUNCTION_NAME" --data-file "$EVENT_FILE"
