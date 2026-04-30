# Security Scanning Operations Guide

This document describes the repository-wide vulnerability scanning system, how to triage findings, how to suppress false positives, and the roadmap for tightening enforcement.

For Terraform-specific tooling details, see [`terraform/docs/SECURITY_TOOLING.md`](../terraform/docs/SECURITY_TOOLING.md).

---

## 1. Scanner Inventory

| Scanner | Layer | Trigger | Severity threshold | Phase 1 mode | Result location | Config |
|---|---|---|---|---|---|---|
| **gitleaks** (pre-commit) | secrets | local commit | all default rules | block on detect | terminal | `.pre-commit-config.yaml`, `.gitleaks.toml` |
| **gitleaks** (CI) | secrets (full history) | PR / push develop·main / weekly / manual | all default rules | non-blocking | Security → Code scanning (`gitleaks`) | `.github/workflows/security-scan.yml`, `.gitleaks.toml` |
| **CodeQL (Go)** | SAST | PR / push / weekly / manual | security-and-quality | non-blocking | Security → Code scanning (`/language:go`) | `.github/workflows/security-scan.yml` |
| **CodeQL (JS/TS)** | SAST | PR / push / weekly / manual | security-and-quality | non-blocking | Security → Code scanning (`/language:javascript-typescript`) | `.github/workflows/security-scan.yml` |
| **Trivy fs** | vuln + secret + IaC + license | PR / push / weekly / manual | HIGH, CRITICAL | non-blocking (`exit-code: 0`) | Security → Code scanning (`trivy-fs`) | `.github/workflows/security-scan.yml`, `.trivyignore` |
| **Trivy config** (pre-commit) | IaC | local commit on `^terraform/` | HIGH, CRITICAL | block on detect | terminal | `.pre-commit-config.yaml`, `.trivyignore` |
| **Checkov** (Terraform) | IaC | PR with `terraform` label | (config-defined) | soft-fail, SARIF uploaded | Security → Code scanning (`checkov-terraform`) | `.github/workflows/ci.yml`, `terraform/.checkov.yaml` |
| **npm audit** | JS dependencies | PR (lint job) | high | `continue-on-error: true` | job log | `.github/workflows/ci.yml` |
| **golangci-lint** | Go static analysis | PR with `go` label | (preset) | blocking | job log | `go-functions/.golangci.yml` |
| **govulncheck** | Go dependencies | PR with `go` label | (Go vuln DB) | `continue-on-error: true` | job log | `.github/workflows/ci.yml` |
| **Dependabot** | dependencies | weekly + on advisory | all severities | PR-based | repo PRs + Insights → Dependency graph | `.github/dependabot.yml` |

Result aggregation: GitHub **Security → Code scanning** is the source of truth for SARIF findings. **Security → Dependabot** lists outstanding dependency advisories.

---

## 2. Triage Workflow

When a finding appears in the Code Scanning tab:

