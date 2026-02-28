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

# AWS profiles available for SSO login
AWS_PROFILES=("dev" "admin")

show_aws_status() {
    echo -e "${CYAN}Checking AWS credentials...${NC}"
    if [[ -n "${AWS_PROFILE:-}" ]]; then
        echo -e "  AWS_PROFILE: ${GREEN}${AWS_PROFILE}${NC}"
    else
        echo -e "  AWS_PROFILE: ${YELLOW}(not set)${NC}"
    fi
    if aws sts get-caller-identity 2>/dev/null | jq -r '"  Account: \(.Account)  ARN: \(.Arn)"' 2>/dev/null; then
        echo -e "${GREEN}  AWS credentials: OK${NC}"
    else
        echo -e "${YELLOW}  AWS credentials: Not available (MCP servers may fail)${NC}"
    fi
    echo ""
}

select_aws_profile() {
    echo -e "${CYAN}Select AWS profile:${NC}"
    local i=1
    for p in "${AWS_PROFILES[@]}"; do
        echo -e "  ${GREEN}${i}${NC}) ${p}"
        ((i++))
    done
    echo ""
    while true; do
        read -rp "Select [1-${#AWS_PROFILES[@]}]: " prof_choice
        if [[ "$prof_choice" =~ ^[0-9]+$ ]] && (( prof_choice >= 1 && prof_choice <= ${#AWS_PROFILES[@]} )); then
            local selected="${AWS_PROFILES[$((prof_choice - 1))]}"
            export AWS_PROFILE="$selected"
            echo -e "${GREEN}AWS_PROFILE set to: ${selected}${NC}"
            return 0
        else
            echo -e "${RED}Invalid choice.${NC}"
        fi
    done
}

run_aws_sso_login() {
    select_aws_profile
    echo -e "${CYAN}Running aws sso login (profile: ${AWS_PROFILE})...${NC}"
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
    echo -e "${BOLD}║${NC}  ${GREEN}5${NC}) Restart in tmux (Agent Teams)    ${BOLD}║${NC}"
    echo -e "${BOLD}║${NC}  ${RED}q${NC}) Quit (close pane)                 ${BOLD}║${NC}"
    echo -e "${BOLD}╚═══════════════════════════════════════╝${NC}"
    echo ""
}

# Initial AWS credential check - offer login if not authenticated
show_aws_status
if ! aws sts get-caller-identity &>/dev/null; then
    echo -e "${YELLOW}AWS credentials not available. Login now?${NC}"
    echo -e "  ${GREEN}y${NC}) Yes, login with AWS SSO"
    echo -e "  ${GREEN}n${NC}) No, start Claude without AWS"
    echo ""
    read -rp "Select [y/n]: " init_choice
    case "$init_choice" in
        y|Y)
            run_aws_sso_login
            ;;
        *)
            echo -e "${YELLOW}Skipping AWS login. MCP servers requiring AWS may fail.${NC}"
            echo ""
            ;;
    esac
fi

while true; do
    # Show AWS status before launching Claude
    show_aws_status

    echo -e "${GREEN}Starting Claude...${NC}"
    echo ""

    # Enable Agent Teams experimental feature
    export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

    # Run Claude without trapping Ctrl+C (let Claude handle it)
    claude
    exit_code=$?

    # Reset terminal state after Claude exits
    stty sane 2>/dev/null

    # Trap Ctrl+C in menu as quit
    trap 'echo ""; echo -e "${CYAN}Goodbye!${NC}"; exit 0' INT

    show_menu

    while true; do
        read -rp "Select [1-5/q]: " choice
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
            5)
                if command -v tmux &>/dev/null; then
                    echo -e "${CYAN}Starting Claude in tmux session (Agent Teams split-pane mode)...${NC}"
                    tmux new-session -d -s claude-teams -c "$PROJECT_DIR" \
                        "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 claude" 2>/dev/null \
                        && tmux attach-session -t claude-teams \
                        || echo -e "${RED}Failed to create tmux session. It may already exist: tmux attach -t claude-teams${NC}"
                else
                    echo -e "${YELLOW}tmux is not installed. Install with: sudo apt install tmux${NC}"
                    echo -e "${YELLOW}Falling back to in-process mode (Agent Teams will still work).${NC}"
                    echo -e "${CYAN}Restarting Claude...${NC}"
                fi
                break
                ;;
            q|Q)
                echo -e "${CYAN}Goodbye!${NC}"
                exit 0
                ;;
            *)
                echo -e "${RED}Invalid choice. Please select 1-5 or q.${NC}"
                ;;
        esac
    done

    # Remove Ctrl+C trap before restarting Claude
    trap - INT
    echo ""
done
