#!/usr/bin/env bash
# Verify that every Bun consumer uses the version pinned in setup-bun-deps (#694).
#
# CodeBuild installs a checksum-verified Bun release asset (#675), so its version
# and SHA256 live in terraform/modules/codebuild/main.tf and must move together
# with the CI version. With --online, the pinned SHA256 is also compared with the
# release's SHASUMS256.txt, which catches a version bump without a hash update.
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
action="$project_root/.github/actions/setup-bun-deps/action.yml"
codebuild="$project_root/terraform/modules/codebuild/main.tf"
online=false
[ "${1:-}" = "--online" ] && online=true

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

bun_version="$(sed -n "/bun-version:/,/default:/ s/.*default: *'\{0,1\}\([0-9][0-9.]*\)'\{0,1\}.*/\1/p" "$action" | head -n 1)"
[[ "$bun_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || \
  fail ".github/actions/setup-bun-deps/action.yml must default bun-version to X.Y.Z; found '${bun_version:-missing}'."

# Literal bun-version values in workflows and other actions. Expressions such as
# ${{ inputs.bun-version }} pass the pinned default through and are skipped.
while IFS= read -r match; do
  file="${match%%:*}"
  value="$(printf '%s' "$match" | sed -E "s/.*bun-version:[[:space:]]*['\"]?([^'\"[:space:]]*).*/\1/")"
  case "$value" in
    '' | '${{'*) continue ;;
  esac
  [ "$value" = "$bun_version" ] || \
    fail "${file#"$project_root"/} declares bun-version $value; setup-bun-deps pins $bun_version."
done < <(grep -rn --include='*.yml' --include='*.yaml' 'bun-version:' \
  "$project_root/.github/workflows" "$project_root/.github/actions" | grep -v "^$action:" || true)

codebuild_version="$(sed -n 's/^[[:space:]]*bun_version[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' "$codebuild")"
[ "$codebuild_version" = "$bun_version" ] || \
  fail "terraform/modules/codebuild/main.tf pins Bun ${codebuild_version:-missing}; setup-bun-deps pins $bun_version. Update bun_version and bun_linux_aarch64_sha256 together (hash from the release SHASUMS256.txt)."

codebuild_sha="$(sed -n 's/^[[:space:]]*bun_linux_aarch64_sha256[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' "$codebuild")"
[[ "$codebuild_sha" =~ ^[0-9a-f]{64}$ ]] || \
  fail "terraform/modules/codebuild/main.tf bun_linux_aarch64_sha256 must be 64 lowercase hex characters; found '${codebuild_sha:-missing}'."

if $online; then
  sums_url="https://github.com/oven-sh/bun/releases/download/bun-v${bun_version}/SHASUMS256.txt"
  published="$(curl -fsSL --proto '=https' --tlsv1.2 "$sums_url" | awk '$2 == "bun-linux-aarch64.zip" { print $1 }')" || \
    fail "could not read $sums_url"
  [ "$published" = "$codebuild_sha" ] || \
    fail "bun_linux_aarch64_sha256 ($codebuild_sha) does not match the published bun-linux-aarch64.zip hash for $bun_version (${published:-missing})."
fi

echo "Bun configuration is consistent: $bun_version (CodeBuild SHA256 ${codebuild_sha:0:12}…$($online && echo ', verified against SHASUMS256.txt'))"
