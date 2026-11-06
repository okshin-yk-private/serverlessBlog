import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
import unittest
import shutil
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("rotation", "scripts/rotate_dev_access.py")
rotation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rotation)


class RotationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.receipt = Path(self.temp.name) / "receipt.json"
        self.values = {"/basic-auth/username": "test-user", "/basic-auth/password": "old-test-value",
                       "/cdn/public-url": "https://dev.example.invalid", "/cdn/distribution-id": "TEST"}

    def prepare(self, probe=None):
        def aws(*args, payload=None):
            if args[:2] == ("ssm", "describe-parameters"):
                return {"Parameters": [{"Type": "SecureString", "KeyId": "alias/test-key", "Tier": "Advanced"}]}
            self.assertEqual(args, ("ssm", "put-parameter"))
            self.assertEqual(payload["Type"], "SecureString")
            self.assertEqual(payload["KeyId"], "alias/test-key")
            self.assertEqual(payload["Tier"], "Advanced")
            self.assertTrue(payload["Overwrite"])
            self.values["/basic-auth/password"] = payload["Value"]
            return {"Version": 2}
        with patch.object(rotation, "parameter", side_effect=lambda key: self.values[key]), \
             patch.object(rotation, "aws", side_effect=aws), \
             patch.object(rotation, "probe", side_effect=probe or (lambda *a: (200, ""))):
            rotation.prepare(self.receipt)

    def test_prepare_preserves_username_and_writes_private_receipt(self):
        self.prepare()
        data = json.loads(self.receipt.read_text())
        self.assertEqual(stat.S_IMODE(self.receipt.stat().st_mode), 0o600)
        self.assertEqual(data["old_password"], "old-test-value")
        self.assertNotEqual(data["new_password"], data["old_password"])
        self.assertGreaterEqual(len(data["new_password"]), 64)
        self.assertEqual(self.values["/basic-auth/password"], data["new_password"])
        self.assertEqual(self.values["/basic-auth/username"], "test-user")

    def test_drift_aborts_before_mutation_or_receipt(self):
        with self.assertRaises(rotation.RotationError):
            self.prepare(probe=lambda *a: (401, ""))
        self.assertFalse(self.receipt.exists())
        self.assertEqual(self.values["/basic-auth/password"], "old-test-value")

    def test_duplicate_prepare_does_not_overwrite_receipt(self):
        self.prepare()
        original = self.receipt.read_text()
        with self.assertRaises(rotation.RotationError):
            self.prepare()
        self.assertEqual(self.receipt.read_text(), original)

    def test_rejects_http_or_credential_bearing_url(self):
        for url in ("http://dev.example.invalid", "https://u:p@dev.example.invalid", "https://dev.example.invalid/path"):
            self.values["/cdn/public-url"] = url
            with self.assertRaises(rotation.RotationError):
                self.prepare()
        self.assertFalse(self.receipt.exists())

    def verify(self, leaked_cookie=False, new_status=200):
        self.prepare()
        data = json.loads(self.receipt.read_text())
        current_auth = rotation.authorization(data["username"], data["new_password"])
        current_cookie = "__Host-dev-access=" + rotation.cookie(data["username"], data["new_password"])
        seen = []
        def probe(url, headers):
            seen.append((url, headers))
            if headers.get("Authorization") == current_auth or headers.get("Cookie") == current_cookie:
                return new_status, current_cookie + "; Path=/; Secure; HttpOnly; SameSite=Strict"
            if leaked_cookie and "Cookie" in headers:
                return 200, ""
            return 401, ""
        with patch.object(rotation, "parameter", side_effect=lambda key: self.values[key]), \
             patch.object(rotation, "aws", return_value={}) as aws, \
             patch.object(rotation, "verify_other_credentials"), \
             patch.object(rotation, "probe", side_effect=probe), patch.object(rotation.time, "sleep"):
            rotation.verify(self.receipt)
        aws.assert_called_once_with("cloudfront", "wait", "distribution-deployed", "--id", "TEST", timeout=600)
        return seen

    def test_verify_tests_every_behavior_and_both_new_credential_types(self):
        seen = self.verify()
        for path in rotation.PROBE_PATHS:
            self.assertGreaterEqual(sum(url.endswith(path) for url, _ in seen), 3)

    def test_old_cookie_acceptance_fails_even_when_new_basic_works(self):
        with self.assertRaises(rotation.RotationError):
            self.verify(leaked_cookie=True)

    def test_outage_is_not_successful_revocation(self):
        with self.assertRaises(rotation.RotationError):
            self.verify(new_status=503)

    def test_context_rejects_wrong_ref_and_wrong_account(self):
        with patch.dict(os.environ, {"GITHUB_ACTIONS": "true", "GITHUB_REF": "refs/heads/main"}), \
             patch.object(rotation, "aws") as aws:
            with self.assertRaises(rotation.RotationError):
                rotation.context()
            aws.assert_not_called()
        with patch.dict(os.environ, {"GITHUB_ACTIONS": "true", "GITHUB_REF": "refs/heads/develop"}), \
             patch.object(rotation, "aws", return_value={"Account": "wrong"}):
            with self.assertRaises(rotation.RotationError):
                rotation.context()

    def test_aws_uses_private_input_file_cleans_it_and_suppresses_error_body(self):
        input_paths = []
        def run(command, **kwargs):
            self.assertNotIn("test-sensitive-value", " ".join(command))
            path = Path(command[command.index("--cli-input-json") + 1].removeprefix("file://"))
            self.assertNotEqual(str(path), "/dev/stdin")
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            self.assertEqual(json.loads(path.read_text()), {"Value": "test-sensitive-value"})
            input_paths.append(path)
            return subprocess.CompletedProcess([], 1, stdout="secret-response", stderr="(AccessDeniedException) secret-error")
        with patch.object(rotation.subprocess, "run", side_effect=run):
            with self.assertRaises(rotation.RotationError) as raised:
                rotation.aws("ssm", "put-parameter", payload={"Value": "test-sensitive-value"})
            self.assertIn("ssm/put-parameter failed (AccessDeniedException)", str(raised.exception))
            self.assertNotIn("secret-", str(raised.exception))
        self.assertTrue(input_paths)
        self.assertFalse(any(path.exists() for path in input_paths))

    def test_redirects_never_forward_credentials(self):
        self.assertIsNone(rotation.NoRedirect().redirect_request(None, None, 302, "", {}, "https://other.invalid"))

    def plan(self):
        return {"resource_changes": [
            {"address": rotation.E2E_PASSWORD, "change": {"actions": ["delete", "create"], "before": {"result": "old-e2e-value"}}},
            {"address": rotation.ORIGIN_KEY, "change": {"actions": ["delete", "create"], "before": {"id": "old-key-id"}}},
            {"address": rotation.ORIGIN_BINDING, "change": {"actions": ["delete", "create"]}},
            {"address": rotation.E2E_USER, "change": {"actions": ["update"], "before": {"username": "test-user", "user_pool_id": "test-pool"}}},
        ]}

    def test_capture_requires_expected_replacements_and_preserves_private_mode(self):
        self.prepare()
        with patch.object(rotation, "parameter", return_value="old-e2e-value"):
            rotation.capture_plan(self.receipt, self.plan())
        data = json.loads(self.receipt.read_text())
        self.assertEqual(data["old_api_key_id"], "old-key-id")
        self.assertEqual(stat.S_IMODE(self.receipt.stat().st_mode), 0o600)

    def test_capture_rejects_user_replacement_or_unrelated_deletion(self):
        self.prepare()
        for address in (rotation.E2E_USER, "module.database.aws_dynamodb_table.main"):
            plan = self.plan()
            plan["resource_changes"].append({"address": address, "change": {"actions": ["delete", "create"]}})
            with patch.object(rotation, "parameter", return_value="old-e2e-value"), self.assertRaises(rotation.RotationError):
                rotation.capture_plan(self.receipt, plan)

    def test_capture_rejects_noop_credentials(self):
        self.prepare()
        plan = self.plan()
        plan["resource_changes"][0]["change"]["actions"] = ["no-op"]
        with self.assertRaises(rotation.RotationError):
            rotation.capture_plan(self.receipt, plan)

    def test_deleted_key_and_changed_password_are_required_before_signout(self):
        data = {"old_api_key_id": "old-key-id", "old_e2e_password": "old-password", "user_pool_id": "pool", "e2e_username": "test-user"}
        for returncode, error, password, success in ((1, "(NotFoundException)", "new-password", True),
                (1, "(AccessDeniedException)", "new-password", False), (0, "", "new-password", False),
                (1, "(NotFoundException)", "old-password", False)):
            with patch.object(rotation.subprocess, "run", return_value=subprocess.CompletedProcess([], returncode, "", error)), \
                 patch.object(rotation, "parameter", return_value=password), patch.object(rotation, "aws") as aws:
                if success:
                    rotation.verify_other_credentials(data)
                    aws.assert_called_once()
                else:
                    with self.assertRaises(rotation.RotationError):
                        rotation.verify_other_credentials(data)
                    aws.assert_not_called()


