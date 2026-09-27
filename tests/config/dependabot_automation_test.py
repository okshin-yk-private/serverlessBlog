"""Behavior tests: policy, API decisions and scanner report validation, no network."""

import copy
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


def load(name):
    spec = importlib.util.spec_from_file_location(name, f"scripts/ci/{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


merge = load("dependabot_automerge")
security = load("dependency_security")
REPO = "owner/repo"


def metadata(update="patch", name="package"):
    return f'- dependency-name: "{name}"\n  dependency-version: 1.2.3\n  dependency-type: direct:production\n  update-type: version-update:semver-{update}\n'


def fixture():
    pr = {
        "number": 1, "state": "open", "draft": False,
        "user": {"id": merge.BOT_ID, "login": "dependabot[bot]"},
        "base": {"ref": "develop", "repo": {"full_name": REPO}},
        "head": {"ref": "dependabot/bun/prod-minor-patch", "sha": "head", "repo": {"full_name": REPO}},
        "labels": [], "commits": 1, "changed_files": 2,
        "mergeable": True, "mergeable_state": "clean", "auto_merge": None,
    }
    files = [{"filename": name, "status": "modified"} for name in ("package.json", "bun.lock")]
    commit = {
        "sha": "head", "parents": [{"sha": "base"}], "author": {"id": merge.BOT_ID},
        "commit": {"verification": {"verified": True, "reason": "valid"},
                   "message": "Update\n\n---\nupdated-dependencies:\n" + metadata() + metadata("minor", "@scope/other") + "...\n"},
    }
    return pr, files, [commit]


class FakeAPI:
    def __init__(self):
        self.pr, self.files, self.commits = fixture()
        self.protection = {"enforce_admins": {"enabled": True}, "required_status_checks": {
            "strict": False, "checks": [{"context": name, "app_id": 15368} for name in merge.WORKFLOWS.values()]}}
        self.rules = [{"type": "merge_queue", "ruleset_id": 7, "parameters": {"grouping_strategy": "ALLGREEN"}}]
        # Shape seen by the App token (#738): bypass_actors is omitted.
        self.ruleset = {"enforcement": "active", "current_user_can_bypass": "never"}
        self.queue = {"id": "PR_node", "headRefOid": "head", "isInMergeQueue": False}
        self.runs, self.checks = {}, []
        for i, (filename, name) in enumerate(merge.WORKFLOWS.items(), 1):
            self.runs[filename] = [{"id": i, "run_attempt": 1, "head_sha": "head", "head_branch": self.pr["head"]["ref"], "pull_requests": [{"number": 1}], "status": "completed", "conclusion": "success", "check_suite_id": i}]
            self.checks.append({"name": name, "status": "completed", "conclusion": "success", "app": {"slug": "github-actions"}, "check_suite": {"id": i}})
        self.writes = []
        self.pr_reads = 0
        self.on_refresh = None

    def __call__(self, path, method="GET", body=None):
        if method != "GET":
            self.writes.append((path, method, body))
            return {"merged": True, "sha": "merged"}
        if path == "/rulesets/7":
            return copy.deepcopy(self.ruleset)
        if path == "/pulls/1":
            self.pr_reads += 1
            if self.pr_reads == 2 and self.on_refresh:
                self.on_refresh(self)
            return copy.deepcopy(self.pr)
        if path == "/branches/develop/protection":
            return self.protection
        raise AssertionError(path)

    def graphql(self, query, variables):
        if "enqueuePullRequest" in query:
            self.writes.append(("enqueuePullRequest", variables))
            return {"enqueuePullRequest": {"mergeQueueEntry": {"position": 1}}}
        return {"repository": {"pullRequest": copy.deepcopy(self.queue)}}

    def pages(self, path, key=None):
        if path == "/rules/branches/develop":
            return copy.deepcopy(self.rules)
        if path == "/pulls/1/files":
            return copy.deepcopy(self.files)
        if path == "/pulls/1/commits":
            return copy.deepcopy(self.commits)
        if "/check-runs" in path:
            return self.checks
        if "/actions/workflows/" in path:
            return self.runs[path.split("/")[3]]
        raise AssertionError(path)


class PolicyTests(unittest.TestCase):
    def test_accepts_complete_bun_and_go_groups(self):
        pr, files, commits = fixture()
        self.assertEqual(merge.eligible(pr, files, commits, REPO), ("bun", 2))
        pr["head"]["ref"] = "dependabot/go_modules/go-functions/go-minor-patch"
        files = [{"filename": name, "status": "modified"} for name in ("go-functions/go.mod", "go-functions/go.sum")]
        self.assertEqual(merge.eligible(pr, files, commits, REPO), ("gomod", 2))

    def test_rejects_untrusted_prs_and_files(self):
        changes = [
            lambda p, f, c: p.update(state="closed"),
            lambda p, f, c: p.update(draft=True),
            lambda p, f, c: p["user"].update(id=123),
            lambda p, f, c: p["base"].update(ref="main"),
            lambda p, f, c: p["head"]["repo"].update(full_name="attacker/repo"),
            lambda p, f, c: p.update(labels=[{"name": "no-automerge"}]),
            lambda p, f, c: p["head"].update(ref="dependabot/terraform/dev/aws"),
            lambda p, f, c: p["head"].update(ref="dependabot/github_actions/update"),
            lambda p, f, c: f[0].update(filename=".github/workflows/ci.yml"),
            lambda p, f, c: f[0].update(filename="frontend/admin/package.json"),
            lambda p, f, c: f[0].update(status="renamed"),
            lambda p, f, c: p.update(changed_files=3),
            lambda p, f, c: p.update(commits=2),
            lambda p, f, c: c[0].update(sha="stale"),
            lambda p, f, c: c[0]["author"].update(id=123),
            lambda p, f, c: c[0]["commit"]["verification"].update(verified=False),
        ]
        for change in changes:
            with self.subTest(change=change):
                args = fixture()
                change(*args)
                with self.assertRaises(merge.Blocked):
                    merge.eligible(*args, REPO)

    def test_checks_every_group_member_and_fails_unknown_schema(self):
        for fragment in [metadata("major"), metadata("unknown"), metadata().replace("  update-type: version-update:semver-patch\n", ""), metadata() + "  update-type: version-update:semver-patch\n", "- dependency-name: &anchor foo\n", ""]:
            with self.subTest(fragment=fragment):
                message = "---\nupdated-dependencies:\n" + (metadata() if fragment else "") + fragment + "...\n"
                with self.assertRaises(merge.Blocked):
                    merge.dependencies(message)


class ControllerTests(unittest.TestCase):
    def test_dry_run_never_writes_or_needs_admin_permission(self):
        api = FakeAPI()
        api.protection = None
        merge.process(api, REPO, 1)
        self.assertEqual(api.writes, [])

    def test_enqueues_only_exact_head_after_required_checks(self):
        api = FakeAPI()
        merge.process(api, REPO, 1, enabled=True)
        self.assertEqual(api.writes, [("enqueuePullRequest", {"id": "PR_node", "head": "head"})])

    def test_behind_develop_is_left_to_the_merge_queue(self):
        # The PR commit's parent is an older develop commit; the queue retests the merge result.
        api = FakeAPI()
        api.commits[0]["parents"] = [{"sha": "older-develop"}]
        merge.process(api, REPO, 1, enabled=True)
        self.assertEqual(len(api.writes), 1)

    def test_admin_view_with_empty_bypass_list_is_accepted(self):
        api = FakeAPI()
        api.ruleset["bypass_actors"] = []
        merge.process(api, REPO, 1, enabled=True)
        self.assertEqual(len(api.writes), 1)

    def test_already_queued_pr_is_not_enqueued_again(self):
        api = FakeAPI()
        api.queue["isInMergeQueue"] = True
        merge.process(api, REPO, 1, enabled=True)
        self.assertEqual(api.writes, [])

    def test_graphql_errors_fail_closed(self):
        client = merge.GitHub(REPO, "fixture")
        for response in [{"errors": [{"message": "denied"}], "data": None}, {"data": None}, None]:
            with self.subTest(response=response), patch.object(merge.GitHub, "__call__", return_value=response), self.assertRaises(merge.Blocked):
                client.graphql("query { viewer { login } }", {})

    def test_manual_dispatch_stays_read_only_even_when_enabled(self):
        api = FakeAPI()
        with tempfile.TemporaryDirectory() as directory:
            event = Path(directory) / "event.json"
            event.write_text(json.dumps({"inputs": {"pr_number": "1"}}))
            with patch.dict(os.environ, {"GITHUB_REPOSITORY": REPO, "GH_TOKEN": "fixture", "GITHUB_EVENT_PATH": str(event), "AUTOMERGE_MODE": "enabled"}), patch.object(merge, "GitHub", return_value=api):
                merge.main()
        self.assertEqual(api.writes, [])

    def test_rejects_stale_missing_skipped_or_spoofed_checks(self):
        changes = [
            lambda a: a.pr.update(mergeable=None),
            lambda a: a.pr.update(mergeable_state="behind"),
            lambda a: a.pr.update(auto_merge={"enabled_by": "somebody"}),
            lambda a: a.runs.update({"ci.yml": []}),
            lambda a: a.runs["ci.yml"][0].update(head_sha="old-head"),
            lambda a: a.runs["ci.yml"][0].update(pull_requests=[]),
            lambda a: a.runs["ci.yml"][0].update(conclusion="failure"),
            lambda a: a.runs["ci.yml"][0].update(status="in_progress"),
            lambda a: a.runs["ci.yml"].append({**a.runs["ci.yml"][0], "id": 99, "conclusion": "cancelled"}),
            lambda a: a.checks[0].update(conclusion="skipped"),
            lambda a: a.checks[0].update(check_suite={"id": 99}),
            lambda a: a.checks[0].update(app={"slug": "other-app"}),
            lambda a: setattr(a, "rules", []),
            lambda a: a.rules.append(copy.deepcopy(a.rules[0])),
            lambda a: a.rules[0]["parameters"].update(grouping_strategy="HEADGREEN"),
            lambda a: a.rules[0].update(ruleset_id=None),
            lambda a: a.ruleset.update(enforcement="evaluate"),
            lambda a: a.ruleset.update(bypass_actors=[{"actor_type": "RepositoryRole", "actor_id": 5}]),
            lambda a: a.ruleset.update(bypass_actors=None),
            lambda a: a.ruleset.update(current_user_can_bypass="always"),
            lambda a: a.ruleset.update(current_user_can_bypass="pull_requests_only"),
            lambda a: a.ruleset.update(current_user_can_bypass="exempt"),
            lambda a: a.ruleset.pop("current_user_can_bypass"),
            lambda a: a.queue.update(headRefOid="replacement"),
            lambda a: a.protection["required_status_checks"]["checks"].pop(),
            lambda a: a.protection["required_status_checks"]["checks"][0].update(app_id=None),
            lambda a: a.protection["enforce_admins"].update(enabled=False),
        ]
        for change in changes:
            with self.subTest(change=change):
                api = FakeAPI()
                change(api)
                with self.assertRaises(merge.Blocked):
                    merge.process(api, REPO, 1, enabled=True)
                self.assertEqual(api.writes, [])

    def test_rechecks_head_base_and_optout_immediately_before_merge(self):
        for refresh in [
            lambda a: a.pr["head"].update(sha="replacement"),
            lambda a: a.pr.update(labels=[{"name": "no-automerge"}]),
            lambda a: a.checks[0].update(conclusion="failure"),
        ]:
            api = FakeAPI()
            api.on_refresh = refresh
            with self.assertRaises(merge.Blocked):
                merge.process(api, REPO, 1, enabled=True)
            self.assertEqual(api.writes, [])


def report():
    return {"SchemaVersion": 2, "Results": [{"Target": target, "Type": kind, "Packages": [{"Name": "package", "Version": "1.0.0"}]} for target, kind in security.MANIFESTS.items()]}


def vulnerability(severity="HIGH", version="1.0.0"):
    return {"VulnerabilityID": "CVE-test", "PkgName": "package", "InstalledVersion": version, "Severity": severity}


class SecurityTests(unittest.TestCase):
    def test_new_high_and_critical_block_but_unchanged_baseline_is_identified(self):
        base, head = report(), report()
        head["Results"][0]["Vulnerabilities"] = [vulnerability()]
        self.assertEqual(tuple(map(len, security.compare(base, head))), (1, 0))
        self.assertEqual(tuple(map(len, security.compare(head, head))), (0, 1))
        for item in [vulnerability("CRITICAL"), vulnerability(version="1.0.1")]:
            changed = copy.deepcopy(head)
            changed["Results"][0]["Vulnerabilities"] = [item]
            self.assertEqual(len(security.compare(head, changed)[0]), 1)

    def test_severity_escalation_is_not_hidden_by_baseline(self):
        base, head = report(), report()
        base["Results"][0]["Vulnerabilities"] = [vulnerability("MEDIUM")]
        head["Results"][0]["Vulnerabilities"] = [vulnerability()]
        self.assertEqual(len(security.compare(base, head)[0]), 1)

    def test_missing_unknown_and_incomplete_reports_fail(self):
        invalid = [{}, {"SchemaVersion": 2, "Results": []}]
        for mutate in [lambda r: r["Results"].pop(), lambda r: r["Results"][0].update(Type="npm"), lambda r: r["Results"][0].update(Packages=[]), lambda r: r["Results"].append(r["Results"][0]), lambda r: r["Results"][0].update(Vulnerabilities=[{"Severity": "HIGH"}])]:
            data = report()
            mutate(data)
            invalid.append(data)
        for data in invalid:
            with self.subTest(data=data), self.assertRaises(ValueError):
                security.findings(data)


if __name__ == "__main__":
    unittest.main()
