#!/usr/bin/env bash
# Post-deploy verification for the public-facing security fixes that used to
# be checked by hand after each deploy:
#   - Issue #683: the public API and RSS feed no longer leak authorId /
#     contentMarkdown / a raw Cognito sub, and article JSON-LD attributes
#     authorship to the site Organization.
#   - Issue #680: the public and admin surfaces both carry a strict CSP
#     (script-src with no unsafe-inline, object-src/frame-ancestors/base-uri
#     locked down, and a tightly scoped connect-src) in at least one of the
#     enforced or Report-Only headers.
#
# Read-only: only GET requests are made. Never prints BASIC_AUTH.
#
# Usage: scripts/ci/verify-public-contract.sh <SITE_URL>
# Env:   BASIC_AUTH="user:pass" (optional) sent on every request; harmless on
#        /api/* even though that path is not behind basic auth on DEV
#        (terraform/modules/cdn/main.tf's /api/* behavior uses the api_path
#        CloudFront function, not the basic_auth one).

set -euo pipefail

SITE_URL="${1:?Usage: verify-public-contract.sh <SITE_URL>}"
SITE_URL="${SITE_URL%/}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PY="$SCRIPT_DIR/verify_public_contract.py"

CURL_OPTS=(-sS --max-time 30 --retry 3 --retry-delay 5 --retry-all-errors)
AUTH_OPTS=()
if [ -n "${BASIC_AUTH:-}" ]; then
  AUTH_OPTS=(-u "$BASIC_AUTH")
fi

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

FAILED=0

# Fetches a body into $2 and succeeds only on HTTP 200. Any other status
# (e.g. a basic-auth 401 page) must fail the run rather than be parsed as
# content: an error page trivially "contains no <author>".
fetch_url() {
  # $1 URL, $2 output file, $3 label
  local code
  code=$(curl "${CURL_OPTS[@]}" "${AUTH_OPTS[@]}" -o "$2" -w '%{http_code}' "$1" || echo "000")
  if [ "$code" != "200" ]; then
    echo "❌ $3 → HTTP ${code} (expected 200)"
    FAILED=1
    return 1
  fi
}

fetch_body() {
  # $1 path, $2 output file
  fetch_url "$SITE_URL$1" "$2" "GET $1"
}

fetch_headers() {
  # $1 path, $2 output file
  curl "${CURL_OPTS[@]}" "${AUTH_OPTS[@]}" -D "$2" -o /dev/null "$SITE_URL$1" || true
}

# Runs one of the python subcommands against a file and prints its output;
# a non-zero exit marks the whole run failed without aborting (set -e would
# stop at the first failing check otherwise).
run_check() {
  local infile="$1"
  shift
  if ! python3 "$PY" "$@" <"$infile" >"$WORKDIR/out"; then
    FAILED=1
  fi
  cat "$WORKDIR/out"
}

echo "========================================="
echo "Public contract verification against ${SITE_URL}"
echo "========================================="

echo ""
echo "--- Public API has no internal fields (#683) ---"
SLUG=""
if fetch_body "/api/posts?limit=5" "$WORKDIR/api-list.json"; then
  run_check "$WORKDIR/api-list.json" api-list --label "GET /api/posts"
  SLUG=$(tail -1 "$WORKDIR/out")
fi

if [ "$SLUG" != "__NO_SLUG__" ] && [ -n "$SLUG" ]; then
  if fetch_body "/api/posts/by-slug/${SLUG}" "$WORKDIR/by-slug.json"; then
    run_check "$WORKDIR/by-slug.json" api-object \
      --label "GET /api/posts/by-slug/${SLUG}"
  fi
fi

echo ""
echo "--- RSS has no per-item <author> (#683) ---"
ARTICLE_URL=""
if fetch_body "/rss.xml" "$WORKDIR/rss.xml"; then
  run_check "$WORKDIR/rss.xml" rss-no-author
  ARTICLE_URL=$(python3 "$PY" rss-first-article <"$WORKDIR/rss.xml")
fi

echo ""
echo "--- JSON-LD author is the site Organization (#683) ---"
if [ -z "$ARTICLE_URL" ]; then
  echo "⚠️ No article found in the RSS feed, skipping JSON-LD author check"
elif fetch_url "$ARTICLE_URL" "$WORKDIR/article.html" "GET ${ARTICLE_URL}"; then
  run_check "$WORKDIR/article.html" jsonld-author
fi

echo ""
echo "--- CSP is strict on public and admin (#680) ---"
fetch_headers "/" "$WORKDIR/public-headers.txt"
run_check "$WORKDIR/public-headers.txt" csp --page public

fetch_headers "/admin/" "$WORKDIR/admin-headers.txt"
run_check "$WORKDIR/admin-headers.txt" csp --page admin

echo ""
echo "========================================="
if [ "$FAILED" = "1" ]; then
  echo "❌ Public contract verification failed"
  exit 1
fi
echo "✓ Public contract verification passed"
echo "========================================="
