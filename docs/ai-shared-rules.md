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
- CI runs `typecheck` on every PR (no gate). Every other component job (Go, Terraform,
  frontend, deploy-scripts) is gated by `scripts/ci/detect-changes.sh ci`'s changed-path
  detection, not PR labels — labels applied by `actions/labeler` are display-only and do
  not drive job selection. The vitest suites for `frontend/admin`, `frontend/public-astro`
  run according to changed paths, independently for each component; shared UI/dependency/
  test infrastructure changes run both. A skipped job does not prove its tests passed.
- `go-functions/go.mod` is the single source of truth for the complete Go patch version.
  CI, deploy, CodeQL, and local deploy read it directly; `scripts/ci/verify-go-toolchain.sh`
  rejects independent workflow version declarations. Run `make -C go-functions lint` rather
  than `golangci-lint run` directly: it checks the active Go patch version and the pinned
  golangci-lint release first, preventing the opaque parser panic caused by an older linter.

- `.husky/scripts/pre-commit-tests.sh` runs tests only for staged `go-functions/`,
  `frontend/admin/`, `frontend/public-astro/` and `scripts/deploy/` paths. A commit that
  touches only `tests/**`, root configs or `.github/**` prints "No testable components
  changed" — that is not a pass; run `bun run test:unit:config` (and the affected spec) yourself.
- Local Playwright configs set `reuseExistingServer`, and other worktrees' sessions may
  already hold the default ports (admin 3001, public 3000). Check with
  `lsof -iTCP:<port> -sTCP:LISTEN` first: a reused server serves another checkout's code.
  For the admin suite pick a free port with `ADMIN_DEV_PORT=<p> ADMIN_BASE_URL=http://127.0.0.1:<p>`;
  the public config has no port override. Stop only servers you started.

## Repository etiquette

- Base branch is `develop`, not `main`, unless the user explicitly requests another base.
- Pushes to `develop` and `main` trigger DEV and PRD deployment workflows respectively.
  Merge/deployment needs explicit authorization for the target. A request to create a PR
  against `develop` counts as that authorization for its merge (see "Authorization and
  completion"). Merging to `main` (PRD) always needs its own explicit request.
- `develop` uses a merge queue and repository auto-merge is disabled, so `gh pr merge`
  fails. Enqueue with the GraphQL `enqueuePullRequest` mutation and pass `expectedHeadOid`
  (the verified head SHA); the queue re-runs the required checks before merging.
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
- Run `bun install --frozen-lockfile` at the root of a new worktree before the first commit.
  husky's hooks directory (`.husky/_`) only exists after it, and without it git runs no
  pre-commit checks and prints nothing.

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
- A request to create a PR against `develop` also authorizes merging it: follow every
  workflow run on the head SHA to completion (a cancelled duplicate is not a result), and
  once `All CI Checks Passed`, `Security Scan Summary` and `Dependency Update Security Gate`
  succeed on an unchanged head, enqueue it (`enqueuePullRequest` with `expectedHeadOid`).
  Follow the queue to the merge and report the resulting DEV Deploy. Do not merge when the
  user asks for a PR only, no merge, or a draft; when a required check fails (fix in-scope
  causes, push and repeat; report external ones); or when the head changed.
- Report changes, checks and outcomes, remaining limitations, and the actual PR/CI state.
  Pending, skipped, blocked, or unrun checks are not success. State external blockers precisely.
- Kiro phase approval remains intentional. Do not start kiro for an ordinary edit unless
  the task needs that workflow. A recorded approval or an explicit user instruction for
  the same phase is sufficient; update spec metadata instead of requesting it again.
- If a skill requires stopping outside the intended boundary, cite the exact file and
  instruction, and distinguish its requirement from your interpretation.

## Real-environment (DEV) E2E

Running `playwright.aws.config.ts` or seeding data against a deployed environment needs
the user's authorization for that environment (see [ai-verification.md](ai-verification.md)).

- DEV only. Before running, confirm the account (`aws sts get-caller-identity`) and that
  `BASE_URL` is the value of `/serverless-blog/dev/cdn/public-url`; abort otherwise. Never PRD.
- Read Basic-auth and `TEST_ADMIN_*` credentials from SSM straight into environment
  variables (commands in `tests/e2e/README.md`). Never echo them; report lengths if needed.
- There is no REST login. Admin sign-in is Amplify SRP / `USER_AUTH` against Cognito and the
  App Client does not allow `USER_PASSWORD_AUTH`. Tooling that needs an admin ID token logs in
  through `AdminLoginPage` and reads sessionStorage `auth_session_token`, as
  `tests/e2e/global-teardown.ts` does. Do not add a login endpoint or auth flow for tooling.
- Data created for verification uses the `[E2E-TEST]` prefix and stays a draft without a
  slug: publishing (or a slug) starts the CodeBuild site rebuild. Delete it afterwards and
  confirm through a second path (API list or DynamoDB), not the deleting tool's own log.
- MSW runs and PR CI never exercise the `VITE_ENABLE_MSW_MOCK=false` code paths
  (`global-setup.ts`, `global-teardown.ts`, AWS branches in specs). A change there is
  unverified until it runs against DEV — say so in the report and PR.

## Research delegation

Research (AWS services, Terraform resources, CDK constructs, error diagnosis) must run
in a separate context so its file reads do not accumulate here. Delegate to a subagent
rather than calling documentation MCP tools directly.
