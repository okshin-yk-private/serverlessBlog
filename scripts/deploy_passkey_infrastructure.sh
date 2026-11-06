#!/usr/bin/env bash
# Keep Cognito's required MFA intact while bootstrapping the new MFA factor.
# Run from the repository root after terraform init. Uses the existing AWS session.
set -euo pipefail
TARGET_ENV="${1:?Expected dev or prd}"
case "$TARGET_ENV" in dev|prd) ;; *) exit 1 ;; esac
ROTATION_ARGS=()
if [ "${ROTATE_DEV_ACCESS:-false}" = true ]; then
  if [ "$TARGET_ENV" != dev ]; then
    echo "Credential rotation is restricted to DEV"
    exit 1
  fi
  ROTATION_ARGS=(
    '-replace=module.auth.random_password.e2e_admin[0]'
    '-replace=module.api.aws_api_gateway_api_key.cloudfront[0]'
  )
fi
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TF_DIR="$ROOT_DIR/terraform/environments/$TARGET_ENV"
HELPER="$ROOT_DIR/scripts/configure_passkey_mfa.py"
# Wait for another holder of the shared state lock (for example a merge-queue CI
# plan) instead of failing immediately (#738).
LOCK_TIMEOUT="-lock-timeout=10m"
PLAN_DIR=$(mktemp -d)
trap 'rm -rf "$PLAN_DIR"' EXIT
# Some provider attributes (notably usage_plan_key.value) lack Sensitive even
# though they hold credentials. Never publish human-readable plan/apply output.
terraform_private() {
  if ! terraform -chdir="$TF_DIR" "$@" >"$PLAN_DIR/terraform.log" 2>&1; then
    echo "Terraform operation failed; raw diagnostics are not published"
    return 1
  fi
}
apply_checked_plan() {
  terraform_private plan "$LOCK_TIMEOUT" "$@" -out="$PLAN_DIR/plan"
  terraform -chdir="$TF_DIR" show -json "$PLAN_DIR/plan" 2>"$PLAN_DIR/show.log" | python3 "$ROOT_DIR/scripts/ci/check_backup_plan.py"
  terraform -chdir="$TF_DIR" show -json "$PLAN_DIR/plan" 2>"$PLAN_DIR/show.log" | python3 "$HELPER" --environment "$TARGET_ENV" --check-plan
  if [ "${CAPTURE_ROTATION_PLAN:-false}" = true ]; then
    terraform -chdir="$TF_DIR" show -json "$PLAN_DIR/plan" 2>"$PLAN_DIR/show.log" | python3 "$ROOT_DIR/scripts/rotate_dev_access.py" capture-plan
  fi
  terraform -chdir="$TF_DIR" show -json "$PLAN_DIR/plan" 2>"$PLAN_DIR/show.log" | python3 "$ROOT_DIR/scripts/ci/summarize_plan.py"
  terraform_private apply "$LOCK_TIMEOUT" -auto-approve "$PLAN_DIR/plan"
  echo "Terraform apply completed"
}
if [ "$TARGET_ENV" = dev ]; then
  # Restore the imported pool's missing IAM prerequisite before either Cognito
  # API writes or UpdateUserPool. The gate rejects pool changes and IAM edits.
  terraform_private plan "$LOCK_TIMEOUT" \
    -target=aws_iam_role.legacy_cognito_sms \
    -target=aws_iam_role_policy.legacy_cognito_sms -out="$PLAN_DIR/sms-recovery"
  terraform -chdir="$TF_DIR" show -json "$PLAN_DIR/sms-recovery" 2>"$PLAN_DIR/show.log" | python3 "$HELPER" --environment "$TARGET_ENV" --check-sms-recovery-plan
  terraform_private apply "$LOCK_TIMEOUT" -auto-approve "$PLAN_DIR/sms-recovery"
fi
if [ "$TARGET_ENV" = prd ]; then
  # Bootstrap only OPTIONAL -> ON after verifying every enabled admin's TOTP.
  # This readback must succeed before tier upgrades or passkey configuration.
  python3 "$HELPER" --environment prd --require-production-mfa
fi
NEEDS_UPGRADE=$(python3 "$HELPER" --environment "$TARGET_ENV" --inspect-tier)
if [ "$NEEDS_UPGRADE" = true ]; then
  # Upgrade the tier before any WebAuthn setting, without exposing sign-in yet.
  apply_checked_plan -var='enable_passkeys=false'
fi
# Set the MFA factor BEFORE enabling WEB_AUTHN in the sign-in policy.
python3 "$HELPER" --environment "$TARGET_ENV"
if [ "${ROTATE_DEV_ACCESS:-false}" = true ]; then
  CAPTURE_ROTATION_PLAN=true apply_checked_plan "${ROTATION_ARGS[@]}"
else
  apply_checked_plan
fi
python3 "$HELPER" --environment "$TARGET_ENV" --check-only
