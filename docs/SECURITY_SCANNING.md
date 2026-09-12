# Security Scanning Operations Guide

GitHub **Security → Code scanning** is the source of truth for SARIF findings.
Dependabot, Bun audit, and govulncheck are complementary sources; one empty view
is not proof that the other dependency trees or deployed versions are safe.

## Scanner inventory

| Scanner | Scope | Findings | Execution/reporting failures | Evidence |
| --- | --- | --- | --- | --- |
| Gitleaks 8.24.3 | Full reachable Git history of the scanned SHA | Visible, non-blocking while baseline is reviewed | Blocking | Code scanning `gitleaks`, redacted artifact |
| CodeQL | Go and JS/TS source, security-and-quality queries | Code scanning rules | Blocking | `/language:go`, `/language:javascript-typescript` |
| Trivy 0.70.0 | Dependencies (including dev) and secrets, all severities | Visible, non-blocking during baseline review | Blocking | `trivy-fs`, SARIF artifact |
| Bun audit 1.3.11 | Root, admin, public-astro, deploy scripts; all dependencies | Warning plus JSON artifact | Missing/malformed reports and command errors block | `dependency-audit-*` artifact |
| govulncheck 1.8.0 | Go call paths, including standard library | Exit 3 produces a warning and report | Other nonzero exits block | `govulncheck.txt` artifact |
| Checkov | Terraform-labeled PRs after fmt succeeds | `soft_fail: true` | Existing CI policy | `checkov-terraform` |
| Local gitleaks / Trivy config | Commit secrets / changed Terraform | Blocking per pre-commit config | Blocking | Local output |
| Dependabot | Scheduled package version updates | PRs | Check updater logs | Dependency graph / PRs |

The weekly Security Scan resolves **develop and main to immutable SHAs**, then
scans each separately. PRs scan the event merge SHA; pushes and manual runs scan
the event SHA. Every CodeQL/SARIF upload supplies both ref and SHA. Artifact names
are distinct per target, while SARIF categories stay stable. Markdown-only PRs
are scanned because documentation can contain credentials.

Gitleaks uses `--log-opts="--full-history HEAD"`: a branch report represents that
branch's reachable history, rather than silently including every fetched branch.
Reports use `--redact=100`; do not print secret snippets or raw report contents.

The Security Scan Summary fails if target selection, a scanner, or an upload
fails or is skipped. A green summary means the scanners finished; **it does not
mean zero vulnerabilities**. Check all reports and current-head alerts before
releasing. Trivy filesystem scanning does not run IaC or license checks here;
Checkov and local Trivy config cover separate scopes. AWS live state is not scanned.

## Dependency updates

The four JavaScript projects use Dependabot's native `bun` ecosystem and text
`bun.lock`. Review both the manifest and lockfile, then install with
`bun install --frozen-lockfile`, including Dependabot PRs. The old privileged
`pull_request_target` lockfile regeneration workflow has been removed: PR code
and lifecycle scripts no longer execute with a token capable of pushing commits.

Bun version updates are supported, but automatic Bun security-update PRs are not.
Enabling repository-level Dependabot security updates does not change that limit.
Use the four explicit Bun audits and Trivy to find security updates; do not wait
for an automatic PR. Major upgrades are reviewed manually.