class DeploymentOutputTests(unittest.TestCase):
    def run_helper(self, rotate=False, fail="", target="dev"):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "scripts/ci").mkdir(parents=True)
            (root / "terraform/environments/dev").mkdir(parents=True)
            (root / "bin").mkdir()
            for script in ("deploy_passkey_infrastructure.sh", "ci/check_backup_plan.py", "ci/summarize_plan.py"):
                shutil.copyfile(Path("scripts") / script, root / "scripts" / script)
            # Model the real guard's consumption of the entire JSON plan. An
            # early-exiting reader races the writer's flush on Linux (exit 120).
            (root / "scripts/configure_passkey_mfa.py").write_text(
                "import sys\n"
                "if '--inspect-tier' in sys.argv: print('false')\n"
                "if '--check-plan' in sys.argv or '--check-sms-recovery-plan' in sys.argv: sys.stdin.read()\n"
            )
            (root / "scripts/rotate_dev_access.py").write_text("import sys\nsys.stdin.read()\n")
            fake = root / "bin/terraform"
            fake.write_text('''#!/usr/bin/env python3
import json, os, sys
with open(os.environ['COMMAND_LOG'], 'a') as f: f.write(json.dumps(sys.argv[1:]) + '\\n')
operation = sys.argv[2]
if operation == 'show': print(json.dumps({'format_version':'1.2','resource_changes':[]}))
else:
 print('CANARY-UNMARKED-CREDENTIAL')
 if operation == os.environ.get('FAIL_OPERATION'): sys.exit(1)
''')
            fake.chmod(0o700)
            log = root / "commands"
            result = subprocess.run(["bash", str(root / "scripts/deploy_passkey_infrastructure.sh"), target],
                env={**os.environ, "PATH": str(root / "bin") + os.pathsep + os.environ["PATH"],
                     "ROTATE_DEV_ACCESS": str(rotate).lower(), "COMMAND_LOG": str(log), "FAIL_OPERATION": fail},
                capture_output=True, text=True)
            commands = [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []
            self.assertNotIn("CANARY-UNMARKED-CREDENTIAL", result.stdout + result.stderr)
            return result, commands

    def test_normal_deploy_suppresses_provider_values_and_does_not_rotate(self):
        result, commands = self.run_helper()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertFalse(any(arg.startswith('-replace=') for command in commands for arg in command))

    def test_rotation_replaces_only_credentials_in_final_plan(self):
        result, commands = self.run_helper(rotate=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        replaced = [command for command in commands if any(arg.startswith('-replace=') for arg in command)]
        self.assertEqual(len(replaced), 1)
        self.assertEqual({arg for arg in replaced[0] if arg.startswith('-replace=')},
                         {'-replace=' + rotation.E2E_PASSWORD, '-replace=' + rotation.ORIGIN_KEY})

    def test_failures_are_fatal_without_leaking_diagnostics(self):
        for operation in ("plan", "apply"):
            result, _ = self.run_helper(fail=operation)
            self.assertNotEqual(result.returncode, 0)

    def test_production_rotation_aborts_before_terraform(self):
        result, commands = self.run_helper(rotate=True, target="prd")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(commands, [])


if __name__ == "__main__":
    unittest.main()
