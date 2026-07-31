# AGENTS.md

**Read `docs/ai-shared-rules.md` first.** It holds the commands, environment quirks,
repository etiquette, language rule, kiro spec workflow, and research-delegation policy
that apply to every agent in this repository. This file only adds Codex-specific notes.

Do not duplicate the shared rules here — they drifted out of sync once already.

## Codex specifics

- Prompts live in `.codex/prompts/`; configuration in `.codex/config.toml`.
- The Claude Code equivalents of these prompts are `.claude/commands/` and
  `.claude/skills/`. When a workflow changes, update both.
- Cross-CLI review handoff: `/codex:review` (request) and `/codex:result` (import) on
  the Claude Code side, mirrored by the `.codex/prompts/` entries here.
