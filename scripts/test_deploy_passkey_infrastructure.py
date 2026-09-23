"""Exercise deployment order with local Terraform/CLI fixtures; no AWS calls."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


class DeploymentOrderTest(unittest.TestCase):
    def run_deploy(self, environment='dev', unsafe=False, fail_bootstrap=False):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'scripts').mkdir()
            (root / 'bin').mkdir()
            for name in ('deploy_passkey_infrastructure.sh', 'configure_passkey_mfa.py'):
                shutil.copy(Path(__file__).parent / name, root / 'scripts' / name)
            wrapper = '''import json, os, subprocess, sys
from pathlib import Path
args = sys.argv[1:]
kind = Path(sys.argv[0]).name
with open(os.environ['CALL_LOG'], 'a') as log:
    log.write(json.dumps([kind, *args]) + '\\n')
if kind == 'python3':
    if '--require-production-mfa' in args and os.environ['FAIL_MFA_BOOTSTRAP'] == 'true':
        sys.exit(1)
    if '--check-plan' in args or '--check-sms-recovery-plan' in args:
        sys.exit(subprocess.call([os.environ['REAL_PYTHON'], *args]))
    print('false' if '--inspect-tier' in args else '{}')
elif 'show' in args:
    if args[-1].endswith('sms-recovery'):
        changes = [{'address': address, 'mode': 'managed', 'change': {'actions': ['create']}}
            for address in ('aws_iam_role.legacy_cognito_sms', 'aws_iam_role_policy.legacy_cognito_sms')]
        if os.environ['UNSAFE_PLAN'] == 'true':
            changes.append({'address': 'module.auth.aws_cognito_user_pool.main', 'change': {'actions': ['update']}})
    else:
        changes = [{'address': 'module.auth.aws_cognito_user_pool.main', 'change': {
            'actions': ['no-op'], 'before': {'mfa_configuration': 'ON'}, 'after': {'mfa_configuration': 'ON'}}}]
    print(json.dumps({'resource_changes': changes}))
'''
            for name in ('terraform', 'python3'):
                executable = root / 'bin' / name
                executable.write_text(f'#!{sys.executable}\n' + wrapper)
                executable.chmod(0o755)
            log = root / 'calls.jsonl'
            result = subprocess.run(['bash', str(root / 'scripts/deploy_passkey_infrastructure.sh'), environment],
                env={**os.environ, 'PATH': f'{root / "bin"}{os.pathsep}{os.environ["PATH"]}',
                     'REAL_PYTHON': sys.executable, 'CALL_LOG': str(log), 'UNSAFE_PLAN': str(unsafe).lower(),
                     'FAIL_MFA_BOOTSTRAP': str(fail_bootstrap).lower()},
                capture_output=True, text=True)
            return result, [json.loads(line) for line in log.read_text().splitlines()]

    def test_role_recovery_precedes_cognito_and_full_apply(self):
        result, calls = self.run_deploy()
        self.assertEqual(result.returncode, 0, result.stderr)
        applies = [i for i, call in enumerate(calls) if call[0] == 'terraform' and 'apply' in call]
        configuration = next(i for i, call in enumerate(calls) if call[0] == 'python3' and call[-2:] == ['--environment', 'dev'])
        self.assertEqual(len(applies), 2)
        self.assertLess(applies[0], configuration)
        self.assertLess(configuration, applies[1])
        self.assertTrue(calls[applies[0]][-1].endswith('sms-recovery'))
        self.assertIn('--check-only', calls[-1])

    def test_unsafe_recovery_plan_stops_before_any_apply_or_cognito_update(self):
        result, calls = self.run_deploy(unsafe=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any('apply' in call for call in calls))
        self.assertFalse(any(call[-2:] == ['--environment', 'dev'] for call in calls))

    def test_production_does_not_run_dev_sms_recovery(self):
        result, calls = self.run_deploy(environment='prd')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(any('sms-recovery' in ' '.join(call) for call in calls))
        self.assertEqual(sum(call[0] == 'terraform' and 'apply' in call for call in calls), 1)
        bootstrap = next(i for i, call in enumerate(calls) if '--require-production-mfa' in call)
        inspect = next(i for i, call in enumerate(calls) if '--inspect-tier' in call)
        self.assertLess(bootstrap, inspect)

    def test_production_bootstrap_failure_stops_before_terraform_and_passkeys(self):
        result, calls = self.run_deploy(environment='prd', fail_bootstrap=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(len(calls), 1)
        self.assertIn('--require-production-mfa', calls[0])


if __name__ == '__main__':
    unittest.main()
