---
name: implement-issue
description: >-
  Issue 番号（#N）や GitHub Issue の URL が示され、単一 Issue に基づくコード修正・機能実装を求められたときに使う。Issue 本文とコメントを読み取り、専用 worktree で TDD と検証まで一貫して進める。対象外: Issue の起票・一覧・要約のみ、PR 作成、PR レビュー対応、複数 Issue の並列実装。
---

# implement-issue

Read the [shared workflow](../../../.claude/skills/implement-issue/SKILL.md) and apply it
within the user's authorized scope. Follow repository `docs/ai-shared-rules.md`.
Use available native tools for file, shell, and search operations; ignore Claude-only
frontmatter and resolve arguments from the user's request. Resolve references in
the shared workflow relative to its file, not this adapter.
