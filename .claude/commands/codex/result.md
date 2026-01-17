---
description: Import and display completed code review results from Codex CLI.
allowed-tools: Bash, Read, Glob
argument-hint: [request-id]
---

# Import Codex Review Results

<instructions>

## Purpose
Codex CLIで実行されたコードレビューの結果を取得・表示します。

## Execution Steps

### Step 1: Find Completed Responses

IDが指定された場合:
```bash
ls .ai-context/responses/*<id>*.json 2>/dev/null
```

IDが未指定の場合:
```bash
ls -t .ai-context/responses/*.json 2>/dev/null | head -5
```

### Step 2: Validate Response

JSONファイルを読み込み、以下を確認:
- `status` が `completed` であること
- `response` フィールドが存在すること

### Step 3: Parse Response

レスポンスから以下を抽出:
- `response.findings[]` - 個別のレビュー項目
- `response.summary` - 総合評価
- `response.approved` - 承認/要修正

### Step 4: Display Results

```
## Code Review Results

**Request ID**: <id>
**Reviewed by**: Codex (gpt-5.2-codex)
**Status**: <Approved | Needs Changes>
**Completed**: <timestamp>

---

### High Severity Issues

| File | Line | Issue | Suggestion |
|------|------|-------|------------|
| path/to/file.go | 42 | <issue> | <suggestion> |

### Medium Severity Issues

| File | Line | Issue | Suggestion |
|------|------|-------|------------|
| ... | ... | ... | ... |

### Low Severity / Info

| File | Line | Issue | Suggestion |
|------|------|-------|------------|
| ... | ... | ... | ... |

---

### Summary

<response.summary>

---

### Statistics

- High: <count>
- Medium: <count>
- Low: <count>
- Info: <count>
- Total: <total>
```

### Step 5: Offer Actions

```
### Recommended Actions

Would you like me to:
1. Create tasks for each finding
2. Apply suggested fixes automatically
3. Show detailed code context for specific issues

Enter your choice or specify issue numbers to address.
```

## No Results Handling

結果が見つからない場合:
```
## No Review Results Found

No completed reviews found in .ai-context/responses/

### If Using Codex Daemon (Automatic Mode)

Check the right pane in Zellij for:
- "New request detected" - Review is starting
- "Executing review..." - Review in progress
- "Review complete" - Results should be available

Wait a moment and try again: /codex:result <id>

### If Using Manual Mode

Run in Codex CLI:
- /claude:pending-reviews - to see pending requests
- /claude:execute-review <id> - to execute a review

### Create New Review

/codex:review <files> [--focus <area>]
```

## Multiple Results

複数の結果がある場合はリストを表示:
```
## Available Review Results

| ID | Files | Focus | Status | Completed |
|----|-------|-------|--------|-----------|
| abc123 | 3 files | security | completed | 2026-01-15 12:00 |
| def456 | 5 files | all | completed | 2026-01-15 11:30 |

Specify an ID to view details:
/codex:result <id>
```

</instructions>
