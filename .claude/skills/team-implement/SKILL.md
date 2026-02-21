---
name: team-implement
description: 複数のGitHub Issueを並列TDD実装する（Commander + Executor Agent Teams）
argument-hint: <Issue番号1> <Issue番号2> ... [-y]
---

# Team Implement: 並列Issue実装ワークフロー

複数のGitHub Issueを **Agent Teams** で並列にTDD実装するCommanderワークフロー。
各IssueはExecutor teammateが独立したGit worktreeで実装し、Commanderが全体を統括する。

## 前提

- 引数 `$ARGUMENTS` に1つ以上のIssue番号がスペース区切りで渡される
- `-y` フラグが付いている場合、実行計画の確認をスキップする
- 環境変数 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` が設定済みであること
- ベースブランチ: `origin/develop`

## Phase 1: Issue情報取得 & コンフリクト分析

### 1a. 全Issueの情報を並列取得

各Issueに対して並列で実行:

```bash
gh issue view <Issue番号> --json title,body,number,labels,comments
```

各Issueから以下を抽出:
- タイトル
- 修正方針
- 対象ファイル（「対象ファイル」セクションのバッククォート囲みパス）
- ラベル（`bug` の有無でブランチ名を決定）

### 1b. コンフリクト検出（Two-Layer）

**Layer 1 - 構造化抽出:**
`scripts/analyze-issue-conflicts.sh` を実行し、Issue本文の「対象ファイル」セクションからファイルパスを抽出する。

```bash
bash scripts/analyze-issue-conflicts.sh <Issue番号1> <Issue番号2> ...
```

**Layer 2 - AI分析:**
各Issueの本文・修正方針を読み、「対象ファイル」に明記されていないが影響を受ける可能性のあるファイルを推測する:
- 共有ユーティリティ（`go-functions/internal/util/` 等）
- テストヘルパー
- 設定ファイル（`terraform/modules/*/variables.tf` 等）
- インポート元のパッケージ

### 1c. コンフリクトマトリクス構築

全Issueのファイルリスト（Layer 1 + Layer 2）を突き合わせ、コンフリクトマトリクスを作成:

| | Issue A files | Issue B files | Issue C files |
|---|---|---|---|
| Conflict? | - | A∩B = {} | A∩C = {posts.go} |

**コンフリクト解決ルール:**
1. **同一ファイルを複数Issueが編集** → 逐次実行（`blockedBy` 依存）
2. **同一ディレクトリ、別ファイル** → 並列実行
3. **完全独立** → 完全並列

## Phase 2: 実行計画の提示

以下の形式でユーザーに実行計画を提示する:

```
## 実行計画

### 並列グループ 1（同時実行）
- #42: <タイトル> → fix/issue-42
  対象: go-functions/internal/handler/posts.go
- #57: <タイトル> → feat/issue-57
  対象: go-functions/internal/handler/auth.go

### 逐次グループ（#42完了後）
- #63: <タイトル> → fix/issue-63
  対象: go-functions/internal/handler/posts.go, terraform/modules/api/main.tf
  ⚠️ #42とposts.goが競合 → #42完了後に実行

最大同時実行: 3 Executors
```

`-y` フラグがない場合、ユーザーの承認を待つ。

## Phase 3: TaskList作成

TaskCreateで各Issueのタスクエントリを作成する。コンフリクトがある場合は `blockedBy` で依存関係を設定する。

## Phase 4: Executor Teammateの生成

**ブロックされていないタスクから順に**、最大3つまで同時にExecutor teammateを生成する。

各Executorの生成時に渡す情報:

```
Task(
  subagent_type="general-purpose",
  isolation="worktree",
  prompt="""
  あなたはExecutor Agentです。以下のGitHub Issueを TDD で実装してください。

  ## Issue情報
  Issue番号: #<N>
  タイトル: <title>
  本文:
  <body>

  コメント:
  <comments>

  ## 実装ルール
  1. ブランチ名: <fix/issue-N or feat/issue-N>
  2. ベースブランチ: origin/develop
  3. TDDプロトコル厳守: RED → GREEN → REFACTOR
  4. Conventional Commitsでコミット
  5. テストコマンド:
     - Go: cd go-functions && go test ./... -v
     - Frontend Admin: cd frontend/admin && bun run test:coverage
     - Frontend Public: cd frontend/public && bun run test:coverage
     - Terraform: cd terraform && terraform fmt -check -recursive && terraform validate
  6. フォーマッター:
     - Go: cd go-functions && gofmt -w .
     - Frontend: bun run format:check
     - Terraform: terraform fmt -recursive
  7. 完了後、ブランチをpush: git push -u origin <branch-name>

  ## 完了報告形式
  以下の形式で報告:
  - Issue番号とタイトル
  - ブランチ名
  - 変更ファイル一覧
  - テスト結果（件数、成否）
  - コミット一覧
  """
)
```

**制約:**
- 最大同時Executor数: **3**（API rate limit考慮）
- 各Executorは `isolation: "worktree"` で独立したworktreeで動作

## Phase 5: 進捗監視 & 逐次タスクのアンブロック

- TaskListを定期的に確認し、完了したタスクを検出
- ブロックされていたタスク（`blockedBy`）の前提が完了したら、新しいExecutorを生成
- 全タスクが完了するまで監視を継続

## Phase 6: PR作成

各完了Issueに対して `gh pr create` を実行:

```bash
gh pr create \
  --base develop \
  --head <branch-name> \
  --title "<type>(<scope>): <summary>" \
  --body "$(cat <<'EOF'
## Related Issue
Closes #<Issue番号>

## Summary
<変更内容の要約>

## Test plan
<テストの実行方法>

🤖 Generated with [Claude Code](https://claude.com/claude-code) Agent Teams
EOF
)"
```

## Phase 7: サマリーレポート

全Issueの実装結果を以下の形式で報告:

```
## Team Implement 完了レポート

| Issue | タイトル | ステータス | ブランチ | PR |
|-------|---------|-----------|---------|-----|
| #42 | Fix posts handler | ✅ SUCCESS | fix/issue-42 | #XXX |
| #57 | Add auth feature | ✅ SUCCESS | feat/issue-57 | #YYY |
| #63 | Fix posts & API | ✅ SUCCESS | fix/issue-63 | #ZZZ |

### コンフリクト解決
- #63は#42完了後に逐次実行（posts.go競合）

### 統計
- 総Issue数: 3
- 成功: 3 / 失敗: 0
- 並列実行: 2グループ
- 総PR数: 3
```

## エラーハンドリング

- **Executor失敗時**: 失敗したIssueのステータスを `FAILURE` としてレポートに記載。他のIssueの実装は継続する
- **コンフリクト検出漏れ**: Executorがpush時にコンフリクトが発生した場合、そのIssueを `CONFLICT` としてレポートに記載
- **API rate limit**: Executor生成間に5秒のインターバルを設ける
- **全Executor失敗**: エラー詳細をまとめてユーザーに報告し、手動対応を促す
