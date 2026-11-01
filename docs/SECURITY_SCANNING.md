# Security Scanning Operations Guide

GitHub **Security → Code scanning** is the source of truth for SARIF findings.
Dependabot, Bun audit, and govulncheck are complementary sources; one empty view
is not proof that the other dependency trees or deployed versions are safe.

## Scanner inventory

| Scanner                       | Scope                                                       | Findings                                                            | Execution/reporting failures                       | Evidence                                          |
| ----------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------- |
| Gitleaks 8.24.3               | Full reachable Git history of the scanned SHA               | Visible, non-blocking while baseline is reviewed                    | Blocking                                           | Code scanning `gitleaks`, redacted artifact       |
| CodeQL                        | Go and JS/TS source, security-and-quality queries           | Code scanning rules                                                 | Blocking                                           | `/language:go`, `/language:javascript-typescript` |
| Trivy 0.70.0                  | Dependencies (including dev) and secrets, all severities    | High/Critical block; all severities retained                        | Blocking, including missing/malformed SARIF        | `trivy-fs`, SARIF artifact                        |
| Bun audit 1.4.4              | Root, admin, public-astro, deploy scripts; all dependencies | High/Critical block; Moderate/Low remain visible                    | Missing/malformed reports and command errors block | `dependency-audit-*` artifact                     |
| govulncheck 1.8.0             | Go call paths, including standard library                   | Reachable findings (exit 3) block; package-only findings summarized | Other nonzero exits and incomplete reports block   | `govulncheck.txt` artifact                        |
| Checkov                       | Terraform-labeled PRs after fmt succeeds                    | `soft_fail: true`                                                   | Existing CI policy                                 | `checkov-terraform`                               |
| zizmor 1.30.1                 | `.github/` workflows, actions, Dependabot config            | High fails; all findings visible                                    | Blocking                                           | Code scanning `zizmor`                            |
| Local gitleaks / Trivy config | Commit secrets / changed Terraform                          | Blocking per pre-commit config                                      | Blocking                                           | Local output                                      |
| Dependabot                    | Scheduled package version updates                           | PRs                                                                 | Check updater logs                                 | Dependency graph / PRs                            |

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

Dependabot auto-merge has a separate, initially read-only rollout described in
[DEPENDABOT_AUTOMERGE.md](DEPENDABOT_AUTOMERGE.md). Its additional PR gate rejects
new secrets and new/changed High or Critical dependency findings against the PR
base using one Trivy database snapshot. The visibility-first scans below remain
in place; their green summary still does not mean zero findings.

The four JavaScript projects use Dependabot's native `bun` ecosystem and text
`bun.lock`. Review both the manifest and lockfile, then install with
`bun install --frozen-lockfile`, including Dependabot PRs. The old privileged
`pull_request_target` lockfile regeneration workflow has been removed: PR code
and lifecycle scripts no longer execute with a token capable of pushing commits.

Bun version updates are supported, but automatic Bun security-update PRs are not.
Enabling repository-level Dependabot security updates does not change that limit.
Use the four explicit Bun audits and Trivy to find security updates; do not wait
for an automatic PR. Major upgrades are reviewed manually.

