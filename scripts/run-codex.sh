#!/usr/bin/env bash
# Start in the repository root even when invoked from the enclosing workspace.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BLOG_REPO_ROOT="$(dirname "$SCRIPT_DIR")"
# Agents fail commits instead of skipping security checks when pre-commit is missing
# (.husky/scripts/resolve-pre-commit.sh). Humans keep the warn-and-skip default.
export STRICT_LOCAL_CHECKS=1
exec codex --cd "$BLOG_REPO_ROOT" "$@"
