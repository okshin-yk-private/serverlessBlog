# AI Shared Rules

Single source of truth for rules that apply to every AI coding agent working in
this repository. `CLAUDE.md` (Claude Code) and `AGENTS.md` (Codex CLI) both point
here — edit this file, not the copies.

## Commands

| Purpose | Command |
| --- | --- |
| Full verification | `bun run verify` |
| Lint / format | `bun run lint` / `bun run format:check` |
| Type check | `bun run typecheck` (admin, public, public-astro) |
| Unit tests | `bun run test:unit` (vitest) |
| Go Lambda tests | `bun run test:go` (`go-functions/Makefile`) |
| E2E | `bun run test:e2e` / `bun run test:e2e:admin` |
| Terraform | `cd terraform/environments/dev && terraform validate` |
| Secret scan | `pre-commit run gitleaks --all-files` |

Run `bun run verify` before reporting a code change as done.

## Environment quirks

- Use `bun`, not `npx`, for Node packages and scripts.
- There is no root `test` script. Unit tests live per package: `frontend/admin`,
  `frontend/public`, `frontend/public-astro` (vitest) and `go-functions` (`make test`).
- The root `eslint.config.js` ignores `frontend/**`; `frontend/admin` has its own config.
  `frontend/public` and `frontend/public-astro` are currently not covered by ESLint —
  Prettier (root glob) is the only automated style check there.
- CI runs `typecheck` on every PR (no label gate). The vitest suites for `frontend/admin`,
  `frontend/public` and `frontend/public-astro` run only on PRs carrying the `frontend`
  label, so a PR outside those paths still needs `bun run verify` locally.

## Repository etiquette

- Base branch is `develop`, not `main`.
- Branch naming: `fix/issue-<N>` / `feat/issue-<N>`.
- Never commit secrets. Triage Code Scanning alerts via the GitHub Security tab —
  see `docs/SECURITY_SCANNING.md`.

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

## Research delegation

Research (AWS services, Terraform resources, CDK constructs, error diagnosis) must run
in a separate context so its file reads do not accumulate here. Delegate to a subagent
rather than calling documentation MCP tools directly.
