#!/bin/sh
# Decide how the pre-commit hook runs the pre-commit framework (Issue #693).
#
# Prints the command on stdout and exits 0 when one is available:
#   - `pre-commit` when installed (uv tool install pre-commit), else
#   - `uvx pre-commit@<pinned>` when uv is installed (no install step needed;
#     pinned so the hook never runs whatever PyPI serves that day).
# Otherwise it explains on stderr and exits:
#   1 when STRICT_LOCAL_CHECKS=1 (agents): the caller must fail the commit,
#   2 otherwise: the caller warns and skips, as before.
#
# Before this, a machine without pre-commit skipped terraform validate, trivy
# and gitleaks with a one-line warning and the commit still succeeded.

PRE_COMMIT_VERSION=4.6.2

if command -v pre-commit >/dev/null 2>&1; then
  echo "pre-commit"
  exit 0
fi
if command -v uvx >/dev/null 2>&1; then
  echo "uvx pre-commit@${PRE_COMMIT_VERSION}"
  exit 0
fi
if [ "${STRICT_LOCAL_CHECKS:-}" = "1" ]; then
  echo "✗ STRICT_LOCAL_CHECKS=1: terraform validate / trivy / gitleaks need pre-commit, but neither pre-commit nor uvx is on PATH. Install: uv tool install pre-commit" >&2
  exit 1
fi
echo "⚠ pre-commit not installed; terraform validate / trivy / gitleaks are skipped. Run: uv tool install pre-commit" >&2
exit 2
