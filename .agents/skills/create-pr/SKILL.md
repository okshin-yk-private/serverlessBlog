---
name: create-pr
description: 承認された変更をcommit・pushし、develop向けPRを作成する。
---

# create-pr

Read the [shared workflow](../../../.claude/skills/create-pr/SKILL.md) and apply it
within the user's authorized scope. Follow repository `docs/ai-shared-rules.md`.
Use Codex-native tools for file, shell, and search operations; ignore Claude-only
frontmatter and resolve arguments from the user's request. Resolve references in
the shared workflow relative to its file, not this adapter.
