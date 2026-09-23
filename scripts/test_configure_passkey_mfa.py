import unittest
from unittest.mock import patch
from configure_passkey_mfa import configure, check_plan, inspect_tier, check_sign_in

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

if __name__ == '__main__': unittest.main()
