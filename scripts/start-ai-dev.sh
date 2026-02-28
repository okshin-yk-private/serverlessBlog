#!/usr/bin/env bash
#
# Start AI Development Environment
# Launches Zellij with Claude Code and Codex Review Daemon side by side
#
# Usage: ./scripts/start-ai-dev.sh
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LAYOUT_FILE="$PROJECT_DIR/.zellij/layouts/claude-codex.kdl"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║           AI Development Environment                      ║"
echo "║                                                           ║"
echo "║   Claude Code  ←→  Codex Review Daemon                    ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check dependencies
check_dependency() {
    if ! command -v "$1" &> /dev/null; then
        echo -e "${RED}Error: $1 is not installed${NC}"
        exit 1
    fi
}

check_dependency "zellij"
check_dependency "claude"
check_dependency "codex"
check_dependency "jq"

# Ensure directories exist
mkdir -p "$PROJECT_DIR/.ai-context/requests"
mkdir -p "$PROJECT_DIR/.ai-context/responses"

# Check if layout exists
if [[ ! -f "$LAYOUT_FILE" ]]; then
    echo -e "${RED}Error: Layout file not found: $LAYOUT_FILE${NC}"
    exit 1
fi

# Change to project directory
cd "$PROJECT_DIR"

echo -e "${GREEN}Starting Zellij with AI development layout...${NC}"
echo ""
echo "Layout: $LAYOUT_FILE"
echo ""
echo "Keybindings:"
echo "  Ctrl+p → n    : Switch to next pane"
echo "  Ctrl+p → p    : Switch to previous pane"
echo "  Ctrl+p → d    : Detach session"
echo "  Ctrl+p → q    : Quit"
echo ""
echo "Tips:"
echo "  - Claude 終了後にメニューで再起動/更新/AWS認証更新が可能"
echo "  - Codex Daemon も同様に個別再起動が可能"
echo "  - Shell タブで手動操作（aws sso login 等）も可能"
echo ""

# Start Zellij with the layout
exec zellij --layout "$LAYOUT_FILE"
