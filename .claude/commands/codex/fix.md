---
description: Apply fixes from Codex review using Claude sub-agent, then request re-review.
allowed-tools: Bash, Read, Glob, Write, Task
argument-hint: [request-id] [--skip-review]
---

# Apply Codex Review Fixes

<instructions>

## Purpose
Codexのレビュー結果に基づき、Claude sub-agentで修正を実施します。
修正完了後、自動で再レビューを依頼します。

## Execution Steps

### Step 1: Find Response File

IDが指定された場合:
```bash
ls .ai-context/responses/*<id>*.json 2>/dev/null
```

IDが未指定の場合（最新を使用）:
```bash
ls -t .ai-context/responses/*.json 2>/dev/null | head -1
```

### Step 2: Validate Response

JSONファイルを読み込み、以下を確認:
- `status` が `completed` であること
- `response.findings` が存在すること
- `response.approved` が `false` であること（修正が必要）

### Step 3: Extract Actionable Findings

HIGH と MEDIUM の findings のみを抽出:

```json
{
  "severity": "HIGH|MEDIUM",
  "file": "<path>",
  "line": <number>,
  "issue": "<description>",
  "suggestion": "<recommendation>"
}
```

LOW severity は修正対象外（情報提供のみ）

### Step 4: Launch Sub-agent for Fixes

Task ツールを使用して sub-agent を起動:

```
Task(
  subagent_type="general-purpose",
  description="Fix issues from Codex review",
  prompt="以下のCodexレビュー結果に基づいてコードを修正してください。

## レビュー結果

[findings をリスト形式で記載]

## 修正ルール

1. 各 finding の suggestion に従って修正
2. 修正時は既存のコードスタイルを維持
3. テストが存在する場合は、テストも更新
4. 修正が不要または不可能な場合は理由を説明

## 出力形式

修正完了後、以下の形式で報告:

### 修正したファイル
- <file1>: <変更内容の要約>
- <file2>: <変更内容の要約>

### スキップした項目
- <finding>: <スキップ理由>
"
)
```

### Step 5: Parse Sub-agent Results

sub-agent の結果から修正されたファイルリストを抽出

### Step 6: Create Follow-up Review Request

`--skip-review` が指定されていない場合:

1. 修正されたファイルを対象に新しいレビューリクエストを作成
2. focus は元のレビューと同じ
3. context_summary に「Fix verification for <original-id>」を記載

```json
{
  "id": "<new-uuid>",
  "type": "code_review",
  "created_at": "<timestamp>",
  "source_cli": "claude-code",
  "target_cli": "codex",
  "status": "pending",
  "request": {
    "files": ["<modified-file1>", "<modified-file2>"],
    "focus_areas": ["<original-focus>"],
    "context_summary": "Fix verification for <original-id>"
  },
  "metadata": {
    "original_review_id": "<original-id>",
    "review_type": "fix_verification"
  }
}
```

### Step 7: Display Results

```
## Fix Applied

**Original Review**: <original-id>
**Fixes Applied**: <count> issues addressed
**Sub-agent**: Claude Code (general-purpose)

---

### Modified Files
- <file1>: <summary>
- <file2>: <summary>

### Skipped Items
- <item>: <reason>

---

## Re-review Requested

**New Request ID**: <new-id>
**Files**: <count> files
**Focus**: <focus>

The Codex daemon will automatically execute the verification review.
Run `/codex:result <new-id>` after completion to see results.

---

## Workflow Status

✓ Original review: <original-id>
✓ Fixes applied by sub-agent
→ Verification review: <new-id> (pending)
```

## No Findings Handling

修正対象（HIGH/MEDIUM）がない場合:
```
## No Fixes Required

The review found no HIGH or MEDIUM severity issues.

**Review ID**: <id>
**Status**: Approved
**LOW severity items**: <count> (informational only)

No action needed.
```

## Error Handling

レビュー結果が見つからない場合:
```
## Review Not Found

No completed review found with ID: <id>

Run `/codex:result` to see available reviews.
```

## Options

| Option | Description |
|--------|-------------|
| `--skip-review` | 修正後の再レビューをスキップ |

</instructions>
