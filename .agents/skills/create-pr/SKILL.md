---
name: create-pr
description: 承認された変更をコミット・pushし、develop 向けの PR を作成して auto-merge 予約まで行う。
---

# create-pr

Read the [shared workflow](../../../.claude/skills/create-pr/SKILL.md) and apply it
within the user's authorized scope. Follow repository `docs/ai-shared-rules.md`.
Use available native tools for file, shell, and search operations; ignore Claude-only
frontmatter and resolve arguments from the user's request. Resolve references in
the shared workflow relative to its file, not this adapter.
