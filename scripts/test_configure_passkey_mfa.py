import unittest
import subprocess
from unittest.mock import patch
from configure_passkey_mfa import AwsCliError, aws as call_aws, configure, check_plan, check_sms_recovery_plan, inspect_tier, check_sign_in

class PasskeyConfigTest(unittest.TestCase):
    def current(self):
        return {'MfaConfiguration': 'ON', 'SoftwareTokenMfaConfiguration': {'Enabled': True}, 'WebAuthnConfiguration': {'RelyingPartyId': 'boneofmyfallacy.net', 'UserVerification': 'required'}, 'EmailMfaConfiguration': {'Subject': 'keep', 'Message': 'keep {####}'}}

    @patch('configure_passkey_mfa.aws')
    def test_preserves_other_mfa_and_verifies_readback(self, aws):
        config = self.current()
        expected = {**config, 'WebAuthnConfiguration': {**config['WebAuthnConfiguration'], 'FactorConfiguration': 'MULTI_FACTOR_WITH_USER_VERIFICATION'}}
        aws.side_effect = [{'Parameter': {'Value': 'pool'}}, config, {}, expected]
        self.assertEqual(configure('prd'), {'passkeys_enabled': True, 'mfa_required': True})
        request = aws.call_args_list[2].args[2]
        self.assertEqual(request, {**expected, 'UserPoolId': 'pool'})

    @patch('configure_passkey_mfa.aws')
    def test_preserves_sms_settings_after_role_recovery_and_checks_full_readback(self, aws):
        config = {**self.current(), 'SmsMfaConfiguration': {
            'SmsAuthenticationMessage': 'Your code is {####}',
            'SmsConfiguration': {'SnsCallerArn': 'arn:aws:iam::123456789012:role/legacy-sms', 'ExternalId': 'legacy-external-id'},
        }}
        expected = {**config, 'WebAuthnConfiguration': {
            **config['WebAuthnConfiguration'], 'FactorConfiguration': 'MULTI_FACTOR_WITH_USER_VERIFICATION',
        }}
        aws.side_effect = [{'Parameter': {'Value': 'pool'}}, config, {}, expected]
        configure('prd')
        request = aws.call_args_list[2].args[2]
        self.assertEqual(request['SmsMfaConfiguration'], config['SmsMfaConfiguration'])
        self.assertEqual(request['MfaConfiguration'], 'ON')
        self.assertEqual(request['SoftwareTokenMfaConfiguration'], {'Enabled': True})
        self.assertEqual(request['EmailMfaConfiguration'], config['EmailMfaConfiguration'])
        for actual in ({k: v for k, v in expected.items() if k != 'SmsMfaConfiguration'},
                       {**expected, 'SmsMfaConfiguration': {'SmsAuthenticationMessage': 'changed {####}'}}):
            with self.subTest(actual=actual):
                aws.reset_mock()
                aws.side_effect = [{'Parameter': {'Value': 'pool'}}, config, {}, actual]
                with self.assertRaisesRegex(RuntimeError, 'readback'):
                    configure('prd')

    @patch('configure_passkey_mfa.aws')
    def test_readback_failure_fails_deployment(self, aws):
        config = self.current()
        aws.side_effect = [{'Parameter': {'Value': 'pool'}}, config, {}, config]
        with self.assertRaisesRegex(RuntimeError, 'readback'): configure('prd')

    @patch('configure_passkey_mfa.aws')
    def test_prod_never_enables_passkeys_when_mfa_is_optional(self, aws):
        config = {**self.current(), 'MfaConfiguration': 'OPTIONAL'}
        aws.side_effect = [{'Parameter': {'Value': 'pool'}}, config]
        with self.assertRaisesRegex(RuntimeError, 'required'): configure('prd')
        self.assertEqual(aws.call_count, 2)

    @patch('configure_passkey_mfa.aws')
    def test_check_only_never_mutates_and_requires_correct_rp(self, aws):
        config = self.current(); config['WebAuthnConfiguration']['RelyingPartyId'] = 'wrong.example'
        aws.side_effect = [{'Parameter': {'Value': 'pool'}}, config]
        with self.assertRaisesRegex(RuntimeError, 'RP'): configure('prd', check_only=True)
        self.assertEqual(aws.call_count, 2)

    @patch('configure_passkey_mfa.aws')
    def test_unknown_environment_is_rejected_before_aws(self, aws):
        with self.assertRaises(ValueError): configure('unknown')
        aws.assert_not_called()

    @patch('configure_passkey_mfa.time.sleep')
    @patch('configure_passkey_mfa.aws')
    def test_new_dev_sms_role_propagation_is_retried_then_verified(self, aws, sleep):
        config = self.current()
        config.pop('WebAuthnConfiguration')
        expected = {**config, 'WebAuthnConfiguration': {'RelyingPartyId': 'dev.boneofmyfallacy.net', 'UserVerification': 'required', 'FactorConfiguration': 'MULTI_FACTOR_WITH_USER_VERIFICATION'}}
        error = AwsCliError('cognito-idp', 'set-user-pool-mfa-config', 254, 'InvalidSmsRoleTrustRelationshipException')
        aws.side_effect = [{'Parameter': {'Value': 'pool'}}, config, error, {}, expected]
        configure('dev')
        sleep.assert_called_once_with(1)
        self.assertEqual(aws.call_args_list[2], aws.call_args_list[3])

    @patch('configure_passkey_mfa.time.sleep')
    @patch('configure_passkey_mfa.aws')
    def test_persistent_sms_error_still_fails_and_other_errors_are_not_retried(self, aws, sleep):
        config = self.current()
        config.pop('WebAuthnConfiguration')
        for code, count in [('InvalidSmsRoleAccessPolicyException', 6), ('AccessDeniedException', 1)]:
            with self.subTest(code=code):
                aws.reset_mock(); sleep.reset_mock()
                error = AwsCliError('cognito-idp', 'set-user-pool-mfa-config', 254, code)
                aws.side_effect = [{'Parameter': {'Value': 'pool'}}, config] + [error] * count
                with self.assertRaises(AwsCliError): configure('dev')
                self.assertEqual(aws.call_count, 2 + count)
                self.assertEqual(sleep.call_count, count - 1)

