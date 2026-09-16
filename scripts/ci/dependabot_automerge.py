"""Fail-closed Dependabot policy/controller. Standard library only; never runs PR code."""

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


BOT_ID = 49699333
WORKFLOWS = {
    "ci.yml": "All CI Checks Passed",
    "security-scan.yml": "Security Scan Summary",
    "dependency-update-security.yml": "Dependency Update Security Gate",
}
GROUPS = {
    "bun": [
        {f"{prefix}{name}" for name in ("package.json", "bun.lock")}
        for prefix in ("", "frontend/admin/", "frontend/public-astro/", "scripts/deploy/")
    ],
    "gomod": [{"go-functions/go.mod", "go-functions/go.sum"}],
}


class Blocked(Exception):
    """A normal policy/readiness rejection; never implies permission to merge."""


def require(condition, reason):
    if not condition:
        raise Blocked(reason)


def dependencies(message):
    # Deliberately parse only Dependabot's plain scalar metadata subset, not arbitrary
    # YAML. Unexpected schema, anchors, folded values and duplicate keys fail closed.
    blocks = re.findall(r"(?m)^---\nupdated-dependencies:\n(.*?)^\.\.\.$", message, re.S)
    require(len(blocks) == 1, "missing or ambiguous signed update metadata")
    records = []
    allowed = {"dependency-name", "dependency-version", "dependency-type", "update-type", "dependency-group"}
    for line in blocks[0].splitlines():
        match = re.fullmatch(r"(- |  )([a-z-]+): (.+)", line)
        require(match is not None, "unsupported metadata syntax")
        prefix, key, value = match.groups()
        if prefix == "- ":
            require(key == "dependency-name", "invalid dependency record")
            records.append({})
        require(records and key in allowed and key not in records[-1], "unknown or duplicate metadata field")
        if value.startswith('"'):
            try:
                value = json.loads(value)
            except ValueError as error:
                raise Blocked("invalid quoted metadata") from error
        require(isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9@_./:+~-]+", value), "unsupported metadata value")
        records[-1][key] = value
    require(records, "empty update group")
    for record in records:
        require(record.get("update-type") in {"version-update:semver-minor", "version-update:semver-patch"}, "major or unknown update in group")
        require(record.get("dependency-version"), "missing dependency version")
    return records


def eligible(pr, files, commits, repository):
    require(pr.get("state") == "open" and not pr.get("draft"), "PR is closed or draft")
    require(pr.get("user", {}).get("id") == BOT_ID and pr["user"].get("login") == "dependabot[bot]", "PR author is not Dependabot")
    require(pr.get("base", {}).get("ref") == "develop", "base must be develop")
    require(all(pr.get(side, {}).get("repo", {}).get("full_name") == repository for side in ("base", "head")), "fork or unexpected repository")
    require(not any(label.get("name") == "no-automerge" for label in pr.get("labels", [])), "no-automerge label")
    branch = pr["head"].get("ref", "")
    # Dependabot configuration calls this "gomod", but generated refs use "go_modules".
    prefixes = {"bun": "bun", "gomod": "go_modules"}
    ecosystem = next((name for name, prefix in prefixes.items() if branch.startswith(f"dependabot/{prefix}/")), None)
    require(ecosystem is not None, "only Bun and Go are eligible")
    names = {file.get("filename") for file in files}
    require(len(files) == pr.get("changed_files") and len(names) == len(files) and names, "incomplete or empty file list")
    require(all(file.get("status") == "modified" and not file.get("previous_filename") for file in files), "added, deleted or renamed files")
    require(any(names <= group for group in GROUPS[ecosystem]), "changes outside a single allowed dependency directory")
    require(pr.get("commits") == 1 and len(commits) == 1 and commits[0].get("sha") == pr["head"].get("sha"), "requires exactly one current Dependabot commit")
    commit = commits[0]
    require(commit.get("author", {}).get("id") == BOT_ID, "commit author is not Dependabot")
    verification = commit.get("commit", {}).get("verification", {})
    require(verification.get("verified") is True and verification.get("reason") == "valid", "unverified commit")
    records = dependencies(commit["commit"].get("message", ""))
    return ecosystem, len(records)


class GitHub:
    def __init__(self, repository, token):
        require(re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository), "invalid repository")
        self.root = f"https://api.github.com/repos/{repository}"
        self.token = token

    def __call__(self, path, method="GET", body=None):
        data = None if body is None else json.dumps(body).encode()
        request = urllib.request.Request(self.root + path, data=data, method=method, headers={
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "Content-Type": "application/json",
        })
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            # Do not print response bodies or authentication material.
            raise Blocked(f"GitHub API {method} {path.split('?')[0]} returned HTTP {error.code}") from error

    def pages(self, path, key=None):
        result = []
        for page in range(1, 32):
            data = self(f"{path}{'&' if '?' in path else '?'}per_page=100&page={page}")
            items = data[key] if key else data
            require(isinstance(items, list), "invalid paginated API response")
            result.extend(items)
            if len(items) < 100:
                return result
        raise Blocked("API pagination limit reached")


