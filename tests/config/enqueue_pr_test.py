"""Behavior tests for the agent-facing develop merge-queue helper; no network."""

import copy
import importlib.util
import unittest


def load(name):
    spec = importlib.util.spec_from_file_location(name, f"scripts/ci/{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


enqueue_pr = load("enqueue_pr")
REPO = "owner/repo"


class FakeAPI:
    def __init__(self):
        self.pr = {
            "number": 1, "state": "open", "draft": False,
            "base": {"ref": "develop", "repo": {"full_name": REPO}},
            "head": {"ref": "chore/example", "sha": "head", "repo": {"full_name": REPO}},
            "mergeable": True, "mergeable_state": "clean", "auto_merge": None,
        }
        self.queue = {"id": "PR_node", "headRefOid": "head", "isInMergeQueue": False}
        self.runs, self.checks = {}, []
        for i, (filename, name) in enumerate(enqueue_pr.core.WORKFLOWS.items(), 1):
            self.runs[filename] = [{"id": i, "run_attempt": 1, "head_sha": "head", "head_branch": "chore/example", "pull_requests": [{"number": 1}], "status": "completed", "conclusion": "success", "check_suite_id": i}]
            self.checks.append({"name": name, "status": "completed", "conclusion": "success", "app": {"slug": "github-actions"}, "check_suite": {"id": i}})
        self.writes = []
        self.pr_reads = 0
        self.on_refresh = None

    def __call__(self, path, method="GET", body=None):
        if method != "GET":
            raise AssertionError(f"unexpected REST write {method} {path}")
        if path == "/pulls/1":
            self.pr_reads += 1
            if self.pr_reads == 2 and self.on_refresh:
                self.on_refresh(self)
            return copy.deepcopy(self.pr)
        raise AssertionError(path)

    def graphql(self, query, variables):
        if "enqueuePullRequest" in query:
            self.writes.append(variables)
            return {"enqueuePullRequest": {"mergeQueueEntry": {"position": 1}}}
        return {"repository": {"pullRequest": copy.deepcopy(self.queue)}}

    def pages(self, path, key=None):
        if "/check-runs" in path:
            return self.checks
        if "/actions/workflows/" in path:
            return self.runs[path.split("/")[3]]
        raise AssertionError(path)


class EnqueueTests(unittest.TestCase):
    def test_enqueues_ready_develop_pr_with_verified_head(self):
        api = FakeAPI()
        enqueue_pr.process(api, REPO, 1)
        self.assertEqual(api.writes, [{"id": "PR_node", "head": "head"}])

    def test_dry_run_checks_readiness_without_writing(self):
        api = FakeAPI()
        enqueue_pr.process(api, REPO, 1, dry_run=True)
        self.assertEqual(api.writes, [])

    def test_refuses_non_develop_and_untrusted_prs(self):
        changes = [
            lambda p: p["base"].update(ref="main"),
            lambda p: p["base"]["repo"].update(full_name="other/repo"),
            lambda p: p["head"].update(repo={"full_name": "fork/repo"}),
            lambda p: p["head"].update(repo=None),
            lambda p: p.update(state="closed"),
            lambda p: p.update(draft=True),
        ]
        for change in changes:
            api = FakeAPI()
            change(api.pr)
            with self.subTest(change=change), self.assertRaises(enqueue_pr.core.Blocked):
                enqueue_pr.process(api, REPO, 1)
            self.assertEqual(api.writes, [])

    def test_refuses_until_required_checks_succeed(self):
        for conclusion in ("failure", "cancelled", "skipped", None):
            api = FakeAPI()
            api.runs["ci.yml"][0]["conclusion"] = conclusion
            with self.subTest(conclusion=conclusion), self.assertRaises(enqueue_pr.core.Blocked):
                enqueue_pr.process(api, REPO, 1)
            self.assertEqual(api.writes, [])

    def test_refuses_when_head_or_base_changes_before_enqueue(self):
        for change in (
            lambda a: a.pr["head"].update(sha="new"),
            lambda a: a.pr["base"].update(ref="main"),
        ):
            api = FakeAPI()
            api.on_refresh = change
            with self.subTest(change=change), self.assertRaises(enqueue_pr.core.Blocked):
                enqueue_pr.process(api, REPO, 1)
            self.assertEqual(api.writes, [])

    def test_already_queued_pr_is_not_enqueued_twice(self):
        api = FakeAPI()
        api.queue["isInMergeQueue"] = True
        enqueue_pr.process(api, REPO, 1)
        self.assertEqual(api.writes, [])

    def test_rejects_invalid_pr_number_arguments(self):
        for argv in ([], ["0"], ["-1"], ["abc"], ["1", "2"], ["1", "--force"]):
            with self.subTest(argv=argv), self.assertRaises(SystemExit):
                enqueue_pr.parse(argv)


if __name__ == "__main__":
    unittest.main()