The single Thursday `terraform` entry in `.github/dependabot.yml` covers every
root/module directory (`/terraform`, `/terraform/bootstrap`,
`/terraform/examples/complete`, `/terraform/environments/*`,
`/terraform/modules/*`) with `group-by: dependency-name`, so one provider update
opens one PR across all of them instead of one PR per directory (#716, #742).
Grouped Terraform PRs are **not** eligible for the Bun/Go auto-merge controller
(`scripts/ci/dependabot_automerge.py` only recognizes `dependabot/bun/*` and
`dependabot/go_modules/*` branch prefixes); they are reviewed and merged manually
like any other PR.

`/terraform/bootstrap` is included for **lock-file updates only** — a Dependabot
PR there only bumps `terraform/bootstrap/.terraform.lock.hcl`, it does not run
`terraform apply`. `bootstrap` has no remote backend (state is local to whoever
runs it) and manages the S3 bucket that becomes the state backend for every other
Terraform root, so it is applied by hand, not from CI. Before applying a bootstrap
update (or applying bootstrap for the first time in an account), import the
existing bucket resources so the plan does not try to recreate them:

```
cd terraform/bootstrap
AWS_PROFILE=<dev|prd> terraform init
AWS_PROFILE=<dev|prd> terraform import aws_s3_bucket.terraform_state terraform-state-<account-id>
AWS_PROFILE=<dev|prd> terraform import aws_s3_bucket_versioning.terraform_state terraform-state-<account-id>
AWS_PROFILE=<dev|prd> terraform import aws_s3_bucket_server_side_encryption_configuration.terraform_state terraform-state-<account-id>
AWS_PROFILE=<dev|prd> terraform import aws_s3_bucket_public_access_block.terraform_state terraform-state-<account-id>
AWS_PROFILE=<dev|prd> terraform plan
```

After the four imports, `terraform plan` should show only the (as yet unimported)
`aws_s3_bucket_policy` resource as a new addition — not a bucket recreation. Do
this once per AWS account (dev and prd each have their own state bucket and their
own local state, so the import runs separately in each account context).

Sources: [GitHub supported ecosystems](https://docs.github.com/en/code-security/reference/supply-chain-security/supported-ecosystems-and-repositories),
[Bun audit](https://bun.com/docs/install/audit).

## minimatch remediation (#841)

Root and admin use ESLint 10.14.0 and a version-scoped override from minimatch
10.x requests to 11.0.3. ESLint 10 removes the legacy eslintrc path; the unused
eslint-plugin-import dependency is removed. No 3.x consumer is forcibly given
the incompatible 11.x API, and no advisory exception is added.

The override requires Bun 1.4.4 and produces lockfileVersion 3 for root/admin.
Use the pinned Bun for local installs, CI and CodeBuild. The other two lockfiles
remain unchanged and are supported by Bun 1.4.4. CodeBuild's release SHA256 is
updated together with its version; `scripts/ci/verify-bun-version.sh --online`
checks both against the official release.

The ESLint engine update preserves the previous rule policy: @eslint/js 9.39.5
is explicitly pinned, React Hooks 7.1.1 enables the same two Hooks rules, and
the changed `reportGlobalThis` default is explicitly kept at its prior value.
CLI and lint-staged commands select their config explicitly to preserve the
old file selection despite ESLint 10's per-file config lookup. Regression tests
cover complete enabled rule configurations, ignores, diagnostics, glob matching
and typed project-service selection. Reassess these pins and the override when
upstream dependencies adopt minimatch 11; changes to rule policy should be reviewed
separately. This remediation preserves the High/Critical and reachable-Go gates from #840.

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

Terraform scanner exceptions (`terraform/.trivyignore`, the `skip-check` list in
`terraform/.checkov.yaml`) also need a `Review-by: YYYY-MM-DD` line in the comment
block above the ID; inline `#trivy:ignore:` / `#checkov:skip=` need a reason.
`scripts/ci/verify_security_exceptions.py` enforces this on every PR and warns about
an overdue date; the nightly workflow fails until the reason is re-checked and the
date moved forward (#694). A reason that no longer holds is fixed or the exception
removed, not re-dated.

zizmor findings are fixed in the workflow where possible. An accepted finding gets an
inline `# zizmor: ignore[<audit>]` next to a comment explaining why it is safe; see
`dependabot-auto-merge.yml` and `setup-terraform-cached/action.yml`.

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

## Dependency audit follow-up (2026-10-11)

Security Scan run `38095979795` used Go 1.26.6 and x/net v0.59.0.
The dependency baseline now uses Go 1.26.9 and x/net v0.60.0, with regenerated
Go checksums and Bun lockfiles. Bun overrides set minimum versions for
source-map-js 1.2.2, sharp 0.35.5, smol-toml 1.9.1, and
postcss-selector-parser 7.1.6. The selector-parser override crosses a major
version because @tailwindcss/typography 0.5.20 still pins 6.0.10; retain the
admin CSS build check when updating or removing this override.

The http-cache-semantics 4.3.0 override needs a separate interpretation:
[GHSA-ch52-4w7c-c8xp](https://github.com/advisories/GHSA-ch52-4w7c-c8xp)
lists versions through 4.2.0 and no patched version. The maintainer
[disputes the report](https://github.com/kornelski/http-cache-semantics/issues/56),
and the [advisory database discussion](https://github.com/github/advisory-database/issues/10139)
remains unresolved. The 4.3.0 release changes Vary handling and the response
status API, not the disputed max-stale logic. A clean audit after this update
means that the installed version is outside the registered affected range;
it does **not** establish a verified security fix for this advisory.

Astro 7.3.5 uses this dependency in build-time remote-image caching
(`astro/dist/assets/build/remote.js`), calling `storable()` and `timeToLive()`
with newly constructed image requests. The public site uses static output and
restricts remote images to its own `/images/**` path. This bounds the observed
use, but is not a blanket safety claim for future SSR, authenticated image
fetches, or shared response caching. Reassess those changes and the upstream
advisory resolution; do not add a scanner suppression to hide the uncertainty.

Local validation: `bun run verify` passed (admin: 621 passed, 5 skipped;
Astro: 424 passed; deploy: 186 passed; config: 222 passed; Go race tests
passed). Go lint reported zero issues and all 16 Linux ARM64 Lambda builds
passed. Admin lint/build, Typography CSS generation with parser 7.1.6, and
sharp SVG rasterization/resize passed. Astro integration tests passed 147/147
after rebuilding the mock articles with `astro build --force`; the first run
had 20 failures because its build output contained no articles.

All four `bun audit --json` reports were empty with exit code 0, and
govulncheck v1.8.0 reported `No vulnerabilities found.` using Go 1.26.9.
These are local results, not evidence of a deployed update or a new CI run.

## Go 1.26.10 security patch review (2026-10-31)

The earlier Go 1.26.9 scan result above is historical. A fresh govulncheck
v1.8.0 scan with Go 1.26.9 now reports
[GO-2026-6809](https://pkg.go.dev/vuln/GO-2026-6809) in `crypto/x509`, fixed in
Go 1.26.10. Update the single toolchain source, `go-functions/go.mod`, to
1.26.10. CI, Deploy, CodeQL and nightly use `go-version-file`; the Lambda
binary cache keys include go.mod. No dependency versions, scanner suppressions
or enforcement settings are changed by this patch.

Local verification used the actual Go 1.26.10 toolchain, not merely an edited
version declaration. Go lint and race/coverage tests passed. All **17** Lambda
functions from `make print-functions` rebuilt successfully; `go version -m`
confirmed Go 1.26.10, GOOS=linux, GOARCH=arm64 and CGO_ENABLED=0 for every
bootstrap. The build artifacts are ignored local output, not committed.

Source scans with govulncheck v1.8.0 and Go 1.26.10, targeting linux/amd64 and
linux/arm64 with CGO_ENABLED=0, both exited 0 and reported **0 reachable
vulnerabilities**. They still reported these two package-level findings in
`golang.org/x/net v0.61.0`, both fixed in v0.62.0:

| Finding                                              | Affected operation                                                                                                      | Current evidence                                                                                                                                                                                                   |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [GO-2026-6866](https://pkg.go.dev/vuln/GO-2026-6866) | `html.Render`: incomplete checking of ancestor namespace transitions can change the interpretation of rendered raw text | Runtime Markdown uses Goldmark's renderer and bluemonday's tokenizer-based sanitization; the affected x/net Render call was not found in the reviewed runtime paths or the call-path scan                          |
| [GO-2026-6860](https://pkg.go.dev/vuln/GO-2026-6860) | `html.Parse` / `ParseFragment` and option variants: quadratic work coalescing text nodes from adversarial HTML          | The direct Parse call in `internal/markdown/linkbutton_test.go` examines generated test fixtures; runtime bluemonday v1.0.27 uses `html.NewTokenizer`, not this tree parser. No affected runtime call was reported |

These are package-level findings, not a claim that all dependencies are free of
vulnerabilities. Static call analysis has limitations. No application exploit
was demonstrated, and the advisories do not supply a numerical severity score.
Recommend a separate, narrowly scoped x/net v0.62.0 update with Markdown,
sanitizer and link-button regressions; do not silently fold dependency updates
into the standard-library patch or suppress these findings.

The old example path from RenderPost through fmt.Fprintf to Certificate.Verify
is not proof that formatting text verifies certificates: that call writes
string/byte arguments to a bytes.Buffer. Interface-call analysis can overstate
reachability. HTTPS clients still justify patching the standard library rather
than rewriting formatting code to silence a trace.

These results are local validation, not proof of an updated AWS runtime.
Compiled Lambda binaries require a separately approved deployment. That Go-only patch retained the non-blocking policy; the dependency
enforcement below supersedes it.

## Dependency enforcement (2026-10-31)

Bun and Trivy now block High/Critical findings. govulncheck blocks reachable
findings and preserves verbose package-only findings in its report and summary.
All scanner errors, invalid/missing reports, and upload failures remain blocking.
Bun scans all four lockfiles even if an earlier one fails; Go runs independently
of a failed Bun audit. SARIF and raw audit output are uploaded with `always()`.
Trivy intentionally emits all severities with exit zero, then `security_gate.py`
validates the SARIF and enforces High/Critical; this is not a warning-only scan.
Fixture tests cover clean, Moderate/Low, High/Critical, duplicate, malformed,
missing, and tool-error results without introducing vulnerable application code.

The existing required **Security Scan Summary** consumes both scanner jobs and
fails on failure, cancellation, or skips. develop already requires this check,
All CI Checks Passed, and Dependency Update Security Gate. No new required check
or branch-protection change is needed. The separate dependency-diff gate compares
new findings to the base; it does not replace the absolute High/Critical gate.

CodeQL analysis/upload success is not proof that Code scanning has no alerts:
its alert/ruleset evaluation is separate. Existing branch instances, fixed or
historical alerts, and lower-severity findings may remain visible after a green
run. Gitleaks' historical-secret baseline and Terraform Checkov soft-fail policy
are unchanged by this dependency-specific rollout; zizmor already blocks High.

### Scoped dependency remediation

The baseline run 41219080111 contained 35 Bun advisory records, 26 distinct GHSA
IDs (11 High, 11 Moderate, 4 Low). Eight duplicate records described undici's
7.x and 8.x paths; minimatch appeared in two lockfiles. Count distinct advisory
IDs separately from locations, versions, and lockfiles.

Updates retain each runtime dependency's major: markdown-it 14.3.3,
follow-redirects 1.16.2, fast-uri 3.1.9, undici 7.30.1 and 8.12.2, Zod 4.6.6,
and x/net 0.62.0. The deploy-test Vite override requires at least 8.3.3.
Lighthouse remains 13.5.0; Puppeteer Core 25.13.0 (within Lighthouse's ^25.9.0)
uses its own compatible Chromium BiDi/Zod 4 tree, removing Zod 3 without forcing
a Zod major override. The Puppeteer override is a security floor pinned for this
verification; revisit when Lighthouse naturally resolves this or a newer version.
See [Puppeteer manifest](https://registry.npmjs.org/puppeteer-core/25.13.0).

The remaining minimatch advisory
[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)
is Moderate and stays visible, not ignored. ESLint uses 3.x and typescript-eslint
uses 10.x; globally forcing 11.0.1 would change the callable CommonJS API used by
3.x consumers. Follow upstream compatible releases separately. The described
attack requires attacker-controlled glob patterns and optimizationLevel >= 2;
this review does not establish exploitation through the blog's public interface.

Local validation and clean dependency scans do not update running AWS resources.
Merge/deployment remains a separate approval, and successful local scans do not
prove the version of deployed binaries or browser assets.

Validation for this rollout: Bun audit fell to 2 records / 1 distinct Moderate
advisory (minimatch), with zero High/Critical. Linux ARM64 govulncheck with
Go 1.26.10 reports zero reachable and zero package-only findings. Full verification,
Go lint, local Astro fixture build, admin build and four local MSW editor E2E
tests passed. Lighthouse collection exercises the updated Puppeteer tree locally.
These counts describe the database at review time, not a permanent absence of risk.