class AwsErrorTest(unittest.TestCase):
    @patch('configure_passkey_mfa.subprocess.run')
    def test_service_error_reports_operation_and_code_without_sensitive_details(self, run):
        run.side_effect = subprocess.CalledProcessError(254, ['aws'], stderr=(
            'An error occurred (InvalidSmsRoleTrustRelationshipException) when calling the '
            'SetUserPoolMfaConfig operation: sensitive-server-message'))
        with self.assertRaises(RuntimeError) as caught:
            call_aws('cognito-idp', 'set-user-pool-mfa-config', {'secret': 'sensitive-payload'})
        message = str(caught.exception)
        self.assertIn('cognito-idp set-user-pool-mfa-config', message)
        self.assertIn('InvalidSmsRoleTrustRelationshipException', message)
        self.assertIn('254', message)
        self.assertNotIn('sensitive', message)

    @patch('configure_passkey_mfa.subprocess.run')
    def test_cli_validation_error_remains_sanitized_and_nonzero(self, run):
        run.side_effect = subprocess.CalledProcessError(252, ['aws'], stderr='Parameter validation failed: sensitive-payload')
        with self.assertRaises(RuntimeError) as caught:
            call_aws('cognito-idp', 'set-user-pool-mfa-config', {})
        self.assertIn('252', str(caught.exception))
        self.assertNotIn('sensitive', str(caught.exception))

    @patch('configure_passkey_mfa.subprocess.run')
    def test_cli_v2_enhanced_error_prefix_preserves_service_code(self, run):
        run.side_effect = subprocess.CalledProcessError(254, ['aws'], stderr=(
            'aws: [ERROR]: An error occurred (NoSuchEntity) when calling the GetRole operation: private-role-name'))
        with self.assertRaisesRegex(RuntimeError, 'NoSuchEntity') as caught:
            call_aws('iam', 'get-role', {'RoleName': 'private-role-name'})
        self.assertNotIn('private-role-name', str(caught.exception))

