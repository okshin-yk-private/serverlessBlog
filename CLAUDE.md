@docs/ai-shared-rules.md

# Claude Code specifics

The rules above (commands, repository etiquette, language, kiro workflow) are shared
with other agents. What follows applies to Claude Code only.

## Research

Delegate research to the matching subagent so documentation reads stay out of this
context: `/investigate-aws`, `/investigate-terraform`, `/investigate-cdk`. Do not call
`aws-mcp` / `terraform-mcp-server` documentation tools directly from the main session.

## Skills

Invoke by name; each carries its own workflow.

- `/create-issue`, `/implement-issue`, `/create-pr`, `/review-pr-comments` — GitHub loop
- `/team-implement` — parallel TDD across issues (details in the skill)
- `/terraform-to-drawio` — architecture diagrams from Terraform
- `/kiro:*` — spec-driven development commands
- `/codex:review`, `/codex:fix` — cross-CLI review via Codex

## Hooks

`.claude/hooks/lint-edited-file.sh` runs on every `Edit`/`Write` of a `.ts`/`.tsx` file:
it applies `eslint --fix` and reports back only what it could not fix. Commit-time
checks (terraform fmt/validate/trivy, per-component tests) live in `.husky/pre-commit`.
