"""Behavioral tests for unattended production promotion (no network)."""
import copy
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts' / 'ci'))
import weekly_release as release

NOW = datetime(2026, 9, 19, 0, 0, tzinfo=timezone.utc)
REPO = 'owner/repo'


def success(name):
    return {'name': name, 'status': 'completed', 'conclusion': 'success'}


class API:
    def __init__(self):
        self.writes = []
        self.refs = {'develop': 'source', 'main': 'base'}
        self.trees = {'source': 'source-tree', 'base': 'base-tree', 'candidate': 'source-tree', 'merged': 'source-tree'}
        self.policy = {
            'required_status_checks': {'strict': True, 'checks': [{'context': name, 'app_id': 15368} for name in release.WORKFLOWS.values()]},
            'enforce_admins': {'enabled': True}, 'required_pull_request_reviews': {},
            'allow_force_pushes': {'enabled': False}, 'allow_deletions': {'enabled': False},
        }
        self.dev = {'id': 10, 'head_sha': 'source', 'head_branch': 'develop', 'event': 'push', 'html_url': 'https://example.test/dev', **success('Deploy')}
        self.jobs = [success(name) for name in ('Deploy Infrastructure (DEV)', 'Deploy Admin (DEV)', 'Deploy Astro SSG (DEV)')]
        self.jobs += [{**success('Post-Deploy E2E Tests (DEV)'), 'steps': [success('Run Post-Deploy E2E Tests (Public)'), success('Run Post-Deploy E2E Tests (Admin)')]}]
        self.pr = None
        self.runs = {}
        self.checks = []
        self.files = []
        self.existing = []
        self.change_tree_on_merge = False

    def __call__(self, path, method='GET', body=None):
        if method != 'GET':
            self.writes.append((path, method, copy.deepcopy(body)))
        if path == '/branches/main/protection':
            return copy.deepcopy(self.policy)
        if path.startswith('/git/ref/heads/'):
            return {'object': {'sha': self.refs[path.removeprefix('/git/ref/heads/')]}}
        if path.startswith('/git/commits/'):
            return {'tree': {'sha': self.trees[path.removeprefix('/git/commits/')]}}
        if path.startswith('/compare/'):
            status = 'diverged' if path == '/compare/base...source' else 'ahead'
            return {'status': status, 'files': self.files}
        if path == '/git/refs':
            self.branch = body['ref'].removeprefix('refs/heads/')
            self.refs[self.branch] = body['sha']
            return {}
        if path == '/merges':
            self.refs[body['base']] = 'candidate'
            if self.change_tree_on_merge:
                self.trees['candidate'] = 'unexpected-tree'
            return {'sha': 'candidate'}
        if path == '/pulls' and method == 'POST':
            self.pr = {'number': 42, 'state': 'open', 'draft': False, 'base': {'ref': 'main', 'sha': 'base', 'repo': {'full_name': REPO}},
                       'head': {'ref': self.branch, 'sha': self.refs[self.branch], 'repo': {'full_name': REPO}},
                       'auto_merge': None, 'labels': [], 'mergeable': True, 'mergeable_state': 'clean', 'html_url': 'https://example.test/pr/42'}
            for index, (workflow, name) in enumerate(release.WORKFLOWS.items()):
                self.runs[workflow] = [{'id': 20 + index, 'head_sha': self.refs[self.branch], 'head_branch': self.branch,
                                       'pull_requests': [{'number': 42}], 'check_suite_id': 100 + index, **success(workflow)}]
                self.checks.append({'check_suite': {'id': 100 + index}, 'app': {'id': 15368}, **success(name)})
            return copy.deepcopy(self.pr)
        if path == '/pulls/42':
            return copy.deepcopy(self.pr)
        if path == '/pulls/42/merge':
            self.refs['main'] = 'merged'
            return {'merged': True, 'sha': 'merged'}
        raise AssertionError((path, method, body))

    def pages(self, path, key=None):
        if path.startswith('/actions/workflows/deploy.yml/runs'):
            return [copy.deepcopy(self.dev)]
        if path == '/actions/runs/10/jobs?filter=latest':
            return copy.deepcopy(self.jobs)
        if path == '/pulls?state=open&base=main':
            return copy.deepcopy(self.existing)
        if path.startswith('/commits/'):
            return copy.deepcopy(self.checks)
        if path.startswith('/actions/workflows/'):
            workflow = path.split('/')[3]
            return copy.deepcopy(self.runs[workflow])
        raise AssertionError(path)


