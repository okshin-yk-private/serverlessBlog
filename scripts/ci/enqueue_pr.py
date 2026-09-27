"""Add an approved PR into develop's merge queue; agents may run only this, never raw GraphQL.

Usage: python3 scripts/ci/enqueue_pr.py <PR number> [--dry-run]

Fail-closed: only open, non-draft, same-repository PRs whose base is develop, with the
three required workflows green on the current head. main (PRD) is never a target.
Reuses the Dependabot controller's readiness and SHA-guarded enqueue.
"""

import argparse
import importlib.util
from pathlib import Path
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


def parse(argv):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("number", type=int)
    parser.add_argument("--dry-run", action="store_true")
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
        process(api, repository, args.number, args.dry_run)
    except core.Blocked as error:
        print(f"PR #{args.number}: BLOCKED: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