def readiness(api, pr, commits):
    sha = pr["head"]["sha"]
    base_sha = api("/git/ref/heads/develop")["object"]["sha"]
    require([parent["sha"] for parent in commits[0].get("parents", [])] == [base_sha], "rebase on current develop and rerun checks")
    require(pr.get("mergeable") is True and pr.get("mergeable_state") == "clean", "GitHub mergeability is not clean")
    require(pr.get("auto_merge") is None, "remove pre-existing native auto-merge before controller use")
    checks = api.pages(f"/commits/{sha}/check-runs?filter=latest", "check_runs")
    for filename, check_name in WORKFLOWS.items():
        runs = api.pages(f"/actions/workflows/{filename}/runs?event=pull_request&head_sha={sha}", "workflow_runs")
        runs = [run for run in runs if run.get("head_sha") == sha and run.get("head_branch") == pr["head"]["ref"] and any(item.get("number") == pr["number"] for item in run.get("pull_requests", []))]
        require(runs, f"missing current-head workflow: {filename}")
        run = max(runs, key=lambda item: (item["id"], item.get("run_attempt", 1)))
        require(run.get("status") == "completed" and run.get("conclusion") == "success", f"latest workflow has not succeeded: {filename}")
        matches = [check for check in checks if check.get("name") == check_name and check.get("check_suite", {}).get("id") == run.get("check_suite_id") and check.get("app", {}).get("slug") == "github-actions"]
        require(len(matches) == 1 and matches[0].get("status") == "completed" and matches[0].get("conclusion") == "success", f"required job missing, skipped or unsuccessful: {check_name}")
    return base_sha


def protected(api):
    # Activation intentionally supports classic protection only. Do not guess whether
    # a combination of rulesets provides equivalent enforcement.
    protection = api("/branches/develop/protection")
    status = protection.get("required_status_checks") or {}
    require(status.get("strict") is True, "strict required checks are not configured")
    require(protection.get("enforce_admins", {}).get("enabled") is True, "administrator protection is not enforced")
    required = {check.get("context") for check in status.get("checks", []) if check.get("app_id") == 15368}
    require(set(WORKFLOWS.values()) <= required, "required checks must be pinned to GitHub Actions")


def process(api, repository, number, enabled=False):
    pr = api(f"/pulls/{number}")
    files = api.pages(f"/pulls/{number}/files")
    commits = api.pages(f"/pulls/{number}/commits")
    ecosystem, count = eligible(pr, files, commits, repository)
    print(f"PR #{number}: eligible {ecosystem} update ({count} dependencies)")
    base_sha = readiness(api, pr, commits)
    if not enabled:
        print(f"PR #{number}: DRY RUN, current checks passed; no mutation (activation protection/App checks remain)")
        return
    protected(api)
    # Recheck the full policy/readiness immediately before the SHA-guarded merge.
    fresh = api(f"/pulls/{number}")
    fresh_files = api.pages(f"/pulls/{number}/files")
    fresh_commits = api.pages(f"/pulls/{number}/commits")
    eligible(fresh, fresh_files, fresh_commits, repository)
    require(fresh["head"]["sha"] == pr["head"]["sha"], "PR head changed during evaluation")
    require(readiness(api, fresh, fresh_commits) == base_sha, "develop changed during evaluation")
    result = api(f"/pulls/{number}/merge", "PUT", {"sha": pr["head"]["sha"], "merge_method": "squash"})
    require(result.get("merged") is True, "GitHub did not merge the PR")
    print(f"PR #{number}: merged commit {result['sha']}")


def main():
    repository = os.environ["GITHUB_REPOSITORY"]
    api = GitHub(repository, os.environ["GH_TOKEN"])
    event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
    enabled = os.environ.get("AUTOMERGE_MODE") == "enabled"
    if "workflow_run" in event:
        run = event["workflow_run"]
        require(run.get("event") == "pull_request" and run.get("head_repository", {}).get("full_name") == repository, "not a same-repository PR run")
        numbers = [pr["number"] for pr in run.get("pull_requests", [])]
    else:
        # Manual dispatch ALWAYS remains read-only, even after activation.
        enabled = False
        raw = str(event.get("inputs", {}).get("pr_number", ""))
        require(raw.isdecimal() and int(raw) > 0, "a PR number is required")
        numbers = [int(raw)]
    for number in numbers:
        require(isinstance(number, int) and number > 0, "invalid PR number")
        try:
            process(api, repository, number, enabled)
        except Blocked as error:
            print(f"PR #{number}: BLOCKED: {error}")
    if not numbers:
        print("No associated PR; no action")


if __name__ == "__main__":
    main()
