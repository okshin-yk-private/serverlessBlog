#!/usr/bin/env bash
# Check that this machine can run the repository's local checks (Issue #693).
#
# Usage: bun run doctor   (or scripts/doctor.sh)
# Exit 0 when every required tool is present at the expected version, 1 otherwise.
# Warnings (⚠) do not fail: they flag drift that may still work.
#
# Expected versions are read from the files CI uses, never duplicated here:
#   bun       .github/actions/setup-bun-deps/action.yml (default bun-version)
#   go        go-functions/go.mod (go directive)
#   terraform .github/workflows/ci.yml (TERRAFORM_VERSION, major.minor)

set -uo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
failures=0

ok() { echo "✓ $1"; }
warn() { echo "⚠ $1"; }
fail() {
  echo "✗ $1"
  failures=$((failures + 1))
}

require() { # name, install hint
  if command -v "$1" >/dev/null 2>&1; then
    ok "$1"
  else
    fail "$1 not found. $2"
  fi
}

expected_bun=$(sed -n "/bun-version:/,/default:/ s/.*default: *'\{0,1\}\([0-9][0-9.]*\)'\{0,1\}.*/\1/p" \
  "$repo_root/.github/actions/setup-bun-deps/action.yml" | head -n 1)
if command -v bun >/dev/null 2>&1; then
  actual_bun=$(bun --version 2>/dev/null)
  if [ "$actual_bun" = "$expected_bun" ]; then
    ok "bun $actual_bun"
  else
    fail "bun $actual_bun, but CI uses $expected_bun. Lockfile handling differs between versions."
  fi
else
  fail "bun not found (CI uses $expected_bun). https://bun.sh/docs/installation"
fi

expected_go=$(awk '$1 == "go" { print $2; exit }' "$repo_root/go-functions/go.mod")
if command -v go >/dev/null 2>&1; then
  # Run outside go-functions so GOTOOLCHAIN=auto does not download a toolchain here.
  actual_go=$(cd / && go env GOVERSION 2>/dev/null)
  actual_go=${actual_go#go}
  if [ "$actual_go" = "$expected_go" ]; then
    ok "go $actual_go"
  else
    warn "go $actual_go, but go-functions/go.mod requires $expected_go. GOTOOLCHAIN=auto may download it; 'make -C go-functions lint' fails on a patch mismatch."
  fi
else
  fail "go not found (go-functions/go.mod requires $expected_go)."
fi

expected_tf=$(sed -n "s/^ *TERRAFORM_VERSION: *'\{0,1\}\([0-9][0-9.]*\)'\{0,1\}.*/\1/p" \
  "$repo_root/.github/workflows/ci.yml" | head -n 1)
if command -v terraform >/dev/null 2>&1; then
  actual_tf=$(terraform version 2>/dev/null | sed -n '1s/^Terraform v\([0-9][0-9.]*\).*/\1/p')
  if [ "${actual_tf%.*}" = "${expected_tf%.*}" ]; then
    ok "terraform $actual_tf"
  else
    warn "terraform $actual_tf, but CI uses $expected_tf."
  fi
else
  fail "terraform not found (CI uses $expected_tf)."
fi

if pre_commit=$("$repo_root/.husky/scripts/resolve-pre-commit.sh" 2>/dev/null); then
  ok "pre-commit via '$pre_commit'"
else
  fail "pre-commit unavailable: terraform validate / trivy / gitleaks are skipped at commit. Install: uv tool install pre-commit"
fi

require trivy "Needed by the trivy pre-commit hook. https://trivy.dev"
require terraform-docs "Needed by the terraform_docs pre-commit hook. https://terraform-docs.io"
require jq "Needed by the Claude Code hooks in .claude/hooks."
require gh "Needed by the GitHub skills (issues, PRs)."
require python3 "Needed by tests/config and scripts/ci."

if [ "$failures" -gt 0 ]; then
  echo ""
  echo "$failures required check(s) failed."
  exit 1
fi
exit 0
