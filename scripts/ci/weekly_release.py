"""Weekly, SHA-pinned production promotion. Never executes candidate code."""

import json
import os
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from dependabot_automerge import Blocked, GitHub, WORKFLOWS, require

JST = timezone(timedelta(hours=9))


class Pending(Exception):
    """Checks are not finished yet; this is not authorization to merge."""


def release_window(now):
    local = now.astimezone(JST)
    require(local.weekday() == 5 and 9 <= local.hour < 12,
            "release window is Saturday 09:00-12:00 Asia/Tokyo")


def ref(api, name):
    return api(f"/git/ref/heads/{name}")["object"]["sha"]


def tree(api, sha):
    return api(f"/git/commits/{sha}")["tree"]["sha"]


def ancestor(api, older, newer):
    if older != newer:
        comparison = api(f"/compare/{older}...{newer}")
        require(comparison.get("status") in {"ahead", "identical"}, "required ancestry is missing")


def protected(api):
    policy = api("/branches/main/protection")
    status = policy.get("required_status_checks") or {}
    required = {item.get("context") for item in status.get("checks", []) if item.get("app_id") == 15368}
    require(status.get("strict") is True, "main strict checks are not enabled")
    require(set(WORKFLOWS.values()) <= required, "main required checks must be pinned to GitHub Actions")
    require(policy.get("enforce_admins", {}).get("enabled") is True, "main administrator protection is missing")
    require(isinstance(policy.get("required_pull_request_reviews"), dict), "main must require a PR")
    require(not policy.get("allow_force_pushes", {}).get("enabled", True), "main permits force pushes")
    require(not policy.get("allow_deletions", {}).get("enabled", True), "main permits deletion")
    require(not any(policy["required_pull_request_reviews"].get("bypass_pull_request_allowances", {}).values()),
            "main has PR bypass allowances")


def completed(run, description):
    if run.get("status") != "completed":
        raise Pending(f"waiting for {description}")
    require(run.get("conclusion") == "success", f"{description} did not succeed")


def latest(runs, description):
    if not runs:
        raise Pending(f"waiting for {description} to start")
    return max(runs, key=lambda run: (run["id"], run.get("run_attempt", 1)))


def administrative_path(path):
    # Only these changes may reuse a successful DEV deployment. Everything else,
    # including deployment workflows/actions, root config and tests/e2e, fails closed.
    return (
        path.startswith("docs/")
        or ("/" not in path and path.endswith(".md"))
        or path.startswith(".agents/")
        or path.startswith(".claude/")
        or path.startswith(".codex/")
        or path.startswith(".kiro/")
        or path in {
            ".github/workflows/weekly-production-release.yml",
            ".github/workflows/dependabot-auto-merge.yml",
            "scripts/ci/weekly_release.py",
        }
    )


def dev_evidence(api, source):
    runs = api.pages("/actions/workflows/deploy.yml/runs?branch=develop", "workflow_runs")
    runs = [run for run in runs if run.get("head_branch") == "develop" and run.get("event") in {"push", "workflow_dispatch"}]
    run = latest(runs, "DEV deployment")
    deployed = run["head_sha"]
    if deployed != source:
        comparison = api(f"/compare/{deployed}...{source}")
        require(comparison.get("status") == "ahead", "latest DEV run is not an ancestor of the release")
        files = comparison.get("files")
        require(isinstance(files, list) and len(files) < 300, "DEV comparison is incomplete")
        require(all(administrative_path(file["filename"]) and
                    (not file.get("previous_filename") or administrative_path(file["previous_filename"]))
                    for file in files), "deploy inputs changed since latest DEV run; run DEV Deploy for current develop")
    completed(run, "latest DEV deployment")
    jobs = api.pages(f"/actions/runs/{run['id']}/jobs?filter=latest", "jobs")
    e2e = [job for job in jobs if job.get("name") == "Post-Deploy E2E Tests (DEV)"]
    require(len(e2e) == 1, "DEV E2E job is missing")
    completed(e2e[0], "DEV E2E")
    for name in ("Run Post-Deploy E2E Tests (Public)", "Run Post-Deploy E2E Tests (Admin)"):
        matches = [step for step in e2e[0].get("steps", []) if step.get("name") == name]
        require(len(matches) == 1, f"DEV step missing: {name}")
        completed(matches[0], name)
    for name in ("Deploy Infrastructure (DEV)", "Deploy Admin (DEV)", "Deploy Astro SSG (DEV)"):
        matches = [job for job in jobs if job.get("name") == name]
        allowed = {"success"} if run.get("event") == "workflow_dispatch" else {"success", "skipped"}
        require(len(matches) == 1 and matches[0].get("conclusion") in allowed, f"invalid or partial DEV job: {name}")
    return {"run_id": run["id"], "sha": deployed, "url": run["html_url"]}


