#!/usr/bin/env bash
# Emit component flags from a complete Git event range. No network or AWS calls.
set -euo pipefail

MODE="${1:?Expected ci or deploy}"
BASE="${2:?Expected base SHA}"
HEAD_SHA="${3:?Expected head SHA}"
case "$MODE" in ci|deploy) ;; *) echo "Unknown mode: $MODE" >&2; exit 1 ;; esac
git cat-file -e "$HEAD_SHA^{commit}"
if [[ "$BASE" =~ ^0+$ ]]; then
  # First push of a branch: compare against the empty tree.
  BASE=$(git hash-object -t tree /dev/null)
else
  # A missing base must fail, never silently select no work.
  git cat-file -e "$BASE^{commit}"
  if [ "$MODE" = ci ]; then
    BASE=$(git merge-base "$BASE" "$HEAD_SHA")
  fi
fi

CHANGED_PATHS=$(mktemp)
trap 'rm -f "$CHANGED_PATHS"' EXIT
# Disable rename detection so both the removed and added paths select work.
# NUL delimiters preserve spaces and newlines in filenames.
git diff --no-renames --name-only -z "$BASE" "$HEAD_SHA" -- > "$CHANGED_PATHS"
ASTRO=false
ADMIN=false
INFRASTRUCTURE=false
DEPLOY_SCRIPTS=false
while IFS= read -r -d '' CHANGED_PATH; do
  case "$CHANGED_PATH" in
    scripts/configure_passkey_mfa.py|scripts/deploy_passkey_infrastructure.sh) INFRASTRUCTURE=true; ADMIN=true ;;
    terraform/*|go-functions/*) INFRASTRUCTURE=true ;;
    frontend/public-astro/*) ASTRO=true ;;
    frontend/admin/*) ADMIN=true ;;
    frontend/shared-ui/*|package.json|bun.lock|bunfig.toml|tsconfig*.json)
      ASTRO=true; ADMIN=true ;;
    scripts/deploy/*) ASTRO=true; DEPLOY_SCRIPTS=true ;;
  esac
  if [ "$MODE" = ci ]; then
    case "$CHANGED_PATH" in
      playwright.config.ts|tests/e2e/specs/home.spec.ts|tests/e2e/specs/article.spec.ts|tests/e2e/specs/editorial.spec.ts)
        ASTRO=true ;;
      playwright.admin.config.ts|playwright.passkey.config.ts|tests/e2e/passkeys/*|tests/e2e/specs/admin-*)
        ADMIN=true ;;
      tests/e2e/*|playwright.aws.config.ts|.github/workflows/ci.yml|.github/actions/setup-bun-deps/*|scripts/ci/*|tests/config/*|.prettierrc*|.prettierignore)
        ASTRO=true; ADMIN=true ;;
    esac
  fi
done < "$CHANGED_PATHS"

printf 'astro=%s\nadmin=%s\ninfrastructure=%s\ndeploy-scripts=%s\n' \
  "$ASTRO" "$ADMIN" "$INFRASTRUCTURE" "$DEPLOY_SCRIPTS"
