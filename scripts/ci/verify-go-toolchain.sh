#!/usr/bin/env bash
# Verify that every Go toolchain consumer derives its version from go.mod.
# This is intentionally dependency-free so it can run before setup-go.
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
go_mod="$project_root/go-functions/go.mod"
lint_version_file="$project_root/go-functions/.golangci-version"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

go_version="$(awk '$1 == "go" { print $2; exit }' "$go_mod")"
[[ "$go_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || \
  fail "go-functions/go.mod must pin a complete Go patch version; found '${go_version:-missing}'."

lint_version="$(tr -d '[:space:]' < "$lint_version_file")"
[[ "$lint_version" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || \
  fail "go-functions/.golangci-version must contain a complete vX.Y.Z version; found '${lint_version:-missing}'."

for workflow in ci.yml deploy.yml security-scan.yml nightly.yml; do
  workflow_path="$project_root/.github/workflows/$workflow"
  grep -Fq 'go-version-file: go-functions/go.mod' "$workflow_path" || \
    fail "$workflow must use go-functions/go.mod as its Go version source."
  if grep -Eq '^[[:space:]]*(GO_VERSION:|go-version:)' "$workflow_path"; then
    fail "$workflow contains an independent Go version declaration."
  fi
done

grep -Fq 'GO_MODULE_FILE="$PROJECT_ROOT/go-functions/go.mod"' "$project_root/scripts/local-deploy.sh" || \
  fail "scripts/local-deploy.sh must derive its Go version from go-functions/go.mod."
grep -Fq "version: $lint_version" "$project_root/.github/workflows/ci.yml" || \
  fail "ci.yml golangci-lint version must match go-functions/.golangci-version ($lint_version)."

echo "Go toolchain configuration is consistent: Go $go_version, golangci-lint $lint_version"
