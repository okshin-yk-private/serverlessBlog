---
description: Save current context and prepare for switching to Codex CLI session.
allowed-tools: Bash, Read, Glob, Write
argument-hint: [--with-task <task-description>]
---

# Switch to Codex CLI

<instructions>

## Purpose
現在のClaude Codeセッションのコンテキストを保存し、Codex CLIでの継続を準備します。

## Execution Steps

### Step 1: Gather Working Files

直近で変更・参照したファイルを特定:

```bash
# 変更中のファイル
git diff --name-only 2>/dev/null
git diff --staged --name-only 2>/dev/null
```

### Step 2: Gather Git Context

```bash
# 現在のブランチ
git branch --show-current

# 直近のコミット
git log --oneline -5 2>/dev/null
```

### Step 3: Generate Conversation Summary

現在の会話から以下を抽出して要約:
- 作業中のタスク
- 行った決定事項
- 現在の状況/ブロッカー

### Step 4: Extract Task List

TodoWriteで管理しているタスクがあれば抽出

### Step 5: Parse Arguments

`--with-task` が指定されている場合:
- タスク説明を `handoff_task` として記録
- Codexに期待する成果を明記

### Step 6: Create Session Context

`.ai-context/` ディレクトリが存在しない場合は作成:
```bash
mkdir -p .ai-context
```

`active-session.json` を作成/更新:

```json
{
  "version": "1.0",
  "created_at": "<first creation timestamp>",
  "updated_at": "<current timestamp>",
  "source_cli": "claude-code",
  "working_files": [
    {
      "path": "<relative path>",
      "reason": "<why this file is relevant>",
      "lines_of_interest": "<optional line range>"
    }
  ],
  "conversation_summary": "<summary of current work>",
  "task_list": [
    {
      "id": "<task id>",
      "description": "<task description>",
      "status": "pending|in_progress|completed"
    }
  ],
  "recent_changes": [
    "<description of recent change>"
  ],
  "pending_questions": [],
  "handoff_task": "<if --with-task specified>",
  "metadata": {
    "branch": "<current branch>",
    "spec_path": "<kiro spec if active>",
    "last_command": "<last significant command>"
  }
}
```

### Step 7: Display Handoff Instructions

```
## Session Saved for Codex

**Context File**: .ai-context/active-session.json
**Updated**: <timestamp>

### Session Summary
<conversation_summary>

### Working Files
- <file1> - <reason>
- <file2> - <reason>

### Active Tasks
- [ ] <task1> (in_progress)
- [ ] <task2> (pending)

### Handoff Task
<handoff_task if specified>

---

## To Continue in Codex CLI

```bash
cd <project-path>
codex "/claude:resume"
```

Codex will load:
- Working files context
- Task status
- Conversation summary
```

## Important Notes

- コンテキストは500語以内に要約
- 機密情報（APIキー、パスワード等）は含めない
- 24時間以上経過したセッションには警告を表示

</instructions>
