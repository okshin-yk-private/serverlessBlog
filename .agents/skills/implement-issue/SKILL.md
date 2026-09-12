---
name: implement-issue
description: 指定されたGitHub Issueに基づいて修正と検証を行う。
---

# implement-issue

Read the [shared workflow](../../../.claude/skills/implement-issue/SKILL.md) and apply it
within the user's authorized scope. Follow repository `docs/ai-shared-rules.md`.
Use Codex-native tools for file, shell, and search operations; ignore Claude-only
frontmatter and resolve arguments from the user's request. Resolve references in
the shared workflow relative to its file, not this adapter.
