#!/usr/bin/env bash
# terraform-test-targets.sh
#
# `terraform test` only discovers tests in the CURRENT module's tests/
# directory — it does not recurse into submodules or nested directories.
# That means a single `terraform test` invocation at the repo root (or at
# any one module root) never runs the tests that live under other module
# directories. This script discovers every directory that actually has
# runnable tests so CI (and local hooks) can loop over them explicitly.
#
# Usage:
#   terraform-test-targets.sh                       # all targets
#   terraform-test-targets.sh --changed <BASE_REF>   # only affected targets
#   terraform-test-targets.sh [--changed <BASE_REF>] --json
#   terraform-test-targets.sh -h|--help
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: terraform-test-targets.sh [--changed <BASE_REF>] [--json]

Lists Terraform directories (repo-relative, under terraform/) that contain
at least one non-empty tests/*.tftest.hcl file. `terraform test` does not
recurse, so each listed directory needs its own `terraform test` run.

Options:
  --changed <BASE_REF>  Only print targets affected by
                         `git diff --name-only <BASE_REF>...HEAD`.
                         If a changed path under terraform/ does not
                         clearly belong to exactly one target, ALL targets
                         are printed (safety over speed).
  --json                Emit a compact JSON array of strings instead of
                         newline-separated output.
  -h, --help             Show this help text.

With no options, all discovered targets are printed.
EOF
}

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

JSON=false
CHANGED_MODE=false
BASE_REF=""

while [ $# -gt 0 ]; do
  case "$1" in
    --json)
      JSON=true
      shift
      ;;
    --changed)
      CHANGED_MODE=true
      if [ $# -lt 2 ]; then
        echo "✗ --changed requires a BASE_REF argument" >&2
        exit 1
      fi
      BASE_REF="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "✗ Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# Discover all targets: directories D under terraform/ such that D/tests/
# contains at least one non-empty *.tftest.hcl file.
# ---------------------------------------------------------------------------
TARGETS=""
while IFS= read -r tests_dir; do
  # tests_dir is e.g. "terraform/modules/api/tests" (repo-relative, no
  # trailing slash, from `find`).
  has_nonempty=false
  while IFS= read -r f; do
    [ -n "$f" ] && has_nonempty=true && break
  done < <(find "$tests_dir" -maxdepth 1 -type f -name '*.tftest.hcl' -size +0c 2>/dev/null)

  if [ "$has_nonempty" = true ]; then
    target_dir="${tests_dir%/tests}"
    TARGETS="${TARGETS}${target_dir}"$'\n'
  fi
done < <(cd "$REPO_ROOT" && find terraform -type d -name tests -not -path '*/.terraform/*' | sort)

ALL_TARGETS="$(printf '%s' "$TARGETS" | grep -v '^$' | sort -u)"

# ---------------------------------------------------------------------------
# --changed filtering
# ---------------------------------------------------------------------------
print_targets() {
  # $1: newline-separated list of targets
  local list="$1"
  if [ "$JSON" = true ]; then
    if [ -z "$list" ]; then
      echo "[]"
      return
    fi
    local out="["
    local first=true
    while IFS= read -r t; do
      [ -z "$t" ] && continue
      if [ "$first" = true ]; then
        first=false
      else
        out="${out},"
      fi
      out="${out}\"${t}\""
    done <<EOF
$list
EOF
    out="${out}]"
    echo "$out"
  else
    if [ -n "$list" ]; then
      printf '%s\n' "$list"
    fi
  fi
}

if [ "$CHANGED_MODE" = false ]; then
  print_targets "$ALL_TARGETS"
  exit 0
fi

cd "$REPO_ROOT"

CHANGED_PATHS="$(git diff --name-only "${BASE_REF}...HEAD" -- . 2>/dev/null || true)"

# Nothing changed under terraform/ at all -> empty output.
TERRAFORM_CHANGED="$(printf '%s\n' "$CHANGED_PATHS" | grep '^terraform/' || true)"
if [ -z "$TERRAFORM_CHANGED" ]; then
  print_targets ""
  exit 0
fi

FALLBACK=false
MATCHED=""

while IFS= read -r path; do
  [ -z "$path" ] && continue

  best_target=""
  best_len=-1
  while IFS= read -r t; do
    [ -z "$t" ] && continue
    # A target matches if path == t or path starts with "t/".
    if [ "$path" = "$t" ] || case "$path" in "$t"/*) true ;; *) false ;; esac; then
      len=${#t}
      if [ "$len" -gt "$best_len" ]; then
        best_len=$len
        best_target=$t
      fi
    fi
  done <<EOF
$ALL_TARGETS
EOF

  if [ -z "$best_target" ]; then
    # A terraform/ path that matches no target at all -> fall back to ALL.
    FALLBACK=true
    break
  fi

  if [ "$best_target" = "terraform" ]; then
    # Root target matched. The root's own recognized subtree is its tests/
    # dir (that's literally what makes "terraform" a discovered target).
    # A path outside terraform/tests/ that still falls through to root here
    # means it's either a top-level root .tf file (e.g. terraform/versions.tf
    # - foundational, so err on the side of running everything) or lives in
    # some other subdir that isn't itself a target (e.g. a new module
    # without tests) -> fall back to ALL in both cases.
    case "$path" in
      terraform/tests/*) : ;;
      *)
        FALLBACK=true
        break
        ;;
    esac
  fi

  MATCHED="${MATCHED}${best_target}"$'\n'
done <<EOF
$TERRAFORM_CHANGED
EOF

if [ "$FALLBACK" = true ]; then
  print_targets "$ALL_TARGETS"
  exit 0
fi

MATCHED_SORTED="$(printf '%s' "$MATCHED" | grep -v '^$' | sort -u)"
print_targets "$MATCHED_SORTED"
