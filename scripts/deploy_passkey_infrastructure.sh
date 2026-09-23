#!/usr/bin/env bash
# Keep Cognito's required MFA intact while bootstrapping the new MFA factor.
# Run from the repository root after terraform init. Uses the existing AWS session.
set -euo pipefail
TARGET_ENV="${1:?Expected dev or prd}"
case "$TARGET_ENV" in dev|prd) ;; *) exit 1 ;; esac
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TF_DIR="$ROOT_DIR/terraform/environments/$TARGET_ENV"
HELPER="$ROOT_DIR/scripts/configure_passkey_mfa.py"
PLAN_DIR=$(mktemp -d)
trap 'rm -rf "$PLAN_DIR"' EXIT
apply_checked_plan() {
  terraform -chdir="$TF_DIR" plan "$@" -out="$PLAN_DIR/plan"
  terraform -chdir="$TF_DIR" show -json "$PLAN_DIR/plan" | python3 "$HELPER" --environment "$TARGET_ENV" --check-plan
  terraform -chdir="$TF_DIR" apply -auto-approve "$PLAN_DIR/plan"
}
if [ "$TARGET_ENV" = dev ]; then
  # Restore the imported pool's missing IAM prerequisite before either Cognito
  # API writes or UpdateUserPool. The gate rejects pool changes and IAM edits.
  terraform -chdir="$TF_DIR" plan \
    -target=aws_iam_role.legacy_cognito_sms \
    -target=aws_iam_role_policy.legacy_cognito_sms -out="$PLAN_DIR/sms-recovery"
  terraform -chdir="$TF_DIR" show -json "$PLAN_DIR/sms-recovery" | python3 "$HELPER" --environment "$TARGET_ENV" --check-sms-recovery-plan
  terraform -chdir="$TF_DIR" apply -auto-approve "$PLAN_DIR/sms-recovery"
fi
NEEDS_UPGRADE=$(python3 "$HELPER" --environment "$TARGET_ENV" --inspect-tier)
if [ "$NEEDS_UPGRADE" = true ]; then
  # Upgrade the tier before any WebAuthn setting, without exposing sign-in yet.
  apply_checked_plan -var='enable_passkeys=false'
fi
# Set the MFA factor BEFORE enabling WEB_AUTHN in the sign-in policy.
python3 "$HELPER" --environment "$TARGET_ENV"
apply_checked_plan
python3 "$HELPER" --environment "$TARGET_ENV" --check-only
