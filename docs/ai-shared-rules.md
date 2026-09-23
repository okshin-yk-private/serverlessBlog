# AI Shared Rules

Single source of truth for rules that apply to every AI coding agent working in
this repository. `CLAUDE.md` (Claude Code) and `AGENTS.md` (Codex CLI) both point
here — edit this file, not the copies.

## Commands

| Purpose | Command |
| --- | --- |
| Full verification | `bun run verify` |
| Lint / format | `bun run lint` / `bun run format:check` |
| Type check | `bun run typecheck` (admin, public-astro) |
| Unit tests | `bun run test:unit` (Vitest and Bun) |
| Go Lambda tests | `bun run test:go` (`go-functions/Makefile`) |
| E2E | `bun run test:e2e` / `bun run test:e2e:admin` |
| Terraform | `cd terraform/environments/dev && terraform validate` |
| Secret scan | `pre-commit run gitleaks --all-files` |
| Local tool check | `bun run doctor` |

Choose checks using [ai-verification.md](ai-verification.md). Run the affected
checks, fix failures caused by the requested change, and rerun those checks without
asking again. Do not repeat successful checks unless later changes invalidate them.
Full verification remains required for cross-component application changes or when
the impact cannot be bounded; it does not include E2E or Terraform verification.

## Environment quirks

- Use `bun`, not `npx`, for Node packages and scripts.
- `bun run verify` first runs `deps:sync` (`bun install --frozen-lockfile` in the four
  packages), so stale `node_modules` after pulling no longer surface as missing-module
  errors. `bun run doctor` checks tool presence and the Bun/Go/Terraform versions CI uses.
- Agents run with `STRICT_LOCAL_CHECKS=1` (`.claude/settings.json`, `scripts/run-codex.sh`):
  a commit fails instead of silently skipping terraform validate / trivy / gitleaks when
  neither `pre-commit` nor `uvx` is available. Do not unset it to get a commit through.
- Every `.terraform.lock.hcl` records `h1:` hashes for `linux_amd64` (CI) and `darwin_arm64`
  (local), so `terraform init` on either does not rewrite it; Dependabot keeps the platforms
  it finds. For a new provider or lock directory run
  `terraform providers lock -platform=linux_amd64 -platform=darwin_arm64`.
- There is no root `test` script. Unit tests live per package: `frontend/admin`,
  `frontend/public-astro` (vitest), `scripts/deploy`, `tests/config` (bun test),
  and `go-functions` (`make test`).
- The root `eslint.config.js` ignores `frontend/**`; `frontend/admin` has its own config.
  `frontend/public-astro` is currently not covered by ESLint —
  Prettier (root glob) is the only automated style check there.
- CI runs `typecheck` on every PR (no label gate). The vitest suites for `frontend/admin`,
  `frontend/public-astro` run according to changed paths, independently for each
  component; shared UI/dependency/test infrastructure changes run both. Other
  component jobs still use labels. A skipped job does not prove its tests passed.
- `go-functions/go.mod` is the single source of truth for the complete Go patch version.
  CI, deploy, CodeQL, and local deploy read it directly; `scripts/ci/verify-go-toolchain.sh`
  rejects independent workflow version declarations. Run `make -C go-functions lint` rather
  than `golangci-lint run` directly: it checks the active Go patch version and the pinned
  golangci-lint release first, preventing the opaque parser panic caused by an older linter.

## Repository etiquette

- Base branch is `develop`, not `main`, unless the user explicitly requests another base.
- Pushes to `develop` and `main` trigger DEV and PRD deployment workflows respectively.
  Merge/deployment needs explicit authorization for the target; PR creation does not grant it.
- Branch naming: `fix/issue-<N>` / `feat/issue-<N>`.
- Never commit secrets. Triage Code Scanning alerts via the GitHub Security tab —
  see `docs/SECURITY_SCANNING.md`.

## Checkout freshness and worktrees

- Before reviewing code, investigating a bug or filing an issue, run `git fetch origin`
  and check `git rev-list --left-right --count HEAD...origin/develop`. If HEAD is behind,
  base findings on `origin/develop` (read files with `git show origin/develop:<path>` or
  work in a fresh worktree), not on the local checkout. A review once ran 108 commits
  behind and reported four problems that were already fixed.
- Before filing an issue, confirm the cited code still exists on `origin/develop` and
  search existing issues, closed ones included: `gh issue list --state all --search "<keywords>"`.
- Several sessions may share the main checkout. Agents do not switch branches there; each
  issue gets its own worktree: `git worktree add .claude/worktrees/<name> -b <branch> origin/develop`.
  Leave the main checkout on whatever branch it is on, and remove the worktree after the
  PR merges (`git worktree remove <path>`).

## Language

Think in English, respond to the user in Japanese. Markdown written into project
files (requirements.md, design.md, tasks.md, research.md, validation reports) uses
the language configured in that spec's `spec.json.language`.

## Spec-driven development (kiro)

- Steering (`.kiro/steering/`) — project-wide rules and context.
- Specs (`.kiro/specs/`) — per-feature requirements → design → tasks.
- Steering files are large; read them on demand (the `kiro` commands load what they
  need themselves). Do not preload the directory.
- Workflow: `spec-init` → `spec-requirements` → `spec-design` → `spec-tasks` →
  `spec-impl`, with `validate-gap` / `validate-design` / `validate-impl` as optional
  checks and `spec-status` at any time.
- Human review is required at each phase boundary; `-y` is for intentional fast-track only.

## Authorization and completion

- Follow the user-approved scope through implementation, applicable verification,
  and correction of failures caused by the change. Ask only when missing information
  materially changes scope, externally visible behavior, or safe execution.
- Skills do not grant additional authority. Prior approval remains valid for the same
  scope; routine local edits/checks do not need repeated approval. Preserve unrelated work.
- An implementation request ends after the requested change and checks. A request to
  commit/push/create a PR includes those actions. If CI confirmation was requested,
  follow the required jobs on the current head SHA to completion, repairing in-scope failures.
- Report changes, checks and outcomes, remaining limitations, and the actual PR/CI state.
  Pending, skipped, blocked, or unrun checks are not success. State external blockers precisely.
- Kiro phase approval remains intentional. Do not start kiro for an ordinary edit unless
  the task needs that workflow. A recorded approval or an explicit user instruction for
  the same phase is sufficient; update spec metadata instead of requesting it again.
- If a skill requires stopping outside the intended boundary, cite the exact file and
  instruction, and distinguish its requirement from your interpretation.

## Research delegation

Research (AWS services, Terraform resources, CDK constructs, error diagnosis) must run
in a separate context so its file reads do not accumulate here. Delegate to a subagent
rather than calling documentation MCP tools directly.
