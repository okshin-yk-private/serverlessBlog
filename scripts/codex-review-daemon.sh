#!/usr/bin/env bash
#
# Codex Review Daemon
# Watches for new review requests and automatically executes them via Codex
#
# Usage: ./scripts/codex-review-daemon.sh
#

set -euo pipefail

# Configuration
REQUEST_DIR=".ai-context/requests"
RESPONSE_DIR=".ai-context/responses"
POLL_INTERVAL=2  # seconds
PROCESSED_FILE=".ai-context/.processed_requests"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Ensure directories exist
mkdir -p "$REQUEST_DIR" "$RESPONSE_DIR"
touch "$PROCESSED_FILE"

# Banner
echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║              Codex Review Daemon v1.0                     ║"
echo "║                                                           ║"
echo "║  Watching: $REQUEST_DIR                       ║"
echo "║  Output:   $RESPONSE_DIR                     ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

log_info() {
    echo -e "${BLUE}[$(date '+%H:%M:%S')]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[$(date '+%H:%M:%S')] ✓${NC} $1"
}

log_error() {
    echo -e "${RED}[$(date '+%H:%M:%S')] ✗${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[$(date '+%H:%M:%S')] ⚠${NC} $1"
}

# Send command to Claude Code pane via Zellij
send_to_claude() {
    local command="$1"

    # Switch to Claude pane (left pane in our layout)
    zellij action move-focus left 2>/dev/null || true

    # Longer delay to ensure pane switch completes
    sleep 0.5

    # Write the command
    zellij action write-chars "$command" 2>/dev/null || true

    # Small delay before Enter
    sleep 0.2

    # Send Enter key using ASCII code 13 (carriage return)
    zellij action write 13 2>/dev/null || true

    # Switch back to daemon pane (right)
    sleep 0.5
    zellij action move-focus right 2>/dev/null || true
}

# Check if request has been processed
is_processed() {
    local request_id="$1"
    grep -q "^${request_id}$" "$PROCESSED_FILE" 2>/dev/null
}

# Mark request as processed
mark_processed() {
    local request_id="$1"
    echo "$request_id" >> "$PROCESSED_FILE"
}

# Process a single review request
process_request() {
    local request_file="$1"
    local request_id
    local status
    local files_count
    local focus

    # Parse request
    request_id=$(jq -r '.id' "$request_file")
    status=$(jq -r '.status' "$request_file")
    files_count=$(jq -r '.request.files | length' "$request_file")
    focus=$(jq -r '.request.focus_areas | join(", ")' "$request_file")

    # Skip if already processed or not pending
    if is_processed "$request_id"; then
        return 0
    fi

    if [[ "$status" != "pending" ]]; then
        return 0
    fi

    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    log_info "New review request detected!"
    echo -e "  ${YELLOW}ID:${NC}    $request_id"
    echo -e "  ${YELLOW}Files:${NC} $files_count"
    echo -e "  ${YELLOW}Focus:${NC} $focus"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    log_info "Starting Codex review..."

    # Build the prompt for Codex
    local prompt="You are executing a code review request.

1. Read the review request at: $request_file
2. Review ALL files listed in the request with the specified focus areas
3. For each issue found, record: file, line, severity (HIGH/MEDIUM/LOW), category, description, recommendation
4. Create the response file at: $RESPONSE_DIR/${request_id}.json

Response JSON structure:
{
  \"id\": \"$request_id\",
  \"type\": \"code_review\",
  \"status\": \"completed\",
  \"request\": <copy from original>,
  \"response\": {
    \"completed_at\": \"<ISO timestamp>\",
    \"reviewer\": \"codex/<model>\",
    \"findings\": [
      {
        \"severity\": \"HIGH|MEDIUM|LOW\",
        \"file\": \"<path>\",
        \"line\": <number>,
        \"code_snippet\": \"<relevant code>\",
        \"issue\": \"<description>\",
        \"suggestion\": \"<recommendation>\",
        \"category\": \"security|performance|architecture|testing\"
      }
    ],
    \"summary\": \"<overall summary>\",
    \"approved\": <true|false>,
    \"specific_answers\": [
      {\"question\": \"<q>\", \"answer\": \"<a>\"}
    ]
  }
}

Execute this review thoroughly and save the results.

IMPORTANT: Output all issue descriptions, suggestions, and summary in Japanese (日本語).
Code snippets, file paths, and severity levels should remain in English."

    # Execute Codex
    if codex exec --full-auto "$prompt" 2>&1; then
        log_success "Review completed for $request_id"

        # Verify response was created
        if [[ -f "$RESPONSE_DIR/${request_id}.json" ]]; then
            log_success "Response saved to $RESPONSE_DIR/${request_id}.json"

            # Auto-send result command to Claude Code
            log_info "Sending result to Claude Code..."
            send_to_claude "/codex:result $request_id"
            log_success "Command sent to Claude Code pane"
        else
            log_warning "Response file not found, Codex may have saved it elsewhere"
        fi
    else
        log_error "Codex execution failed for $request_id"
    fi

    # Mark as processed
    mark_processed "$request_id"

    echo ""
    log_info "Waiting for next request..."
    echo ""
}

# Main loop
log_info "Daemon started. Polling every ${POLL_INTERVAL}s..."
echo ""

while true; do
    # Find all pending requests
    for request_file in "$REQUEST_DIR"/*.json; do
        # Skip if no files match
        [[ -e "$request_file" ]] || continue

        process_request "$request_file"
    done

    sleep "$POLL_INTERVAL"
done
