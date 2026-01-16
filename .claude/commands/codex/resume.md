---
description: Resume a session transferred from Codex CLI. Loads serialized context and continues work.
allowed-tools: Bash, Read, Glob
argument-hint: [session-file]
---

# Resume Session from Codex

<instructions>

## Purpose
Codex CLIから引き継いだセッションを再開します。保存されたコンテキストを読み込み、作業を継続します。

## Execution Steps

### Step 1: Load Session Context

デフォルトのセッションファイルを読み込み:
```bash
cat .ai-context/active-session.json 2>/dev/null
```

カスタムファイルが指定された場合はそちらを読み込み

### Step 2: Validate Session

JSONを検証:
- `version` フィールドが存在すること
- `source_cli` が `codex` であること（Codexからの引き継ぎの場合）

### Step 3: Check Session Age

`updated_at` を確認し、24時間以上経過している場合は警告:
```
Warning: This session is over 24 hours old.
Some context may be outdated.
```

### Step 4: Load Working Files

`working_files` の各ファイルを確認:
- ファイルが存在するか
- `lines_of_interest` があれば該当範囲を読み込み

### Step 5: Display Restored Context

```
## Session Resumed from Codex

**Last Updated**: <updated_at>
**Branch**: <metadata.branch>
**Source**: Codex CLI

---

### Context Summary

<conversation_summary>

---

### Working Files

| File | Reason | Lines |
|------|--------|-------|
| <path> | <reason> | <lines_of_interest> |

---

### Task Status

| Status | Task |
|--------|------|
| in_progress | <task description> |
| pending | <task description> |
| completed | <task description> |

---

### Recent Changes (in Codex)

- <change1>
- <change2>

---

### Codex Session Notes

<codex_session_notes if present>

---

Ready to continue. What would you like to work on?
```

### Step 6: Check for Completed Reviews

Codexで完了したレビューがあるか確認:
```bash
ls .ai-context/responses/*.json 2>/dev/null | wc -l
```

結果がある場合:
```
Note: There are completed reviews from Codex.
Run /codex:result to view them.
```

## No Session Found

セッションファイルが見つからない場合:
```
## No Session Found

No active session file found at .ai-context/active-session.json

### To Create a New Session

1. In Codex CLI, run: /claude:switch
2. Then return here and run: /codex:resume

### Or Start Fresh

Continue working in this Claude Code session.
```

## Session Validation Errors

JSONが不正な場合:
```
## Session File Error

The session file appears to be corrupted or invalid.

Error: <specific error>

### Recovery Options

1. Delete the file and create a new session:
   rm .ai-context/active-session.json

2. Check if there are backup sessions in .ai-context/
```

</instructions>