class ReleaseTests(unittest.TestCase):
    def test_window_is_jst_saturday_morning(self):
        release.release_window(NOW)
        release.release_window(NOW + timedelta(hours=2, minutes=59))
        for date in (NOW - timedelta(seconds=1), NOW + timedelta(hours=3), NOW + timedelta(days=1)):
            with self.subTest(date=date), self.assertRaises(release.Blocked):
                release.release_window(date)

    def test_complete_release_uses_exact_sha_and_merge_commit(self):
        api = API()
        release.run_release(api, REPO, '123', now_fn=lambda: NOW, sleep_fn=lambda _: self.fail('unexpected wait'))
        self.assertEqual(api.writes[-1], ('/pulls/42/merge', 'PUT', {'sha': 'candidate', 'merge_method': 'merge'}))
        self.assertEqual(api.refs['develop'], 'source')
        self.assertEqual(api.writes[1][2]['head'], 'base')

    def test_no_difference_does_not_write(self):
        api = API()
        api.trees['base'] = 'source-tree'
        self.assertIsNone(release.prepare(api, REPO, '123', NOW))
        self.assertEqual(api.writes, [])

    def test_existing_main_pr_stops_before_branch_creation(self):
        api = API()
        api.existing = [{'number': 41}]
        with self.assertRaises(release.Blocked):
            release.prepare(api, REPO, '123', NOW)
        self.assertEqual(api.writes, [])

    def test_merge_that_changes_content_never_creates_pr(self):
        api = API()
        api.change_tree_on_merge = True
        with self.assertRaises(release.Blocked):
            release.prepare(api, REPO, '123', NOW)
        self.assertNotIn('/pulls', [write[0] for write in api.writes])

    def test_protection_is_fail_closed(self):
        for change in (
            lambda p: p['required_status_checks'].update(strict=False),
            lambda p: p['required_status_checks']['checks'][0].update(app_id=-1),
            lambda p: p['enforce_admins'].update(enabled=False),
            lambda p: p['allow_force_pushes'].update(enabled=True),
            lambda p: p['allow_deletions'].update(enabled=True),
            lambda p: p.update(required_pull_request_reviews=None),
            lambda p: p['required_pull_request_reviews'].update(bypass_pull_request_allowances={'apps': [{'id': 1}]}),
        ):
            api = API()
            change(api.policy)
            with self.subTest(policy=api.policy), self.assertRaises(release.Blocked):
                release.protected(api)

    def test_dev_e2e_step_skipped_is_not_success(self):
        api = API()
        api.jobs[-1]['steps'][-1]['conclusion'] = 'skipped'
        with self.assertRaises(release.Blocked):
            release.dev_evidence(api, 'source')

    def test_partial_manual_dev_is_not_full_source_evidence(self):
        api = API()
        api.dev["event"] = "workflow_dispatch"
        api.jobs[0]["conclusion"] = "skipped"
        with self.assertRaises(release.Blocked):
            release.dev_evidence(api, "source")
        api.jobs[0]["conclusion"] = "success"
        self.assertEqual(release.dev_evidence(api, "source")["sha"], "source")

    def test_dev_failed_or_running_not_accepted(self):
        for status, conclusion, exception in [('completed', 'failure', release.Blocked), ('in_progress', None, release.Pending)]:
            api = API()
            api.dev.update(status=status, conclusion=conclusion)
            with self.subTest(status=status), self.assertRaises(exception):
                release.dev_evidence(api, 'source')

    def test_dev_reuse_only_allows_administrative_changes(self):
        for file, accepted in [({'filename': 'docs/release.md'}, True),
                               ({'filename': 'go-functions/go.mod'}, False),
                               ({'filename': '.github/actions/setup/action.yml'}, False),
                               ({'filename': '.github/workflows/deploy.yml'}, False),
                               ({'filename': 'tests/e2e/test.ts'}, False),
                               ({'filename': 'docs/a.md', 'previous_filename': 'package.json'}, False)]:
            api = API()
            api.dev['head_sha'] = 'earlier'
            api.files = [file]
            with self.subTest(file=file):
                if accepted:
                    self.assertEqual(release.dev_evidence(api, 'source')['sha'], 'earlier')
                else:
                    with self.assertRaises(release.Blocked):
                        release.dev_evidence(api, 'source')

    def test_latest_failed_run_overrides_old_success(self):
        api = API()
        state = release.prepare(api, REPO, '123', NOW)
        run = copy.deepcopy(api.runs['ci.yml'][0])
        run.update(id=99, conclusion='failure')
        api.runs['ci.yml'].append(run)
        with self.assertRaises(release.Blocked):
            release.ready(api, state, REPO)

    def test_wrong_sha_or_wrong_pr_run_not_used(self):
        for field, value in [('head_sha', 'other'), ('pull_requests', [{'number': 43}])]:
            api = API()
            state = release.prepare(api, REPO, '123', NOW)
            api.runs['ci.yml'][0][field] = value
            with self.subTest(field=field), self.assertRaises(release.Pending):
                release.ready(api, state, REPO)

    def test_wrong_check_issuer_or_suite_is_rejected(self):
        for key, value in [('app', {'id': 666}), ('check_suite', {'id': 666})]:
            api = API()
            state = release.prepare(api, REPO, '123', NOW)
            api.checks[0][key] = value
            with self.subTest(key=key), self.assertRaises(release.Blocked):
                release.ready(api, state, REPO)

    def test_source_or_base_or_pr_changes_stop_merge(self):
        for mutate in (
            lambda api: api.refs.update(develop='moved'),
            lambda api: api.refs.update(main='moved'),
            lambda api: api.refs.update({api.branch: 'moved'}),
            lambda api: api.pr['head'].update(sha='moved'),
            lambda api: api.pr['base'].update(ref='develop'),
            lambda api: api.pr.update(draft=True),
            lambda api: api.pr.update(labels=[{'name': 'no-automerge'}]),
            lambda api: api.pr.update(auto_merge={'enabled': True}),
        ):
            api = API()
            state = release.prepare(api, REPO, '123', NOW)
            mutate(api)
            with self.subTest(mutate=mutate), self.assertRaises(release.Blocked):
                release.ready(api, state, REPO)
            self.assertNotIn('/pulls/42/merge', [write[0] for write in api.writes])

    def test_pending_deadline_never_merges(self):
        api = API()
        clock = [NOW]
        def wait(seconds):
            clock[0] += timedelta(minutes=46)
        with patch.object(release, 'ready', side_effect=release.Pending('waiting')):
            with self.assertRaises(release.Blocked):
                release.run_release(api, REPO, '123', now_fn=lambda: clock[0], sleep_fn=wait)
        self.assertNotIn('/pulls/42/merge', [write[0] for write in api.writes])

    def test_final_recheck_is_required(self):
        api = API()
        with patch.object(release, 'ready', side_effect=[None, release.Blocked('head changed')]):
            with self.assertRaises(release.Blocked):
                release.run_release(api, REPO, '123', now_fn=lambda: NOW)
        self.assertNotIn('/pulls/42/merge', [write[0] for write in api.writes])

    def test_manual_disabled_and_rerun_are_read_only(self):
        for event_name, mode, attempt in [('workflow_dispatch', 'enabled', '1'), ('schedule', 'dry-run', '1'), ('schedule', 'enabled', '2')]:
            with tempfile.TemporaryDirectory() as directory:
                event = Path(directory) / 'event.json'
                event.write_text(json.dumps({'schedule': '0 0 * * 6'}))
                env = {'GITHUB_REPOSITORY': REPO, 'GH_TOKEN': 'test', 'GITHUB_EVENT_PATH': str(event),
                       'GITHUB_EVENT_NAME': event_name, 'WEEKLY_RELEASE_MODE': mode, 'GITHUB_RUN_ATTEMPT': attempt}
                api = API()
                with self.subTest(env=env), patch.dict(os.environ, env), patch.object(release, 'GitHub', return_value=api):
                    release.main()
                self.assertEqual(api.writes, [])


if __name__ == '__main__':
    unittest.main()
