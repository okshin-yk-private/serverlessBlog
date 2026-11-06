import importlib.util
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
import unittest
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

    def test_aws_passes_secret_on_stdin_and_suppresses_error_body(self):
        result = subprocess.CompletedProcess([], 1, stdout="secret-response", stderr="secret-error")
        with patch.object(rotation.subprocess, "run", return_value=result) as run:
            with self.assertRaises(rotation.RotationError) as raised:
                rotation.aws("ssm", "put-parameter", payload={"Value": "test-sensitive-value"})
            self.assertNotIn("test-sensitive-value", " ".join(run.call_args.args[0]))
            self.assertIn("test-sensitive-value", run.call_args.kwargs["input"])
            self.assertNotIn("secret-", str(raised.exception))

    def test_redirects_never_forward_credentials(self):
        self.assertIsNone(rotation.NoRedirect().redirect_request(None, None, 302, "", {}, "https://other.invalid"))


if __name__ == "__main__":
    unittest.main()
