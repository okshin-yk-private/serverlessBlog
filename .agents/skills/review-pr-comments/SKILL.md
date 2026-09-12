---
name: review-pr-comments
description: 指定PRのレビュー指摘を精査し、依頼範囲で修正・返信する。
---

# review-pr-comments

Read the [shared workflow](../../../.claude/skills/review-pr-comments/SKILL.md) and apply it
within the user's authorized scope. Follow repository `docs/ai-shared-rules.md`.
Use Codex-native tools for file, shell, and search operations; ignore Claude-only
frontmatter and resolve arguments from the user's request. Resolve references in
the shared workflow relative to its file, not this adapter.