1. **Open the alert** and read the rule description, location, and dataflow.
2. **Reproduce locally** — see [Section 5](#5-local-validation).
3. **Decide one of three outcomes**:
   - **Fix** — write a code change addressing the root cause; reference the alert in the PR description.
   - **Suppress with justification** — see [Section 4](#4-suppression-recipes). All suppressions must include a `# justification:` comment explaining why.
   - **Dismiss as false positive** — use the GitHub UI's "Dismiss alert" with reason; do this only after confirming with another engineer.
4. **Re-run the scan** to confirm the alert is resolved.

**SLA targets** (advisory; not yet enforced):
- CRITICAL: triage within 1 business day
- HIGH: triage within 1 week
- MEDIUM/LOW: review at next sprint planning

---

## 3. Dependabot PR Workflow

Dependabot opens grouped PRs every Monday morning JST plus ungrouped PRs whenever GitHub publishes a security advisory matching this repo.

### Standard review

1. Check the PR description for the changelog excerpt and CVE references.
2. Wait for CI to complete; verify the affected jobs pass.
3. Approve and merge per branch policy (squash for `develop`).

### Bun-specific step (mandatory)

Dependabot uses the `npm` ecosystem for Bun projects (see the note in `.github/dependabot.yml`). It updates `package.json` but **does not regenerate `bun.lock`**. Reviewers must:

```bash
git fetch origin
git checkout dependabot/<branch>
bun install                    # regenerates bun.lock to match the new package.json
git add bun.lock
git commit -m "chore(deps): regenerate bun.lock"
git push
```

CI will re-run; merge once green.

### Auto-merge

**Disabled for now.** Re-evaluate after 4 weeks of observing Dependabot PR cadence and quality (track in an issue).

---

## 4. Suppression Recipes

| Tool | Mechanism | Example |
|---|---|---|
| Trivy | `.trivyignore` (one rule ID per line) | `AVD-AWS-0089  # justification: bucket versioning enforced at module level` |
| Checkov | `terraform/.checkov.yaml` `skip-check` list | `skip-check: [CKV_AWS_018]  # justification: ...` |
| gitleaks | `.gitleaks.toml` `[allowlist]` paths or regexes | already includes AWS canonical example keys |
| CodeQL | inline `// codeql[<rule-id>]` comment | `// codeql[js/disabled-certificate-validation] justification: test-only stub` |
| Dependabot | per-dependency `ignore` block in `.github/dependabot.yml` | `- dependency-name: "lodash"\n  versions: ["4.x"]` |
| npm audit | per-finding `package.json` `overrides` or `bun.lock` resolution pin | (case-by-case) |

**Rule**: every suppression must carry a `justification:` comment naming a compensating control or explaining why the finding is benign in this codebase.

---

## 5. Local Validation

```bash
# All pre-commit hooks (formatters, linters, gitleaks, trivy-config)
pre-commit run --all-files

# Full-history secret scan
gitleaks detect --source . --config .gitleaks.toml --verbose

# Mirror the CI Trivy filesystem scan
trivy fs --severity HIGH,CRITICAL \
  --scanners vuln,secret,misconfig,license \
  --ignorefile .trivyignore .

# Mirror the existing Terraform-scoped Trivy pre-commit hook
trivy config --severity HIGH,CRITICAL --ignorefile .trivyignore terraform/

# Mirror Checkov
checkov --config-file terraform/.checkov.yaml --directory terraform

# Mirror govulncheck
cd go-functions && go run golang.org/x/vuln/cmd/govulncheck@latest ./...

# Mirror npm audit (each frontend project)
( cd frontend/public && npm audit --production --audit-level=high )
( cd frontend/admin  && npm audit --production --audit-level=high )
```

---

## 6. Phase 3 Hard-Fail Roadmap

Phase 1 prioritizes visibility. Once a clean baseline holds for **at least two weeks** of merges, the following changes ship as separate PRs (one per row preferred to keep blast radius small):

| # | Scanner | File / location | Change |
|---|---|---|---|
| 1 | npm audit (public) | `.github/workflows/ci.yml` `lint` job | Drop `continue-on-error: true` from the public-site step |
| 2 | npm audit (admin) | `.github/workflows/ci.yml` `lint` job | Drop `continue-on-error: true` from the admin-dashboard step |
| 3 | govulncheck | `.github/workflows/ci.yml` `go-lint` job | Drop `continue-on-error: true` |
| 4 | Checkov | `.github/workflows/ci.yml` `terraform-security-scan` + `terraform/.checkov.yaml` | Flip `soft_fail`/`soft-fail` to `false` |
| 5 | Trivy fs | `.github/workflows/security-scan.yml` `trivy-fs` job | Change `exit-code: '0'` → `'1'` |
| 6 | gitleaks | `.github/workflows/security-scan.yml` `gitleaks` job | Remove `continue-on-error: true` |

After all six flips, update **branch protection** in the repo settings to require these checks:

- `gitleaks`
- `CodeQL (go)`
- `CodeQL (javascript-typescript)`
- `Trivy (filesystem)`
- `Checkov Security Scan` (already exists)

---

## 7. Maintenance Notes

- **Action SHA pinning**: every action in `security-scan.yml` is pinned by 40-char SHA per the existing convention (see `.github/workflows/ci.yml` line 59 onward). Dependabot's `github-actions` ecosystem will surface SHA-bump PRs weekly.
- **gitleaks `rev` in pre-commit**: pinned to `v8.24.3`. `pre-commit.ci` autoupdate runs weekly — if a future major version (v9+) introduces a breaking change, add a temporary `skip:` entry in `.pre-commit-config.yaml` and pin manually.
- **Astro components**: CodeQL's `javascript-typescript` extractor analyzes the JS chunks emitted by the Astro build but **not** the `.astro` SFC bodies directly. Continue to rely on ESLint and human review there.
- **Trivy ignore file**: comments are mandatory; a finding suppressed without justification will be rejected in code review.
