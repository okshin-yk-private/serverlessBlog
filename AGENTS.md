# AGENTS.md

Read `docs/ai-shared-rules.md` first; it is the common source for scope, verification,
repository rules, and completion. Keep CLI-specific instructions here.

## Codex discovery

- Start in the Git root containing this file and `package.json`, not its parent.
  From any working directory, `scripts/run-codex.sh` (using its path) starts Codex here.
  In the desktop app, select this Git root as the project directory.
- `.agents/skills/` contains Codex entrypoints. Shared workflows link to
  `.claude/skills/`; keep those bodies CLI-neutral and preserve invocation policies.
  `team-implement` is Claude Code-specific and is not exposed to Codex.
- `$kiro-workflow` routes explicit kiro requests to `.codex/prompts/`. These repository
  prompt files are supporting documents; their presence does not register slash commands.
- In shared workflows, interpret Read/Grep/Glob/Edit/Bash as operations and use available
  native tools. Claude frontmatter and `$ARGUMENTS` are not Codex runtime settings;
  resolve arguments from the user's request. Do not attempt unavailable Claude tools.
- Claude review handoff commands `/codex:review` and `/codex:result` live only in
  `.claude/commands/codex/`; there are no mirrored Codex prompt entries.
- `scripts/sync-ai-docs.ts` maintains MCP/non-kiro command copies, not these entrypoints.
  When changing a kiro workflow, update the Codex prompt, Claude command and agent together.