def pr_checks(api, pr):
    sha = pr["head"]["sha"]
    checks = api.pages(f"/commits/{sha}/check-runs?filter=latest", "check_runs")
    for filename, name in WORKFLOWS.items():
        runs = api.pages(f"/actions/workflows/{filename}/runs?event=pull_request&head_sha={sha}", "workflow_runs")
        runs = [run for run in runs if run.get("head_sha") == sha and run.get("head_branch") == pr["head"]["ref"]
                and any(item.get("number") == pr["number"] for item in run.get("pull_requests", []))]
        run = latest(runs, filename)
        completed(run, filename)
        matches = [check for check in checks if check.get("name") == name
                   and check.get("check_suite", {}).get("id") == run.get("check_suite_id")
                   and check.get("app", {}).get("id") == 15368]
        require(len(matches) == 1, f"required check is missing or ambiguous: {name}")
        completed(matches[0], name)


def stable(api, state, repository):
    require(ref(api, "develop") == state["source"], "develop changed; wait for the next release")
    require(ref(api, "main") == state["base"], "main changed; recreate release against its new head")
    require(ref(api, state["branch"]) == state["candidate"], "release branch changed")
    pr = api(f"/pulls/{state['number']}")
    require(pr.get("state") == "open" and not pr.get("draft"), "release PR is closed or draft")
    require(pr.get("base", {}).get("ref") == "main" and pr.get("head", {}).get("ref") == state["branch"], "PR branches changed")
    require(all(pr.get(side, {}).get("repo", {}).get("full_name") == repository for side in ("base", "head")), "unexpected repository")
    require(pr["head"].get("sha") == state["candidate"] and pr["base"].get("sha") == state["base"], "PR SHA changed")
    require(pr.get("auto_merge") is None, "native auto-merge reservation is not allowed")
    require(not any(label.get("name") == "no-automerge" for label in pr.get("labels", [])), "no-automerge label")
    require(tree(api, state["candidate"]) == state["tree"], "release content differs from develop")
    ancestor(api, state["base"], state["candidate"])
    ancestor(api, state["source"], state["candidate"])
    protected(api)
    return pr


