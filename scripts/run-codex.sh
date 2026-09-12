#!/usr/bin/env bash
# Start in the repository root even when invoked from the enclosing workspace.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BLOG_REPO_ROOT="$(dirname "$SCRIPT_DIR")"
exec codex --cd "$BLOG_REPO_ROOT" "$@"
