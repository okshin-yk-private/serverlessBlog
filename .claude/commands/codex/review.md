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

`.ai-context/requests/` および `.ai-context/responses/` ディレクトリが存在しない場合は作成:
```bash
mkdir -p .ai-context/requests .ai-context/responses
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

### Step 6: Daemon Detection & Inline Execution Fallback

#### Step 6a: Codex CLI の存在確認

```bash
command -v codex >/dev/null 2>&1 && echo "CODEX_AVAILABLE" || echo "CODEX_NOT_FOUND"
```

- `CODEX_NOT_FOUND` の場合: `execution_mode="skipped"`, `skip_reason="codex not found"` として Step 7 へ

#### Step 6b: Daemon起動状態の確認

```bash
pgrep -f "codex-review-daemon" >/dev/null 2>&1 && echo "DAEMON_RUNNING" || echo "DAEMON_NOT_RUNNING"
```

- `DAEMON_RUNNING` の場合: `execution_mode="daemon"` として Step 7 へ（daemonが処理する）
- `DAEMON_NOT_RUNNING` の場合: Step 6c へ（インライン実行）

#### Step 6c: Codex Review インライン実行

`scripts/codex-review-daemon.sh` と同一のプロンプトテンプレートで `codex exec --full-auto` を直接実行する。

リクエストファイルパスを `REQUEST_FILE`、UUIDを `REQUEST_ID` として:

```bash
timeout 300 codex exec --full-auto "You are executing a code review request.

1. Read the review request at: ${REQUEST_FILE}
2. Review ALL files listed in the request with the specified focus areas
3. For each issue found, record: file, line, severity (HIGH/MEDIUM/LOW), category, description, recommendation
4. Create the response file at: .ai-context/responses/${REQUEST_ID}.json

Response JSON structure:
{
  \"id\": \"${REQUEST_ID}\",
  \"type\": \"code_review\",
  \"status\": \"completed\",
  \"request\": <copy from original>,
  \"response\": {
    \"completed_at\": \"<ISO timestamp>\",
    \"reviewer\": \"codex/<model>\",
    \"findings\": [
      {
        \"severity\": \"HIGH|MEDIUM|LOW\",
        \"file\": \"<path>\",
        \"line\": <number>,
        \"code_snippet\": \"<relevant code>\",
        \"issue\": \"<description>\",
        \"suggestion\": \"<recommendation>\",
        \"category\": \"security|performance|architecture|testing\"
      }
    ],
    \"summary\": \"<overall summary>\",
    \"approved\": <true|false>,
    \"specific_answers\": [
      {\"question\": \"<q>\", \"answer\": \"<a>\"}
    ]
  }
}

Execute this review thoroughly and save the results.

IMPORTANT: Output all issue descriptions, suggestions, and summary in Japanese (日本語).
Code snippets, file paths, and severity levels should remain in English."
```

#### Step 6d: レスポンス検証

インライン実行後、レスポンスファイルを検証する:

1. ファイル存在確認:
```bash
test -f ".ai-context/responses/${REQUEST_ID}.json" && echo "RESPONSE_EXISTS" || echo "RESPONSE_MISSING"
```

2. JSON構造バリデーション（ファイルが存在する場合）:
```bash
jq -e '.id and .response.findings' ".ai-context/responses/${REQUEST_ID}.json" >/dev/null 2>&1 && echo "VALID_JSON" || echo "INVALID_JSON"
```

- 両方成功: `execution_mode="inline"` として Step 7 へ
- いずれか失敗: `execution_mode="skipped"`, `skip_reason="inline execution failed"` として Step 7 へ

### Step 7: Display Result (3-Pattern Branching)

`execution_mode` に応じて異なる結果を表示する:

#### Pattern A: `execution_mode="inline"` (インライン実行成功)

レスポンスJSONを読み込み、findingsをseverity別テーブルで直接表示する:

```
## Codex Review Complete (Inline Execution)

**ID**: <uuid>
**Files**: <count> files
**Focus**: <focus areas>
**Reviewer**: <response.reviewer>
**Approved**: <response.approved>

### Summary
<response.summary>

### Findings

#### HIGH Severity
| File | Line | Category | Issue | Suggestion |
|------|------|----------|-------|------------|
| ... | ... | ... | ... | ... |

#### MEDIUM Severity
| File | Line | Category | Issue | Suggestion |
|------|------|----------|-------|------------|
| ... | ... | ... | ... | ... |

#### LOW Severity
| File | Line | Category | Issue | Suggestion |
|------|------|----------|-------|------------|
| ... | ... | ... | ... | ... |

Response saved to: .ai-context/responses/<id>.json
```

findingsが空の場合は「No issues found.」と表示。

#### Pattern B: `execution_mode="daemon"` (Daemon稼働中)

```
## Review Request Created

**ID**: <uuid>
**Files**: <count> files
**Focus**: <focus areas>

Request saved to: .ai-context/requests/<filename>.json

### Next Steps

Codex Review Daemon が稼働中です。自動的にレビューが実行されます。
1. 右ペインで進捗を確認
2. 完了後: `/codex:result <id>` で結果を表示
```

#### Pattern C: `execution_mode="skipped"` (スキップ)

```
## Review Request Created

**ID**: <uuid>
**Files**: <count> files
**Focus**: <focus areas>
**Status**: SKIPPED (<skip_reason>)

Request saved to: .ai-context/requests/<filename>.json

### Next Steps (Manual Mode)

Codex Review が自動実行できませんでした。以下の方法で手動実行できます:

1. Codex CLI をインストール/起動
2. `codex exec --full-auto "Review request at .ai-context/requests/<filename>.json ..."`
3. `/codex:result <id>` で結果を表示

または AI dev environment を起動:
```bash
./scripts/start-ai-dev.sh
```
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
- インライン実行のタイムアウトは300秒

</instructions>
