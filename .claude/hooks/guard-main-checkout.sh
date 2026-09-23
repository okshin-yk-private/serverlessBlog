#!/usr/bin/env bash
# PreToolUse hook (Bash): ask before switching branches in the main checkout.
#
# Rationale (Issue #692): several sessions share the main checkout. A branch
# switch there changes the files under every other session working in it, so
# agents are expected to work in a worktree instead (docs/ai-shared-rules.md).
#
# This only asks; it never denies. The human may have a reason to switch the
# main checkout, and the check is a text heuristic, so the person decides.
#
# Treated as a branch switch: `git switch`, `git checkout <ref>`, `gh pr checkout`.
# Not treated as a branch switch: `git checkout -- <path>` (restoring files).
# Target directory: `git -C <dir>` when given, else a leading `cd <dir> &&`,
# else the session cwd.

set -uo pipefail

command -v jq >/dev/null 2>&1 || exit 0

payload=$(cat)
cmd=$(printf '%s' "$payload" | jq -r '.tool_input.command // empty')
cwd=$(printf '%s' "$payload" | jq -r '.cwd // empty')
[ -n "$cmd" ] || exit 0

git_re='(^|[;&|(]|[[:space:]])git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+'
switch_re="${git_re}switch([[:space:]]|\$)"
checkout_re="${git_re}checkout([[:space:]]|\$)"
# Pure file restores (`git checkout -- <path>`) do not move HEAD.
restore_re="${git_re}checkout[[:space:]]+(.*[[:space:]])?--([[:space:]]|\$)"
gh_checkout_re='(^|[;&|(]|[[:space:]])gh[[:space:]]+pr[[:space:]]+checkout([[:space:]]|$)'

if [[ $cmd =~ $switch_re ]] || [[ $cmd =~ $gh_checkout_re ]]; then
  :
elif [[ $cmd =~ $checkout_re ]] && ! [[ $cmd =~ $restore_re ]]; then
  :
else
  exit 0
fi

target=$cwd
if [[ $cmd =~ git[[:space:]]+-C[[:space:]]+([^[:space:]]+) ]]; then
  target=${BASH_REMATCH[1]}
elif [[ $cmd =~ ^[[:space:]]*cd[[:space:]]+([^[:space:]\;\&]+)[[:space:]]*\&\& ]]; then
  target=${BASH_REMATCH[1]}
fi
target=${target//\"/}
target=${target//\'/}
target=${target/#\~/$HOME}
case $target in
  /*) ;;
  *) target="$cwd/$target" ;;
esac
[ -d "$target" ] || exit 0

git_dir=$(git -C "$target" rev-parse --path-format=absolute --git-dir 2>/dev/null) || exit 0
common_dir=$(git -C "$target" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || exit 0
[ "$git_dir" = "$common_dir" ] || exit 0

top=$(git -C "$target" rev-parse --show-toplevel 2>/dev/null)
current=$(git -C "$target" branch --show-current 2>/dev/null)
reason="This switches branches in the main checkout (${top}, currently on ${current:-a detached HEAD}), which other sessions may be using. Prefer: git worktree add .claude/worktrees/<name> -b <branch> origin/develop. Approve only if switching the main checkout is intended."

jq -n --arg reason "$reason" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "ask",
    permissionDecisionReason: $reason
  }
}'
exit 0