class PlanGateTest(unittest.TestCase):
    def plan(self, before=None, after=None, actions=None, unknown=None):
        return {'resource_changes': [{'address': 'module.auth.aws_cognito_user_pool.main', 'change': {'actions': actions or ['update'], 'before': before or {}, 'after': after or {}, 'after_unknown': unknown or {}}}]}

    def test_allows_policy_update_without_mfa_write(self):
        check_plan(self.plan({'mfa_configuration': 'ON'}, {'mfa_configuration': 'ON', 'sign_in_policy': ['WEB_AUTHN']}))

    def test_known_nested_blocks_do_not_count_as_unknown(self):
        check_plan(self.plan(unknown={'web_authn_configuration': [{}], 'software_token_mfa_configuration': [{}]}))
        with self.assertRaises(RuntimeError):
            check_plan(self.plan(unknown={'web_authn_configuration': [{'relying_party_id': True}]}))

    def test_rejects_every_mfa_write_trigger(self):
        from configure_passkey_mfa import MFA_FIELDS
        for field in MFA_FIELDS:
            with self.subTest(field=field), self.assertRaises(RuntimeError):
                check_plan(self.plan({field: 'old'}, {field: 'new'}))

    def test_rejects_unknown_and_replacement(self):
        with self.assertRaises(RuntimeError): check_plan(self.plan(unknown={'web_authn_configuration': True}))
        with self.assertRaises(RuntimeError): check_plan(self.plan(actions=['delete', 'create']))
        with self.assertRaises(RuntimeError): check_plan({})

    @patch('configure_passkey_mfa.aws')
    def test_bootstrap_refuses_optional_production_before_any_apply(self, aws):
        aws.side_effect = [{'Parameter': {'Value': 'pool'}}, {'UserPool': {'MfaConfiguration': 'OPTIONAL', 'UserPoolTier': 'LITE'}}]
        with self.assertRaisesRegex(RuntimeError, 'ON'): inspect_tier('prd')

    @patch('configure_passkey_mfa.aws')
    def test_activation_checks_pool_and_client(self, aws):
        aws.side_effect = [{'Parameter': {'Value': 'pool'}}, {'Parameter': {'Value': 'client'}}, {'UserPool': {'UserPoolTier': 'ESSENTIALS', 'Policies': {'SignInPolicy': {'AllowedFirstAuthFactors': ['PASSWORD', 'WEB_AUTHN']}}}}, {'UserPoolClient': {'ExplicitAuthFlows': ['ALLOW_USER_AUTH']}}]
        check_sign_in('prd')

class SmsRecoveryPlanTest(unittest.TestCase):
    def plan(self, actions):
        return {'resource_changes': [
            {'address': address, 'mode': 'managed', 'change': {'actions': actions}}
            for address in ('aws_iam_role.legacy_cognito_sms', 'aws_iam_role_policy.legacy_cognito_sms')
        ]}

    def test_allows_only_initial_creation_or_already_restored_resources(self):
        for actions in (['create'], ['no-op']):
            check_sms_recovery_plan(self.plan(actions))

    def test_rejects_role_edits_deletes_and_replacements(self):
        for actions in (['update'], ['delete'], ['delete', 'create']):
            with self.subTest(actions=actions), self.assertRaises(RuntimeError):
                check_sms_recovery_plan(self.plan(actions))

    def test_rejects_pool_updates_and_incomplete_targeting(self):
        plan = self.plan(['create'])
        plan['resource_changes'].append({'address': 'module.auth.aws_cognito_user_pool.main', 'change': {'actions': ['update']}})
        with self.assertRaises(RuntimeError): check_sms_recovery_plan(plan)
        with self.assertRaises(RuntimeError): check_sms_recovery_plan({'resource_changes': []})
        plan = self.plan(['create'])
        plan['resource_changes'].pop()
        with self.assertRaises(RuntimeError): check_sms_recovery_plan(plan)

if __name__ == '__main__': unittest.main()
