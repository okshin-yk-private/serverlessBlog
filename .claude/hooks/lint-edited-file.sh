#!/usr/bin/env bash
# PostToolUse hook: format and lint files Claude just edited.
#
# Rationale: closes the verification loop at edit time instead of at commit time
# (.husky/pre-commit) or CI. Mirrors what `bun run verify` checks for style:
#   - Prettier  -> every extension in the root `format` glob (ts,tsx,js,jsx,json,md).
#                  Prettier reads .prettierignore itself, so entries there (currently
#                  *.md) make this a no-op rather than something to special-case here.
#   - ESLint    -> .ts/.tsx only, run from the nearest directory owning a config,
#                  because the root config ignores frontend/** and frontend/admin
#                  carries its own.
# .astro/.go/terraform stay with pre-commit so this hook remains fast.
#
# Exit codes: 0 = clean (or not applicable), 2 = problems remain -> reported to Claude.

set -uo pipefail

payload=$(cat)
file=$(printf '%s' "$payload" | jq -r '.tool_input.file_path // empty')

# Not a file-editing tool call, or no path provided.
[ -z "$file" ] && exit 0
[ -f "$file" ] || exit 0

case "$file" in
  *.ts | *.tsx | *.js | *.jsx | *.json | *.md) ;;
  *) exit 0 ;;
esac

# Generated / vendored trees are excluded from both tools.
case "$file" in
  */node_modules/* | */cdk.out/* | */coverage/* | */dist/* | */.claude/worktrees/*) exit 0 ;;
esac

command -v bunx >/dev/null 2>&1 || exit 0

repo_root=$(cd "$(dirname "$0")/../.." && pwd)

# Prettier: config and ignore file live at the repo root, so run from there.
# Already-ignored files exit 0 without being touched.
prettier_out=$(cd "$repo_root" && bunx prettier --write --ignore-unknown "$file" 2>&1)
if [ $? -ne 0 ]; then
  echo "prettier could not format ${file}:" >&2
  echo "$prettier_out" >&2
  exit 2
fi

case "$file" in
  *.ts | *.tsx) ;;
  *) exit 0 ;;
esac

config_dir=""
dir=$(cd "$(dirname "$file")" && pwd)
while [ "$dir" != "/" ]; do
  if [ -f "$dir/eslint.config.js" ] || [ -f "$dir/eslint.config.mjs" ] || [ -f "$dir/eslint.config.ts" ]; then
    config_dir="$dir"
    break
  fi
  dir=$(dirname "$dir")
done
[ -z "$config_dir" ] && exit 0

eslint_out=$(cd "$config_dir" && bunx eslint --fix --no-warn-ignored "$file" 2>&1)
if [ $? -ne 0 ]; then
  echo "eslint reported unresolved problems in ${file}:" >&2
  echo "$eslint_out" >&2
  exit 2
fi

exit 0