def prepare(api, repository, run_id, now):
    release_window(now)
    protected(api)
    source, base = ref(api, "develop"), ref(api, "main")
    source_tree = tree(api, source)
    if source_tree == tree(api, base):
        print("No content difference between develop and main; no release")
        return None
    existing = api.pages("/pulls?state=open&base=main")
    require(not existing, "an open main PR already exists; finish or close it before another release")
    evidence = dev_evidence(api, source)
    date = now.astimezone(JST).date().isoformat()
    branch = f"release/weekly-{date}-{run_id}"
    require(ref(api, "develop") == source and ref(api, "main") == base, "source or base changed before preparation")
    api("/git/refs", "POST", {"ref": f"refs/heads/{branch}", "sha": source})
    require(ref(api, branch) == source, "new release branch changed")
    comparison = api(f"/compare/{base}...{source}")
    if comparison.get("status") not in {"ahead", "identical"}:
        api("/merges", "POST", {"base": branch, "head": base, "commit_message": f"Merge main ancestry for weekly release {date}"})
    candidate = ref(api, branch)
    require(tree(api, candidate) == source_tree, "main merge changes develop content; manual reconciliation required")
    ancestor(api, base, candidate)
    ancestor(api, source, candidate)
    require(ref(api, "develop") == source and ref(api, "main") == base, "source or base changed during preparation")
    body = (f"## Weekly production release\n\n"
            f"Promote the tested develop snapshot to main using a merge commit.\n\n"
            f"- develop: `{source}`\n- main before release: `{base}`\n"
            f"- Candidate: `{candidate}`\n- Exact develop tree: `{source_tree}`\n"
            f"- DEV evidence: {evidence['url']} (SHA `{evidence['sha']}`)\n\n"
            f"The controller waits for this PR's latest CI, Security Scan and Dependency Update Security. "
            f"Changes to either source branch, failures, conflicts or the release deadline stop automatic merging. "
            f"Merging starts PRD deployment without human approval. Add `no-automerge` to stop this PR.\n")
    pr = api("/pulls", "POST", {"title": f"chore(release): weekly production release {date}", "head": branch, "base": "main", "body": body})
    state = {"source": source, "base": base, "tree": source_tree, "candidate": candidate,
             "branch": branch, "number": pr["number"], "created_at": now.isoformat(), "dev": evidence}
    print(f"Prepared {pr['html_url']}; candidate {candidate}")
    return state


def ready(api, state, repository):
    pr = stable(api, state, repository)
    dev_evidence(api, state["source"])
    pr_checks(api, pr)
    if pr.get("mergeable") is None:
        raise Pending("GitHub is calculating mergeability")
    require(pr.get("mergeable") is True and pr.get("mergeable_state") == "clean", "release PR is not cleanly mergeable")


def run_release(api, repository, run_id, now_fn=None, sleep_fn=time.sleep):
    now_fn = now_fn or (lambda: datetime.now(timezone.utc))
    state = prepare(api, repository, run_id, now_fn())
    if state is None:
        return
    deadline = now_fn() + timedelta(minutes=45)
    while True:
        require(now_fn() < deadline, "45-minute check deadline exceeded; no auto-merge reservation remains")
        release_window(now_fn())
        try:
            ready(api, state, repository)
            break
        except Pending as error:
            print(str(error), flush=True)
            sleep_fn(30)
    # Repeat all checks immediately before the SHA-guarded, protection-enforced merge.
    ready(api, state, repository)
    stable(api, state, repository)
    release_window(now_fn())
    require(now_fn() < deadline, "release deadline exceeded")
    result = api(f"/pulls/{state['number']}/merge", "PUT", {"sha": state["candidate"], "merge_method": "merge"})
    require(result.get("merged") is True, "GitHub did not merge the release")
    require(tree(api, result["sha"]) == state["tree"], "merged tree differs from verified develop; investigate immediately")
    print(f"Merged PR #{state['number']} as {result['sha']}; PRD Deploy follows via push")


def main():
    repository = os.environ["GITHUB_REPOSITORY"]
    api = GitHub(repository, os.environ["GH_TOKEN"])
    event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
    # Only a first-attempt scheduled run may write. Manual dispatch is read-only.
    enabled = (os.environ.get("WEEKLY_RELEASE_MODE") == "enabled"
               and os.environ.get("GITHUB_EVENT_NAME") == "schedule"
               and event.get("schedule") == "0 0 * * 6"
               and os.environ.get("GITHUB_RUN_ATTEMPT") == "1")
    if not enabled:
        protected(api)
        source, base = ref(api, "develop"), ref(api, "main")
        print(f"READ ONLY: develop={source}, main={base}, content_difference={tree(api, source) != tree(api, base)}")
        evidence = dev_evidence(api, source)
        print(f"DEV evidence: {evidence['url']}, SHA {evidence['sha']}")
        return
    run_id = os.environ["GITHUB_RUN_ID"]
    require(re.fullmatch(r"[0-9]+", run_id), "invalid run id")
    run_release(api, repository, run_id)


if __name__ == "__main__":
    try:
        main()
    except (Blocked, Pending) as error:
        print(f"STOPPED: {error}", flush=True)
        raise SystemExit(1) from None
