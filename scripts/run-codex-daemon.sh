#!/usr/bin/env bash
#
# Codex Daemon Wrapper for Zellij
# Runs codex-review-daemon.sh in a loop with restart menu on exit
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

show_menu() {
    echo ""
    echo -e "${BOLD}╔═══════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║     Codex Daemon Session Ended        ║${NC}"
    echo -e "${BOLD}╠═══════════════════════════════════════╣${NC}"
    echo -e "${BOLD}║${NC}  ${GREEN}1${NC}) Restart Daemon                    ${BOLD}║${NC}"
    echo -e "${BOLD}║${NC}  ${GREEN}2${NC}) AWS SSO login, then restart       ${BOLD}║${NC}"
    echo -e "${BOLD}║${NC}  ${RED}q${NC}) Quit (close pane)                 ${BOLD}║${NC}"
    echo -e "${BOLD}╚═══════════════════════════════════════╝${NC}"
    echo ""
}

while true; do
    echo -e "${GREEN}Starting Codex Review Daemon...${NC}"
    echo ""

    # Run the daemon
    ./scripts/codex-review-daemon.sh
    exit_code=$?

    # Reset terminal state
    stty sane 2>/dev/null

    # Trap Ctrl+C in menu as quit
    trap 'echo ""; echo -e "${CYAN}Goodbye!${NC}"; exit 0' INT

    show_menu

    while true; do
        read -rp "Select [1-2/q]: " choice
        case "$choice" in
            1)
                echo -e "${CYAN}Restarting Codex Daemon...${NC}"
                break
                ;;
            2)
                echo -e "${CYAN}Running aws sso login...${NC}"
                aws sso login
                echo ""
                echo -e "${CYAN}Restarting Codex Daemon...${NC}"
                break
                ;;
            q|Q)
                echo -e "${CYAN}Goodbye!${NC}"
                exit 0
                ;;
            *)
                echo -e "${RED}Invalid choice. Please select 1, 2, or q.${NC}"
                ;;
        esac
    done

    # Remove Ctrl+C trap before restarting daemon
    trap - INT
    echo ""
done
