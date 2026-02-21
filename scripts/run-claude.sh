#!/usr/bin/env bash
#
# Claude CLI Wrapper for Zellij
# Runs Claude in a loop with restart menu on exit
#
# Features:
#   - Restart Claude without restarting Zellij session
#   - Update Claude CLI before restart
#   - Refresh AWS SSO credentials (MCP servers cache at startup)
#   - Terminal state reset on exit
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

show_aws_status() {
    echo -e "${CYAN}Checking AWS credentials...${NC}"
    if aws sts get-caller-identity 2>/dev/null | jq -r '"  Account: \(.Account)  ARN: \(.Arn)"' 2>/dev/null; then
        echo -e "${GREEN}  AWS credentials: OK${NC}"
    else
        echo -e "${YELLOW}  AWS credentials: Not available (MCP servers may fail)${NC}"
    fi
    echo ""
}

run_aws_sso_login() {
    echo -e "${CYAN}Running aws sso login...${NC}"
    aws sso login
    echo ""
    show_aws_status
}

show_menu() {
    echo ""
    echo -e "${BOLD}╔═══════════════════════════════════════╗${NC}"
    echo -e "${BOLD}║       Claude Session Ended            ║${NC}"
    echo -e "${BOLD}╠═══════════════════════════════════════╣${NC}"
    echo -e "${BOLD}║${NC}  ${GREEN}1${NC}) Restart Claude                    ${BOLD}║${NC}"
    echo -e "${BOLD}║${NC}  ${GREEN}2${NC}) Update Claude, then restart       ${BOLD}║${NC}"
    echo -e "${BOLD}║${NC}  ${GREEN}3${NC}) AWS SSO login, then restart       ${BOLD}║${NC}"
    echo -e "${BOLD}║${NC}  ${GREEN}4${NC}) AWS SSO login only (back to menu) ${BOLD}║${NC}"
    echo -e "${BOLD}║${NC}  ${RED}q${NC}) Quit (close pane)                 ${BOLD}║${NC}"
    echo -e "${BOLD}╚═══════════════════════════════════════╝${NC}"
    echo ""
}

while true; do
    # Show AWS status before launching Claude
    show_aws_status

    echo -e "${GREEN}Starting Claude...${NC}"
    echo ""

    # Run Claude without trapping Ctrl+C (let Claude handle it)
    claude
    exit_code=$?

    # Reset terminal state after Claude exits
    stty sane 2>/dev/null

    # Trap Ctrl+C in menu as quit
    trap 'echo ""; echo -e "${CYAN}Goodbye!${NC}"; exit 0' INT

    show_menu

    while true; do
        read -rp "Select [1-4/q]: " choice
        case "$choice" in
            1)
                echo -e "${CYAN}Restarting Claude...${NC}"
                break
                ;;
            2)
                echo -e "${CYAN}Updating Claude...${NC}"
                claude update
                echo ""
                echo -e "${CYAN}Restarting Claude...${NC}"
                break
                ;;
            3)
                run_aws_sso_login
                echo -e "${CYAN}Restarting Claude (MCP servers will use new credentials)...${NC}"
                break
                ;;
            4)
                run_aws_sso_login
                show_menu
                ;;
            q|Q)
                echo -e "${CYAN}Goodbye!${NC}"
                exit 0
                ;;
            *)
                echo -e "${RED}Invalid choice. Please select 1-4 or q.${NC}"
                ;;
        esac
    done

    # Remove Ctrl+C trap before restarting Claude
    trap - INT
    echo ""
done
