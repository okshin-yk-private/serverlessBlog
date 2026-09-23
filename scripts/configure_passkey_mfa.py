"""Bootstrap/verify WebAuthn MFA configuration around Terraform apply.

AWS provider 6.x does not yet model FactorConfiguration. This explicitly scoped
operation is outside Terraform's plan; do not use update-user-pool (partial
updates can reset unrelated settings). No credentials or user data are printed.
"""
import argparse
import json
import re
import subprocess
import sys
import time

RP_IDS = {'dev': 'dev.boneofmyfallacy.net', 'prd': 'boneofmyfallacy.net'}
FACTOR = 'MULTI_FACTOR_WITH_USER_VERIFICATION'


class AwsCliError(RuntimeError):
    def __init__(self, service, operation, returncode, error_code):
        self.error_code = error_code
        reason = error_code or 'Check AWS CLI version, session and permissions'
        super().__init__(f'AWS CLI {service} {operation} failed (exit {returncode}): {reason}.')


def aws(service, operation, payload):
    try:
        result = subprocess.run(
            ['aws', service, operation, '--cli-input-json', json.dumps(payload), '--output', 'json', '--no-cli-pager'],
            check=True, capture_output=True, text=True,
        )
    except subprocess.CalledProcessError as exc:
        # Surface the AWS error code, never raw stderr or the JSON request.
        match = re.search(r'An error occurred \(([A-Za-z][A-Za-z0-9]{0,127})\) when calling ', exc.stderr or '')
        raise AwsCliError(service, operation, exc.returncode, match.group(1) if match else None) from None
    return json.loads(result.stdout) if result.stdout.strip() else {}


def configure(environment, check_only=False):
    if environment not in RP_IDS:
        raise ValueError('Unknown environment')
    pool = aws('ssm', 'get-parameter', {'Name': f'/serverless-blog/{environment}/cognito/user-pool-id'})['Parameter']['Value']
    current = aws('cognito-idp', 'get-user-pool-mfa-config', {'UserPoolId': pool})
    if environment == 'prd' and current.get('MfaConfiguration') != 'ON':
        raise RuntimeError('Production MFA must be required first (PR #687 rollout gate).')
    if current.get('MfaConfiguration') not in ('ON', 'OPTIONAL') or not current.get('SoftwareTokenMfaConfiguration', {}).get('Enabled'):
        raise RuntimeError('TOTP recovery must remain enabled.')
    webauthn = current.get('WebAuthnConfiguration', {})
    if webauthn.get('RelyingPartyId') not in (None, RP_IDS[environment]):
        raise RuntimeError('Existing RP ID differs; refusing to invalidate existing passkeys.')
    desired = {**webauthn, 'RelyingPartyId': RP_IDS[environment], 'UserVerification': 'required', 'FactorConfiguration': FACTOR}
    if not check_only:
        # Reject unknown fields instead of silently dropping future API settings.
        allowed = {'MfaConfiguration', 'SoftwareTokenMfaConfiguration', 'SmsMfaConfiguration', 'EmailMfaConfiguration', 'WebAuthnConfiguration'}
        if set(current) - allowed:
            raise RuntimeError('Unrecognized MFA fields; refusing to overwrite configuration.')
        # The deployment restores the missing DEV SMS role before this call.
        # Preserve every existing MFA setting and require exact full readback.
        for attempt in range(6):
            try:
                aws('cognito-idp', 'set-user-pool-mfa-config', {**current, 'UserPoolId': pool, 'WebAuthnConfiguration': desired})
                break
            except AwsCliError as exc:
                # Newly recreated IAM roles/policies can take time to propagate.
                # Only retry the two SMS dependency errors in DEV, at most 31s.
                if environment != 'dev' or exc.error_code not in ('InvalidSmsRoleTrustRelationshipException', 'InvalidSmsRoleAccessPolicyException') or attempt == 5:
                    raise
                print(f'Waiting for DEV SMS role propagation ({attempt + 1}/5).', file=sys.stderr)
                time.sleep(2 ** attempt)
        actual = aws('cognito-idp', 'get-user-pool-mfa-config', {'UserPoolId': pool})
    else:
        actual = current
    expected = {**current, 'WebAuthnConfiguration': desired}
    if actual != expected:
        raise RuntimeError('WebAuthn MFA readback did not match the required configuration.')
    return {'passkeys_enabled': True, 'mfa_required': actual['MfaConfiguration'] == 'ON'}


MFA_FIELDS = ('email_mfa_configuration', 'mfa_configuration', 'sms_authentication_message',
              'sms_configuration', 'software_token_mfa_configuration', 'web_authn_configuration')


