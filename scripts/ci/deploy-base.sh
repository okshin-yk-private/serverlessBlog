#!/usr/bin/env bash
# Choose the base commit for deploy change detection (#740).
#
# Usage: deploy-base.sh <HEAD_SHA> <LAST_SUCCESS_SHA>
#
# LAST_SUCCESS_SHA is the head SHA of the last successful push-triggered Deploy
# run on the same branch (empty when there is none). Diffing from it, instead of
# the push's `before`, keeps changes from cancelled or failed deploys selected.
#
# Prints a base SHA for detect-changes.sh. All zeros means "compare against the
# empty tree", i.e. deploy every component. No network or AWS calls.
set -euo pipefail

HEAD_SHA="${1:?Expected head SHA}"
LAST_SUCCESS="${2-}"
DEPLOY_ALL=0000000000000000000000000000000000000000

git cat-file -e "$HEAD_SHA^{commit}"
if [ -z "$LAST_SUCCESS" ] || ! git cat-file -e "$LAST_SUCCESS^{commit}" 2>/dev/null; then
  echo "No usable successful deploy; deploying every component." >&2
  echo "$DEPLOY_ALL"
elif [ "$(git rev-parse "$LAST_SUCCESS")" = "$(git rev-parse "$HEAD_SHA")" ]; then
  echo "$LAST_SUCCESS"
elif git merge-base --is-ancestor "$HEAD_SHA" "$LAST_SUCCESS"; then
  # Re-running an old deploy would apply stale configuration over newer state.
  echo "$HEAD_SHA is older than the last successful deploy $LAST_SUCCESS; refusing to deploy it." >&2
  exit 1
elif git merge-base --is-ancestor "$LAST_SUCCESS" "$HEAD_SHA"; then
  echo "$LAST_SUCCESS"
else
  echo "Last successful deploy $LAST_SUCCESS is not an ancestor; deploying every component." >&2
  echo "$DEPLOY_ALL"
fi