Sources: [GitHub supported ecosystems](https://docs.github.com/en/code-security/reference/supply-chain-security/supported-ecosystems-and-repositories),
[Bun audit](https://bun.com/docs/install/audit).

## Triage and exceptions

1. Confirm scanner, ref, SHA, location, affected version, and publication date.
2. Trace the relevant input/API path. Package inclusion is not proof of exploitability.
3. Fix and run affected tests/builds. Regenerate lockfiles; do not hand-edit integrity values.
4. Re-scan the same final SHA and inspect uploads. A skipped test or upload is not success.
5. For a false positive, retain evidence before a narrow suppression or human-reviewed dismissal.

Every exception needs a `justification:` comment. Prefer rule-specific path **AND**
exact-value-shape conditions over directory-wide exclusions. `.gitleaks.toml`
only adds exceptions for 21 historical CDK archive hashes and five literally
truncated Rust JWT fixtures. A different value, key, or path is not exempt.
The historical Basic authentication alert **#424 remains detectable**.

Never dismiss a credential as a false positive just because it was removed from
current files. Rotation/revocation and propagation to the actual verifier must
be established first. Do not try leaked values against a live login endpoint.

The delete-handler cleanup warning uses a JSON logger and quotes control characters
inside the `postId` field. Normal IDs remain unchanged, and anomalous IDs can be
decoded without losing evidence. This also keeps extracted plain-text log fields
safe from line injection. The regression test checks both a single JSON event and
reversible escaping after JSON parsing.

## Local verification

```bash
bun run verify
# Run in each of: ., frontend/admin, frontend/public-astro, scripts/deploy
bun audit --json

# Within go-functions, using its go.mod toolchain:
go run golang.org/x/vuln/cmd/govulncheck@v1.8.0 ./...

# Full history, with secret redaction:
gitleaks detect --source . --config .gitleaks.toml \
  --redact=100 --log-opts="--full-history HEAD"

# Match the CI dependency/secret scope; keep findings visible:
trivy fs --scanners vuln,secret --include-dev-deps --ignorefile .trivyignore .
# IaC is a separate scope:
trivy config --severity HIGH,CRITICAL --ignorefile .trivyignore terraform/
```

For dependency changes run builds and relevant E2E in addition to `bun run verify`.
Use the mock API build script for Astro and MSW for local admin E2E. Add frontend,
go, deploy-scripts, or workflow labels as appropriate; labels can select CI suites.
DEV and PRD deployment still require explicit authorization for the target.

## Remaining issues as of 2026-09-12

- **Historical credential #424:** on 2026-09-12, a read-only in-memory comparison
  confirmed that the current DEV SSM password differs from the historical value.
  Both associated LIVE verifiers (PublicCombinedFunction-dev and
  AdminCombinedFunction-dev) match SSM and reject a different credential via their
  authentication guard. The distribution is Deployed. The historical value was
  not sent to the public endpoint. Reuse outside this DEV environment is still
  awaiting owner confirmation; do not classify the original leak as a false positive.
  PR #227's two exposed values were redacted. Git history remains. See
  `DEV_BASIC_AUTH.md` for any further rotation steps.
- **extract-zip High advisories:** the unpatched package has been removed from the
  dependency tree by replacing LHCI with Lighthouse 13.4.1. This addresses
  [GHSA-jmr9-qjv8-65gv](https://github.com/advisories/GHSA-jmr9-qjv8-65gv) and
  [GHSA-7pqw-9j4j-h8q3](https://github.com/advisories/GHSA-7pqw-9j4j-h8q3)
  without suppressing the findings or forcing incompatible transitive overrides.
- Existing React Router RSC exception in `.trivyignore` remains separate from the
  dependency updates. Re-evaluate it if the application starts using RSC.

## Local Lighthouse collection

In `frontend/public-astro`, run `bun run lighthouse:collect` after building.
Both `lighthouse` and `lighthouse:collect` now collect local static pages using
Lighthouse 13, Node >=22.19, and an existing Chrome installation. Set `CHROME_PATH`
if Chrome is not auto-detected. No browser download is performed.

The server binds to loopback, audits HTML pages except `404.html`, and saves an
HTML/JSON report pair per page under ignored `lighthouse-results/`. Use
`--dist <directory>` or `--output <directory>` to override paths. Missing builds,
missing Chrome, and Lighthouse runtime errors fail the command. Static-server
path escape handling is covered by the config tests.

This replaces LHCI's `autorun` with local collection. There was no repository LHCI
assertion/upload configuration or CI caller. No temporary-public-storage upload
is performed. Scores from Lighthouse 13 must not be treated as directly comparable
to Lighthouse 12; establish a new baseline before adding score gates.

Source: [Lighthouse 13.4.1 API and runtime requirements](https://github.com/GoogleChrome/lighthouse/tree/v13.4.1).

## Enforcement rollout

Scanner and upload failures block now. Findings remain non-blocking during
baseline review so an unrevoked historical credential or unpatched upstream
library is not silently hidden to make CI green.

After a reviewed baseline and two weeks of stable scans, separately enable gates
for new secrets and new Critical/High dependency findings, then tighten existing
findings with explicit, expiring exceptions if needed. Require **Security Scan
Summary** in branch protection only after validating its live behavior. Record
remaining upstream/operational risks rather than interpreting the waiting period
as approval to accept them. Monitoring main on a schedule prevents new advisories
from being missed between production releases.
