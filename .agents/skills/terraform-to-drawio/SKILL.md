---
name: terraform-to-drawio
description: >-
  Terraform または OpenTofu の AWS 定義（HCL・modules・environments）から、編集可能な draw.io（.drawio / diagrams.net）形式の AWS アーキテクチャ構成図を新規作成・最新化・再生成するときに使う。対象外: terraform validate/fmt/plan、HCL 変更、Mermaid/ASCII 図解、既存 .drawio の構文チェックのみ。
---

# terraform-to-drawio

Read the [shared workflow](../../../.claude/skills/terraform-to-drawio/SKILL.md) and apply it
within the user's authorized scope. Follow repository `docs/ai-shared-rules.md`.
Use available native tools for file, shell, and search operations; ignore Claude-only
frontmatter and resolve arguments from the user's request. Resolve references in
the shared workflow relative to its file, not this adapter.
