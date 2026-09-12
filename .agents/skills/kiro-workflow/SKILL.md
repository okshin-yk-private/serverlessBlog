---
name: kiro-workflow
description: 明示されたkiro仕様作成・設計・タスク実装・検証の依頼を対応手順へ振り分ける。
---

# Kiro workflow

Use only the requested phase. Read `docs/ai-shared-rules.md` and the matching
supporting prompt below. The prompt metadata and slash-command examples describe
arguments, not registered Codex commands; resolve feature/task identifiers from
the request and use available native tools. Do not load every prompt.

| Phase | Supporting prompt |
| --- | --- |
| spec-init | [spec-init](../../../.codex/prompts/kiro-spec-init.md) |
| spec-requirements | [spec-requirements](../../../.codex/prompts/kiro-spec-requirements.md) |
| spec-design | [spec-design](../../../.codex/prompts/kiro-spec-design.md) |
| spec-tasks | [spec-tasks](../../../.codex/prompts/kiro-spec-tasks.md) |
| spec-impl | [spec-impl](../../../.codex/prompts/kiro-spec-impl.md) |
| spec-status | [spec-status](../../../.codex/prompts/kiro-spec-status.md) |
| validate-gap | [validate-gap](../../../.codex/prompts/kiro-validate-gap.md) |
| validate-design | [validate-design](../../../.codex/prompts/kiro-validate-design.md) |
| validate-impl | [validate-impl](../../../.codex/prompts/kiro-validate-impl.md) |
| steering | [steering](../../../.codex/prompts/kiro-steering.md) |
| steering-custom | [steering-custom](../../../.codex/prompts/kiro-steering-custom.md) |

Read steering sections relevant to the task: product for scope, structure for
boundaries, tech for runtime/tooling; custom documents only when their topic applies.
Preserve explicit phase approvals. Complete requested tasks and applicable checks;
do not require another invocation for work already included in the approved request.
