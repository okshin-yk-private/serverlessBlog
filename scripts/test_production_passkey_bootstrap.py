"""Regression coverage for the one-time production MFA transition (no AWS calls)."""
import unittest
from unittest.mock import patch
from configure_passkey_mfa import AwsCliError, require_production_mfa


class ProductionMfaBootstrapTest(unittest.TestCase):
    def current(self):
        return {'MfaConfiguration': 'OPTIONAL', 'SoftwareTokenMfaConfiguration': {'Enabled': True},
                'SmsMfaConfiguration': {'SmsConfiguration': {'SnsCallerArn': 'arn:aws:iam::123456789012:role/existing-sms', 'ExternalId': 'preserve'}},
                'EmailMfaConfiguration': {'Subject': 'keep', 'Message': 'keep {####}'},
                'WebAuthnConfiguration': {'RelyingPartyId': 'boneofmyfallacy.net', 'UserVerification': 'required'}}

    def user(self, **changes):
        return {'Enabled': True, 'UserStatus': 'CONFIRMED',
                'UserMFASettingList': ['SOFTWARE_TOKEN_MFA'], 'PreferredMfaSetting': 'SOFTWARE_TOKEN_MFA', **changes}

    def initial(self, current):
        return [{'Parameter': {'Value': 'pool'}}, current,
                {'Role': {'Arn': current['SmsMfaConfiguration']['SmsConfiguration']['SnsCallerArn']}}]

    def assert_no_writes(self, aws):
        self.assertFalse(any(call.args[1] == 'set-user-pool-mfa-config' for call in aws.call_args_list))

    @patch('configure_passkey_mfa.aws')
    def test_optional_to_on_preserves_every_other_setting(self, aws):
        current = self.current()
        expected = {**current, 'MfaConfiguration': 'ON'}
        aws.side_effect = self.initial(current) + [{'Users': [{'Username': 'admin'}]}, self.user(), current, {}, expected]
        self.assertEqual(require_production_mfa('prd'), {'mfa_required': True, 'needs_update': False, 'checked_admins': 1})
        writes = [call for call in aws.call_args_list if call.args[1] == 'set-user-pool-mfa-config']
        self.assertEqual(len(writes), 1)
        self.assertEqual(writes[0].args[2], {**expected, 'UserPoolId': 'pool'})

    @patch('configure_passkey_mfa.aws')
    def test_already_required_is_read_only_and_does_not_recheck_enrollment(self, aws):
        aws.side_effect = [{'Parameter': {'Value': 'pool'}}, {**self.current(), 'MfaConfiguration': 'ON'}]
        self.assertEqual(require_production_mfa('prd'), {'mfa_required': True, 'needs_update': False})
        self.assertEqual(aws.call_count, 2)

    @patch('configure_passkey_mfa.aws')
    def test_readiness_mode_never_changes_settings(self, aws):
        current = self.current()
        aws.side_effect = self.initial(current) + [{'Users': [{'Username': 'admin'}]}, self.user()]
        self.assertEqual(require_production_mfa('prd', check_only=True), {'mfa_required': False, 'needs_update': True, 'checked_admins': 1})
        self.assert_no_writes(aws)

    @patch('configure_passkey_mfa.aws')
    def test_refuses_nonproduction_off_disabled_totp_unknown_fields_and_wrong_rp(self, aws):
        with self.assertRaises(RuntimeError): require_production_mfa('dev')
        aws.assert_not_called()
        for changes in ({'MfaConfiguration': 'OFF'}, {'SoftwareTokenMfaConfiguration': {'Enabled': False}},
                        {'Unexpected': {}}, {'WebAuthnConfiguration': {'RelyingPartyId': 'wrong.example'}}):
            with self.subTest(changes=changes):
                aws.reset_mock()
                aws.side_effect = [{'Parameter': {'Value': 'pool'}}, {**self.current(), **changes}]
                with self.assertRaises(RuntimeError): require_production_mfa('prd')
                self.assert_no_writes(aws)

    @patch('configure_passkey_mfa.aws')
    def test_refuses_unready_admins_before_changing_policy(self, aws):
        current = self.current()
        for user in (self.user(UserMFASettingList=[]), self.user(PreferredMfaSetting='SMS_MFA'),
                     self.user(UserStatus='FORCE_CHANGE_PASSWORD'), self.user(PreferredMfaSetting=None)):
            with self.subTest(user=user):
                aws.reset_mock()
                aws.side_effect = self.initial(current) + [{'Users': [{'Username': 'admin'}]}, user]
                with self.assertRaisesRegex(RuntimeError, 'Every enabled admin'): require_production_mfa('prd')
                self.assert_no_writes(aws)

    @patch('configure_passkey_mfa.aws')
    def test_all_pages_are_checked_and_unready_later_admin_blocks_write(self, aws):
        current = self.current()
        aws.side_effect = self.initial(current) + [
            {'Users': [{'Username': 'ready'}], 'NextToken': 'page2'}, self.user(),
            {'Users': [{'Username': 'unready'}]}, self.user(UserMFASettingList=[])]
        with self.assertRaises(RuntimeError): require_production_mfa('prd')
        pages = [call.args[2] for call in aws.call_args_list if call.args[1] == 'list-users-in-group']
        self.assertEqual(pages[1]['NextToken'], 'page2')
        self.assert_no_writes(aws)

    @patch('configure_passkey_mfa.aws')
    def test_repeated_pagination_token_stops(self, aws):
        current = self.current()
        aws.side_effect = self.initial(current) + [
            {'Users': [{'Username': 'ready'}], 'NextToken': 'repeat'}, self.user(),
            {'Users': [], 'NextToken': 'repeat'}]
        with self.assertRaisesRegex(RuntimeError, 'pagination'): require_production_mfa('prd')
        self.assert_no_writes(aws)

    @patch('configure_passkey_mfa.aws')
    def test_disabled_admins_do_not_count_and_at_least_one_ready_admin_is_required(self, aws):
        current = self.current()
        for pages in ([{'Users': []}], [{'Users': [{'Username': 'disabled'}]}, self.user(Enabled=False)]):
            with self.subTest(pages=pages):
                aws.reset_mock()
                aws.side_effect = self.initial(current) + pages
                with self.assertRaisesRegex(RuntimeError, 'At least one'): require_production_mfa('prd')
                self.assert_no_writes(aws)

    @patch('configure_passkey_mfa.aws')
    def test_missing_or_mismatched_sms_role_blocks_before_mfa_write(self, aws):
        current = self.current()
        for role in ({'Role': {'Arn': 'different-role'}}, AwsCliError('iam', 'get-role', 254, 'NoSuchEntity')):
            aws.reset_mock()
            aws.side_effect = self.initial(current)[:2] + [role]
            with self.assertRaises(RuntimeError): require_production_mfa('prd')
            self.assert_no_writes(aws)

    @patch('configure_passkey_mfa.aws')
    def test_changed_settings_during_user_checks_are_not_overwritten(self, aws):
        current = self.current()
        aws.side_effect = self.initial(current) + [{'Users': [{'Username': 'admin'}]}, self.user(), {**current, 'MfaConfiguration': 'ON'}]
        with self.assertRaisesRegex(RuntimeError, 'changed during'): require_production_mfa('prd')
        self.assert_no_writes(aws)

    @patch('configure_passkey_mfa.aws')
    def test_failed_or_partial_readback_stops_before_passkeys(self, aws):
        current = self.current()
        for actual in (current, {'MfaConfiguration': 'ON', 'SoftwareTokenMfaConfiguration': {'Enabled': True}}):
            aws.reset_mock()
            aws.side_effect = self.initial(current) + [{'Users': [{'Username': 'admin'}]}, self.user(), current, {}, actual]
            with self.assertRaisesRegex(RuntimeError, 'readback'): require_production_mfa('prd')
            self.assertEqual(sum(call.args[1] == 'set-user-pool-mfa-config' for call in aws.call_args_list), 1)


if __name__ == '__main__': unittest.main()
