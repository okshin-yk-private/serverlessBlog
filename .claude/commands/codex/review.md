---
description: Request code review from OpenAI Codex CLI. Creates review request JSON for cross-CLI review workflow.
allowed-tools: Bash, Read, Glob, Write
argument-hint: <files-or-pattern> [--focus security|performance|architecture|testing|all]
---

# Codex Code Review Request

<instructions>

## Purpose
Codexにコードレビューを依頼するためのリクエストJSONを作成します。
Codex側で `/claude:execute-review` を実行することでレビューが完了します。

## Execution Steps

### Step 1: Parse Arguments

`$ARGUMENTS` から以下を抽出:
- ファイルパス/パターン (必須)
- `--focus` オプション: security, performance, architecture, testing, all (デフォルト: all)

例:
- `cmd/auth/*.go --focus security`
- `go-functions/**/*.go`
- `terraform/modules/lambda/main.tf --focus architecture`

### Step 2: Identify Files to Review

パターンが指定された場合:
```bash
find . -path "./$PATTERN" -type f 2>/dev/null | head -20
```

具体的なファイルの場合:
- ファイルの存在を確認

### Step 3: Gather Context

1. 現在のブランチを取得:
```bash
git branch --show-current
```

2. 直近の変更を取得:
```bash
git diff --name-only HEAD~5 2>/dev/null | head -10
```

3. Kiro spec が有効な場合は spec パスを取得

### Step 4: Generate UUID

```bash
uuidgen 2>/dev/null || cat /proc/sys/kernel/random/uuid
```

### Step 5: Create Review Request

`.ai-context/requests/` ディレクトリが存在しない場合は作成:
```bash
mkdir -p .ai-context/requests
```

以下の形式でJSONを作成:

```json
{
  "id": "<generated-uuid>",
  "type": "code_review",
  "created_at": "<ISO 8601 timestamp>",
  "source_cli": "claude-code",
  "target_cli": "codex",
  "status": "pending",
  "request": {
    "files": ["<file1>", "<file2>", ...],
    "focus_areas": ["<focus>"],
    "specific_questions": [],
    "context_summary": "<current task summary>"
  },
  "metadata": {
    "branch": "<current branch>",
    "spec_path": "<kiro spec if active>"
  }
}
```

ファイル名: `.ai-context/requests/{timestamp}-{uuid}.json`
- timestamp形式: `YYYYMMDD-HHMMSS`

### Step 6: Display Result

```
## Review Request Created

**ID**: <uuid>
**Files**: <count> files
**Focus**: <focus areas>

Request saved to: .ai-context/requests/<filename>.json

### Next Steps (Automatic Mode - Recommended)

If Codex Review Daemon is running (right pane in Zellij):
1. The daemon will automatically detect and execute the review
2. Watch the right pane for progress
3. Run: /codex:result <id> to view results

To start the AI dev environment:
```bash
./scripts/start-ai-dev.sh
```

### Next Steps (Manual Mode)

If not using the daemon:
1. Switch to Codex CLI
2. Run: /claude:pending-reviews
3. Run: /claude:execute-review <id>
4. Return to Claude Code
5. Run: /codex:result <id>
```

## Focus Areas Reference

| Focus | Description |
|-------|-------------|
| security | Input validation, auth, secrets, injection vulnerabilities |
| performance | Algorithm efficiency, query optimization, caching |
| architecture | SOLID principles, separation of concerns, patterns |
| testing | Coverage, edge cases, mocking strategy |
| all | Comprehensive review (default) |

## Important Notes

- レビュー対象ファイルは20件まで
- 大きなファイル（1000行超）は分割レビューを推奨
- バイナリファイルはスキップ

</instructions>
