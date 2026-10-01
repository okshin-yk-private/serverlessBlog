"""Add an approved PR into develop's merge queue; agents may run only this, never raw GraphQL.

Usage:
  python3 scripts/ci/enqueue_pr.py <PR number> [--dry-run]
  python3 scripts/ci/enqueue_pr.py <PR number> --auto [--dry-run]

Plain mode is fail-closed: only open, non-draft, same-repository PRs whose base is develop,
with the three required workflows green on the current head, are enqueued directly. main
(PRD) is never a target. Reuses the Dependabot controller's readiness and SHA-guarded enqueue.

`--auto` reserves GitHub's native auto-merge on a develop PR instead of waiting for checks:
once required checks pass, GitHub itself adds the PR to the merge queue. It does not require
readiness (checks are expected to still be pending), refuses Dependabot-authored PRs (the
Dependabot controller owns those), and needs the repository's "Allow auto-merge" setting
enabled; while that setting is off it fails closed with a clear BLOCKED message.
"""

import argparse
import importlib.util
from pathlib import Path
import re
import subprocess
import sys


def _load_core():
    spec = importlib.util.spec_from_file_location(
        "dependabot_automerge", Path(__file__).with_name("dependabot_automerge.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


core = _load_core()
require = core.require


def policy(pr, repository):
    require(pr.get("state") == "open", "PR is not open")
    require(pr.get("draft") is False, "draft PRs are not enqueued")
    base = pr.get("base") or {}
    require(base.get("ref") == "develop" and (base.get("repo") or {}).get("full_name") == repository,
            "only PRs into this repository's develop may be enqueued")
    require((pr.get("head") or {}).get("repo") and pr["head"]["repo"].get("full_name") == repository,
            "fork PRs are not enqueued")


def policy_auto(pr, repository):
    policy(pr, repository)
    user = pr.get("user") or {}
    require(not (user.get("login") == "dependabot[bot]" or user.get("id") == core.BOT_ID),
            "Dependabot PRs are handled by the Dependabot auto-merge controller, not --auto")


def process(api, repository, number, dry_run=False):
    pr = api(f"/pulls/{number}")
    policy(pr, repository)
    core.readiness(api, pr)
    if dry_run:
        print(f"PR #{number}: ready for the merge queue (dry run, nothing enqueued)")
        return
    # Recheck immediately before the SHA-guarded enqueue.
    fresh = api(f"/pulls/{number}")
    policy(fresh, repository)
    require(fresh["head"]["sha"] == pr["head"]["sha"], "PR head changed during evaluation")
    core.readiness(api, fresh)
    position = core.enqueue(api, repository, fresh)
    if position is None:
        print(f"PR #{number}: already in the merge queue; no action")
    else:
        print(f"PR #{number}: added to the merge queue at position {position}")


AUTO_MERGE_STATE = """
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) { id headRefOid isInMergeQueue autoMergeRequest { enabledAt } }
  }
}
"""
ENABLE_AUTO_MERGE = """
mutation($id: ID!, $head: GitObjectID!) {
  enablePullRequestAutoMerge(input: {pullRequestId: $id, expectedHeadOid: $head}) {
    pullRequest { autoMergeRequest { enabledAt } }
  }
}
"""


def auto_merge_state(api, repository, number):
    owner, name = repository.split("/")
    data = api.graphql(AUTO_MERGE_STATE, {"owner": owner, "name": name, "number": number})
    return data["repository"]["pullRequest"]


def already_reserved(state):
    return bool(state.get("isInMergeQueue")) or state.get("autoMergeRequest") is not None


def enable_auto_merge(api, repository, pr):
    # Re-read state immediately before the SHA-guarded mutation, like the plain-mode enqueue.
    state = auto_merge_state(api, repository, pr["number"])
    require(state.get("headRefOid") == pr["head"]["sha"], "PR head changed during evaluation")
    if already_reserved(state):
        return None
    try:
        api.graphql(ENABLE_AUTO_MERGE, {"id": state["id"], "head": pr["head"]["sha"]})
    except core.Blocked as error:
        if re.search(r"auto[- ]?merge", str(error), re.I):
            raise core.Blocked(
                "repository auto-merge is disabled (Settings → General → Allow auto-merge)"
            ) from error
        raise
    return True


def process_auto(api, repository, number, dry_run=False):
    pr = api(f"/pulls/{number}")
    policy_auto(pr, repository)
    state = auto_merge_state(api, repository, number)
    if already_reserved(state):
        print(f"PR #{number}: already in the merge queue or auto-merge already enabled; no action")
        return
    if dry_run:
        print(f"PR #{number}: eligible to reserve auto-merge (dry run, nothing enabled)")
        return
    # Recheck immediately before the SHA-guarded mutation.
    fresh = api(f"/pulls/{number}")
    policy_auto(fresh, repository)
    require(fresh["head"]["sha"] == pr["head"]["sha"], "PR head changed during evaluation")
    enabled = enable_auto_merge(api, repository, fresh)
    if enabled is None:
        print(f"PR #{number}: already in the merge queue or auto-merge already enabled; no action")
    else:
        print(f"PR #{number}: auto-merge enabled; GitHub will add it to the merge queue when required checks pass")


def parse(argv):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("number", type=int)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--auto", action="store_true")
    args = parser.parse_args(argv)
    if args.number <= 0:
        parser.error("PR number must be positive")
    return args


def gh(*args):
    return subprocess.run(["gh", *args], check=True, capture_output=True, text=True).stdout.strip()


def main(argv=None):
    args = parse(sys.argv[1:] if argv is None else argv)
    repository = gh("repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner")
    api = core.GitHub(repository, gh("auth", "token"))
    try:
        if args.auto:
            process_auto(api, repository, args.number, args.dry_run)
        else:
            process(api, repository, args.number, args.dry_run)
    except core.Blocked as error:
        print(f"PR #{args.number}: BLOCKED: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
