#!/usr/bin/env bash
# SessionStart hook: tell the agent how fresh its checkout is before it reads code.
#
# Rationale (Issue #692): a repository-wide review was once done on a local
# develop 108 commits behind origin, and four of its findings had already been
# fixed upstream. Separately, several sessions shared the main checkout and one
# switched branches under another. Nothing surfaced either condition.
#
# What it does: fetches the base branch (bounded by a timeout) and prints the
# checkout kind, branch, distance from origin/<base> and the other worktrees.
# SessionStart adds stdout to the session context.
#
# It must never block a session: every path exits 0, and a failed or slow fetch
# only changes the wording ("comparisons use the last fetched state").

set -uo pipefail

FETCH_TIMEOUT_SECONDS=${SESSION_CONTEXT_FETCH_TIMEOUT:-10}
MAX_WORKTREES_LISTED=10

payload=$(cat 2>/dev/null || true)
dir=""
if command -v jq >/dev/null 2>&1; then
  dir=$(printf '%s' "$payload" | jq -r '.cwd // empty' 2>/dev/null)
fi
[ -n "$dir" ] || dir=${CLAUDE_PROJECT_DIR:-$PWD}
cd "$dir" 2>/dev/null || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

export GIT_TERMINAL_PROMPT=0
if [ -z "${GIT_SSH_COMMAND:-}" ]; then
  export GIT_SSH_COMMAND="ssh -o BatchMode=yes"
fi

# Runs "$@" in the background and gives up after FETCH_TIMEOUT_SECONDS.
# Portable replacement for timeout(1), which macOS does not ship.
run_with_timeout() {
  "$@" >/dev/null 2>&1 &
  local pid=$!
  local ticks=0
  while kill -0 "$pid" 2>/dev/null; do
    if [ "$ticks" -ge $((FETCH_TIMEOUT_SECONDS * 10)) ]; then
      kill "$pid" 2>/dev/null
      wait "$pid" 2>/dev/null
      return 124
    fi
    sleep 0.1
    ticks=$((ticks + 1))
  done
  wait "$pid"
}

base=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null)
base=${base#origin/}
[ -n "$base" ] || base=develop

run_with_timeout git fetch --quiet --no-tags origin "$base"
case $? in
  0) fetch_note="fetched origin/$base just now" ;;
  124) fetch_note="fetch timed out after ${FETCH_TIMEOUT_SECONDS}s; comparisons use the last fetched state" ;;
  *) fetch_note="fetch failed; comparisons use the last fetched state" ;;
esac

branch=$(git branch --show-current 2>/dev/null)
[ -n "$branch" ] || branch="(detached at $(git rev-parse --short HEAD 2>/dev/null))"

# The upstream is fetched separately: after a PR merges its remote branch is
# usually deleted, and one missing ref must not cost the base branch update.
upstream=$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null)
if [ -n "$upstream" ] && [ "$upstream" != "origin/$base" ]; then
  run_with_timeout git fetch --quiet --no-tags origin "${upstream#origin/}"
fi

git_dir=$(git rev-parse --path-format=absolute --git-dir 2>/dev/null)
common_dir=$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
top=$(git rev-parse --show-toplevel 2>/dev/null)
is_main=false
[ "$git_dir" = "$common_dir" ] && is_main=true

echo "[checkout freshness] $fetch_note"
if $is_main; then
  echo "- checkout: main checkout ($top)"
else
  echo "- checkout: worktree ($top)"
fi
echo "- branch: $branch"

behind_base=0
if counts=$(git rev-list --left-right --count "HEAD...origin/$base" 2>/dev/null); then
  ahead_base=${counts%%[[:space:]]*}
  behind_base=${counts##*[[:space:]]}
  echo "- HEAD vs origin/$base: ahead $ahead_base, behind $behind_base"
else
  echo "- HEAD vs origin/$base: unknown (origin/$base not found)"
fi

if [ -n "$upstream" ] && [ "$upstream" != "origin/$base" ]; then
  if counts=$(git rev-list --left-right --count "HEAD...$upstream" 2>/dev/null); then
    echo "- HEAD vs $upstream: ahead ${counts%%[[:space:]]*}, behind ${counts##*[[:space:]]}"
  fi
fi

dirty=$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ')
echo "- uncommitted paths: $dirty"

others=$(git worktree list --porcelain 2>/dev/null | awk -v top="$top" '
  /^worktree / { path = substr($0, 10); ref = "" }
  /^branch / { ref = substr($0, 8); sub("refs/heads/", "", ref) }
  /^detached/ { ref = "(detached)" }
  /^prunable/ { ref = ref ", prunable" }
  /^$/ { if (path != "" && path != top) print path " [" ref "]"; path = "" }
  END { if (path != "" && path != top) print path " [" ref "]" }')
if [ -n "$others" ]; then
  total=$(printf '%s\n' "$others" | wc -l | tr -d ' ')
  echo "- other worktrees ($total):"
  printf '%s\n' "$others" | head -n "$MAX_WORKTREES_LISTED" | sed 's/^/  - /'
  if [ "$total" -gt "$MAX_WORKTREES_LISTED" ]; then
    echo "  - ... $((total - MAX_WORKTREES_LISTED)) more"
  fi
fi

# husky points core.hooksPath at a directory `bun install` creates (.husky/_). A
# fresh worktree lacks it until then, and git silently runs no hooks at all.
hooks_path=$(git config --get core.hooksPath 2>/dev/null)
hooks_missing=false
if [ -n "$hooks_path" ]; then
  case $hooks_path in
    /*) hooks_dir=$hooks_path ;;
    *) hooks_dir="$top/$hooks_path" ;;
  esac
  [ -d "$hooks_dir" ] || hooks_missing=true
fi

if [ "$behind_base" -gt 0 ] 2>/dev/null; then
  echo "WARNING: HEAD is $behind_base commits behind origin/$base. Before reviewing code or filing issues, read origin/$base (docs/ai-shared-rules.md, 'Checkout freshness and worktrees')."
fi
if $hooks_missing; then
  echo "WARNING: git hooks directory $hooks_path does not exist in this checkout, so commits run no pre-commit checks. Run 'bun install --frozen-lockfile' at the repository root first."
fi
if $is_main; then
  echo "NOTE: the main checkout may be shared with other sessions. Do the work in a worktree instead of switching branches here."
fi

exit 0
