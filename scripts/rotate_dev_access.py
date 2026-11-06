#!/usr/bin/env python3
"""Rotate the DEV gate through Deploy; never print credentials or HTTP bodies.

The receipt stays on the runner until the always-run cleanup step. A failed apply
must be recovered by deploying the NEW SSM value, never restoring an exposed one.
"""

import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

PREFIX = "/serverless-blog/dev"
DEV_ACCOUNT = "881302602065"
PROBE_PATHS = ("/", "/admin/", "/api/posts", "/images/__rotation_check__", "/_astro/__rotation_check__")


class RotationError(Exception):
    """Only fixed, non-secret diagnostics may reach the workflow log."""


def require(condition, message):
    if not condition:
        raise RotationError(message)


def aws(*args, payload=None, timeout=60):
    command = ["aws", *args, "--output", "json", "--no-cli-pager"]
    if payload is not None:
        command += ["--cli-input-json", "file:///dev/stdin"]
    try:
        result = subprocess.run(command, input=None if payload is None else json.dumps(payload),
                                text=True, capture_output=True, timeout=timeout, check=False)
        require(result.returncode == 0, "AWS operation failed; response suppressed to protect credentials")
        return json.loads(result.stdout or "{}")
    except (OSError, subprocess.TimeoutExpired, ValueError) as error:
        raise RotationError("AWS operation failed; details suppressed") from error


def parameter(suffix):
    return aws("ssm", "get-parameter", "--name", PREFIX + suffix, "--with-decryption")["Parameter"]["Value"]


def authorization(username, password):
    return "Basic " + base64.b64encode(f"{username}:{password}".encode()).decode()


def cookie(username, password):
    return hashlib.sha256(f"dev-cookie:{username}:{password}".encode()).hexdigest()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def probe(url, headers):
    # Do not forward credentials to a redirect target, or print response bodies.
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=15) as response:
            return response.status, response.headers.get("Set-Cookie", "")
    except urllib.error.HTTPError as error:
        return error.code, ""
    except (urllib.error.URLError, TimeoutError, OSError):
        return 0, ""


def context():
    require(os.environ.get("GITHUB_ACTIONS") == "true" and
            os.environ.get("GITHUB_REF") == "refs/heads/develop",
            "Rotation is restricted to the develop GitHub Actions workflow")
    require(aws("sts", "get-caller-identity")["Account"] == DEV_ACCOUNT, "Unexpected AWS account")
    return Path(os.environ["RUNNER_TEMP"]) / "dev-access-rotation.json"


def prepare(receipt):
    require(not receipt.exists(), "Rotation receipt already exists; do not rotate twice in one job")
    username = parameter("/basic-auth/username")
    password = parameter("/basic-auth/password")
    url = parameter("/cdn/public-url").rstrip("/")
    parsed = urllib.parse.urlsplit(url)
    require(parsed.scheme == "https" and parsed.hostname and not parsed.username and
            not parsed.password and parsed.path == "" and not parsed.query and not parsed.fragment,
            "Unexpected DEV public URL")
    require(username and password, "DEV credentials are empty")
    metadata = aws("ssm", "describe-parameters", "--parameter-filters",
                   "Key=Name,Option=Equals,Values=" + PREFIX + "/basic-auth/password")["Parameters"]
    require(len(metadata) == 1 and metadata[0].get("Type") == "SecureString" and
            metadata[0].get("KeyId") and metadata[0].get("Tier") in ("Standard", "Advanced"),
            "Cannot safely preserve the existing SSM encryption key and tier")
    require(probe(url + "/admin/", {"Authorization": authorization(username, password)})[0] == 200,
            "Current SSM credentials do not authenticate; resolve drift before rotating")
    new_password = secrets.token_urlsafe(48)
    data = {"username": username, "old_password": password, "new_password": new_password,
            "url": url, "distribution": parameter("/cdn/distribution-id")}
    # Create before the mutation so failure handling can still verify/recover.
    fd = os.open(receipt, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as stream:
        json.dump(data, stream)
    aws("ssm", "put-parameter", payload={"Name": PREFIX + "/basic-auth/password",
        "Value": new_password, "Type": "SecureString", "Overwrite": True,
        "KeyId": metadata[0]["KeyId"], "Tier": metadata[0]["Tier"]})
    require(parameter("/basic-auth/password") == new_password, "SSM password readback mismatch")
    print("DEV password updated in SSM; edge invalidation is NOT complete until verification passes")


def verify(receipt):
    data = json.loads(receipt.read_text())
    require(parameter("/basic-auth/password") == data["new_password"], "SSM password changed during deployment")
    require(parameter("/basic-auth/username") == data["username"], "SSM username changed during deployment")
    aws("cloudfront", "wait", "distribution-deployed", "--id", data["distribution"], timeout=600)
    old_basic = {"Authorization": authorization(data["username"], data["old_password"])}
    old_cookie = {"Cookie": "__Host-dev-access=" + cookie(data["username"], data["old_password"])}
    new_basic = {"Authorization": authorization(data["username"], data["new_password"])}
    expected_cookie = "__Host-dev-access=" + cookie(data["username"], data["new_password"])
    # Edge propagation can lag publication. All negative and positive probes must
    # pass in the SAME attempt. 401 from an origin alone is not proof of the gate.
    for attempt in range(12):
        rejected = all(probe(data["url"] + path, headers)[0] == 401
                       for path in PROBE_PATHS for headers in ({}, old_basic, old_cookie))
        home_status, _ = probe(data["url"] + "/", new_basic)
        admin_status, issued_cookie = probe(data["url"] + "/admin/", new_basic)
        cookie_status, _ = probe(data["url"] + "/admin/", {"Cookie": expected_cookie})
        if rejected and home_status == admin_status == cookie_status == 200 and expected_cookie in [part.strip() for part in issued_cookie.split(";")]:
            print("DEV rotation verified: distribution Deployed; old Basic/cookie rejected; new Basic/cookie accepted")
            return
        if attempt < 11:
            time.sleep(5)
    raise RotationError("DEV rotation verification failed; deploy the current SSM value and investigate, never restore exposed credentials")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=("prepare", "verify", "cleanup"))
    operation = parser.parse_args().operation
    if operation == "cleanup":
        (Path(os.environ["RUNNER_TEMP"]) / "dev-access-rotation.json").unlink(missing_ok=True)
        return
    receipt = context()
    (prepare if operation == "prepare" else verify)(receipt)


if __name__ == "__main__":
    try:
        main()
    except RotationError as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
    except Exception:
        # SDK/JSON/key errors may carry a response containing credentials.
        print("Rotation failed; details suppressed to protect credentials", file=sys.stderr)
        sys.exit(1)