def has_unknown(value):
    if isinstance(value, dict): return any(has_unknown(v) for v in value.values())
    if isinstance(value, list): return any(has_unknown(v) for v in value)
    return value is True


def check_plan(plan):
    pool_changes = [c for c in plan.get('resource_changes', []) if c.get('address') == 'module.auth.aws_cognito_user_pool.main']
    if len(pool_changes) != 1:
        raise RuntimeError('Expected exactly one existing auth User Pool in the full plan.')
    change = pool_changes[0]['change']
    if set(change.get('actions', [])) - {'no-op', 'update'}:
        raise RuntimeError('Creating/replacing/deleting the User Pool requires a separate migration.')
    before, after = change.get('before') or {}, change.get('after') or {}
    unknown = change.get('after_unknown') or {}
    if any(before.get(field) != after.get(field) or has_unknown(unknown.get(field)) for field in MFA_FIELDS):
        raise RuntimeError('Terraform would overwrite MFA configuration without FactorConfiguration; refusing apply.')


def check_sms_recovery_plan(plan):
    expected = {'aws_iam_role.legacy_cognito_sms', 'aws_iam_role_policy.legacy_cognito_sms'}
    seen = set()
    for resource in plan.get('resource_changes', []):
        change = resource['change']
        actions = change.get('actions', [])
        if resource.get('mode') == 'data' and actions in (['read'], ['no-op']):
            continue
        address = resource.get('address')
        if address not in expected or actions not in (['create'], ['no-op']):
            raise RuntimeError('SMS recovery may only create the two missing DEV IAM resources; refusing apply.')
        seen.add(address)
    if seen != expected:
        raise RuntimeError('Expected both DEV SMS recovery IAM resources in the targeted plan.')


def inspect_tier(environment):
    pool = aws('ssm', 'get-parameter', {'Name': f'/serverless-blog/{environment}/cognito/user-pool-id'})['Parameter']['Value']
    current = aws('cognito-idp', 'describe-user-pool', {'UserPoolId': pool})['UserPool']
    if environment == 'prd' and current.get('MfaConfiguration') != 'ON':
        raise RuntimeError('Production MFA must already be ON. Deploy PR #687 before passkey activation.')
    needs_upgrade = current.get('UserPoolTier', 'LITE') == 'LITE'
    if needs_upgrade and 'WEB_AUTHN' in current.get('Policies', {}).get('SignInPolicy', {}).get('AllowedFirstAuthFactors', []):
        raise RuntimeError('Unexpected existing WebAuthn policy; refusing bootstrap.')
    return needs_upgrade


def check_sign_in(environment):
    pool = aws('ssm', 'get-parameter', {'Name': f'/serverless-blog/{environment}/cognito/user-pool-id'})['Parameter']['Value']
    client = aws('ssm', 'get-parameter', {'Name': f'/serverless-blog/{environment}/cognito/user-pool-client-id'})['Parameter']['Value']
    config = aws('cognito-idp', 'describe-user-pool', {'UserPoolId': pool})['UserPool']
    flows = aws('cognito-idp', 'describe-user-pool-client', {'UserPoolId': pool, 'ClientId': client})['UserPoolClient']
    if config.get('UserPoolTier') not in ('ESSENTIALS', 'PLUS') or not {'PASSWORD', 'WEB_AUTHN'}.issubset(config.get('Policies', {}).get('SignInPolicy', {}).get('AllowedFirstAuthFactors', [])) or 'ALLOW_USER_AUTH' not in flows.get('ExplicitAuthFlows', []):
        raise RuntimeError('Passkey pool/client sign-in prerequisites are incomplete.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--environment', required=True, choices=RP_IDS)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument('--check-only', action='store_true')
    modes.add_argument('--inspect-tier', action='store_true')
    modes.add_argument('--check-plan', action='store_true')
    modes.add_argument('--check-sms-recovery-plan', action='store_true')
    args = parser.parse_args()
    try:
        if args.check_sms_recovery_plan:
            if args.environment != 'dev':
                raise RuntimeError('Legacy SMS role recovery is configured for DEV only.')
            check_sms_recovery_plan(json.load(sys.stdin))
        elif args.check_plan:
            check_plan(json.load(sys.stdin))
        elif args.inspect_tier:
            print('true' if inspect_tier(args.environment) else 'false')
        else:
            result = configure(args.environment, args.check_only)
            if args.check_only:
                check_sign_in(args.environment)
            print(json.dumps(result))
    except RuntimeError as exc:
        raise SystemExit(str(exc)) from None
