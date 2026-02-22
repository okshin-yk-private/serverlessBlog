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

### 1d. 複雑度評価 & モデル選択

各Issueの複雑度を評価し、Executor に使用するモデル（Opus / Sonnet）を決定する。

**手動オーバーライド:**
Issue番号にサフィックスを付与して強制指定可能。手動指定がある場合、スコアリングをスキップする。
```
/team-implement 127:opus 129 130:sonnet
```

**スコアリングルール（手動指定がない場合）:**

| シグナル | ポイント | 判定方法 |
|---------|---------|---------|
| ラベル `complexity:high` | +5 (自動Opus) | Issue labels に含まれるか |
| クロスドメイン変更 | +3 | 対象ファイルが `go-functions/`, `frontend/`, `terraform/`, `.github/` のうち2つ以上にまたがる |
| 対象ファイル数 >= 6 | +2 | 「対象ファイル」セクションのファイル数 |
| アーキテクチャキーワード | +2 | Issue本文に refactor, migration, redesign, architecture, breaking change を含む |
| 複数テストスコープ | +1 | Go + Frontend 等、2つ以上のテストスコープに該当 |

**閾値:** スコア >= 5 → Opus / スコア < 5 → Sonnet（デフォルト）

## Phase 2: 実行計画の提示

以下の形式でユーザーに実行計画を提示する:

```
## 実行計画

### 並列グループ 1（同時実行）
- #42: <タイトル> → fix/issue-42 [Sonnet]
  対象: go-functions/internal/handler/posts.go
  複雑度スコア: 2
- #57: <タイトル> → feat/issue-57 [Opus]
  対象: go-functions/internal/handler/auth.go, terraform/modules/auth/main.tf
  複雑度スコア: 5 (クロスドメイン+アーキテクチャキーワード)

### 逐次グループ（#42完了後）
- #63: <タイトル> → fix/issue-63 [Sonnet]
  対象: go-functions/internal/handler/posts.go, terraform/modules/api/main.tf
  複雑度スコア: 3
  ⚠️ #42とposts.goが競合 → #42完了後に実行

最大同時実行: 3 Executors
```

`-y` フラグがない場合、ユーザーの承認を待つ。

## Phase 3: チーム作成 & TaskList作成

**重要: Issue数に関係なく（1つでも複数でも）、必ず `TeamCreate` でチームを作成すること。**
これにより tmux 環境で Executor が別ペインで起動されることが保証される。
`TeamCreate` を省略すると、Executor が in-process サブエージェントとして実行され、tmux ペインが開かない。

```
TeamCreate(
  team_name="team-implement-<Issue番号をハイフン区切り>",
  description="Implement issues #<N1>, #<N2>, ..."
)
```

続けて TaskCreate で各Issueのタスクエントリを作成する。コンフリクトがある場合は `blockedBy` で依存関係を設定する。

## Phase 4: Executor Teammateの生成

**ブロックされていないタスクから順に**、Executor teammateを **1つずつ逐次生成** する。

> **CRITICAL: 複数のTask()を同一メッセージで呼び出してはならない（並列Tool Call禁止）。**
> Claude CodeのtmuxペインはTask()ごとに逐次作成される必要があり、並列呼び出しはペインが開いても
> プロンプトが自動送信されないレースコンディションを引き起こす。

**重要: 必ず `team_name` パラメータを指定すること。** `team_name` がないと通常のサブエージェントとして実行され、tmux ペインが開かない。

各Executorの生成時に渡す情報。Phase 1dで決定したモデルに応じてTask()の引数を変える:

```
# Opus選択時 (スコア >= 5 または手動 :opus 指定)
Task(
  subagent_type="executor",
  team_name="team-implement-<Issue番号をハイフン区切り>",
  isolation="worktree",
  model="opus",
  prompt="""
  あなたはExecutor Agentです。以下のGitHub Issueを TDD で実装してください。
  ... (下記共通プロンプト参照)
  """
)

# Sonnet選択時 (スコア < 5, デフォルト)
Task(
  subagent_type="executor",
  team_name="team-implement-<Issue番号をハイフン区切り>",
  isolation="worktree",
  prompt="""
  あなたはExecutor Agentです。以下のGitHub Issueを TDD で実装してください。
  ... (下記共通プロンプト参照)
  """
)
# model省略 → executor.md の model: sonnet が適用される
```

**逐次生成プロトコル（必須）:**

1. Executor 1 のTask()を呼び出す（**単独のメッセージで**）
2. Executor 1 からのidle通知または最初のメッセージを受信するまで待機する
3. 受信確認後、次のExecutor のTask()を呼び出す（**新しい単独メッセージで**）
4. 最大3つのExecutorが同時稼働するまで繰り返す

```
# ❌ DO NOT: 同一ターンで複数のTask()を呼び出す
Task(subagent_type="executor", team_name="team-impl-42-57", prompt="Issue #42 ...")
Task(subagent_type="executor", team_name="team-impl-42-57", prompt="Issue #57 ...")
# → tmuxレースコンディション: 2つ目のペインが開くがプロンプトが送信されない

# ✅ DO: ターンを分離して1つずつ呼び出す
# --- ターン1 ---
Task(subagent_type="executor", team_name="team-impl-42-57", prompt="Issue #42 ...")
# → Executor 1 からの idle通知を待つ
# --- ターン2 ---
Task(subagent_type="executor", team_name="team-impl-42-57", prompt="Issue #57 ...")
# → Executor 2 からの idle通知を待つ
```

**共通プロンプト:**

```
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
  7. **Codexレビュー（MANDATORY - push前に必ず実行）**:
     - 変更ファイル取得: `git diff --name-only origin/develop...HEAD`
     - レビュー実行: `Skill("codex:review", "<files> --focus all")`
     - HIGH/MEDIUM指摘 → 修正・テスト再実行・コミット・再レビュー（最大2サイクル）
     - MCP利用不可の場合は警告ログのみでpushを続行
  8. 完了後、ブランチをpush: git push -u origin <branch-name>

  ## 完了報告形式
  以下の形式で報告:
  - Issue番号とタイトル
  - ブランチ名
  - 変更ファイル一覧
  - テスト結果（件数、成否）
  - レビュー結果（APPROVED / FIXED / SKIPPED）
  - コミット一覧
```

**制約:**
- 最大同時Executor数: **3**（API rate limit考慮）
- 各Executorは `isolation: "worktree"` で独立したworktreeで動作
- **Executor生成は必ず逐次実行**: 同一ターンでの複数Task()呼び出し禁止
- **生成間隔**: 前のExecutorからidle通知を受信してから次を生成（tmuxレースコンディション回避）

### Worktree Executor権限要件

Worktree分離モード（`isolation: "worktree"`）のExecutorは、`.claude/settings.local.json` の `permissions.allow` ホワイトリストを継承する。以下のBashコマンドパターンが `permissions.allow` に登録されている必要がある:

**Git操作（必須）:**
- `Bash(git fetch:*)` - リモートブランチ取得
- `Bash(git checkout:*)` - ブランチ作成・切り替え
- `Bash(git push:*)` - リモートへのプッシュ
- `Bash(git stash:*)` - 変更の一時退避
- `Bash(git status:*)` - 状態確認
- `Bash(git diff:*)` - 差分確認
- `Bash(git log:*)` - ログ確認
- `Bash(git branch:*)` - ブランチ管理
- `Bash(git commit:*)` - コミット
- `Bash(git add:*)` - ステージング

**ビルド・テスト（プロジェクト依存）:**
- `Bash(go test:*)` - Goテスト
- `Bash(gofmt:*)` - Goフォーマット
- `Bash(go mod:*)` - Goモジュール管理
- `Bash(go install:*)` - Goツールインストール
- `Bash(terraform fmt:*)` - Terraformフォーマット
- `Bash(terraform init:*)` - Terraform初期化
- `Bash(terraform validate:*)` - Terraform検証
- `Bash(bun run test:*)` - フロントエンドテスト
- `Bash(bun install:*)` - 依存関係インストール
- `Bash(bun run format:check:*)` - フォーマットチェック

**PR作成:**
- `Bash(gh pr:*)` - GitHub PR操作

**フォールバック戦略:**
権限不足によりExecutorが失敗した場合、Commanderが逐次実装にフォールバックする。エラーログに「Bashツールが拒否」等のメッセージが含まれる場合は、`settings.local.json` のパーミッション設定を確認すること。

## Phase 5: 進捗監視 & 逐次タスクのアンブロック

- TaskListを定期的に確認し、完了したタスクを検出
- ブロックされていたタスク（`blockedBy`）の前提が完了したら、新しいExecutorを生成
  - 新しいExecutorを生成する際も **Phase 4の逐次生成プロトコルを遵守** すること（並列Task()禁止）
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

| Issue | タイトル | モデル | ステータス | ブランチ | PR |
|-------|---------|--------|-----------|---------|-----|
| #42 | Fix posts handler | Sonnet | ✅ SUCCESS | fix/issue-42 | #XXX |
| #57 | Add auth feature | Opus | ✅ SUCCESS | feat/issue-57 | #YYY |
| #63 | Fix posts & API | Sonnet | ✅ SUCCESS | fix/issue-63 | #ZZZ |

### コンフリクト解決
- #63は#42完了後に逐次実行（posts.go競合）

### 統計
- 総Issue数: 3
- 成功: 3 / 失敗: 0
- 並列実行: 2グループ
- 総PR数: 3
- モデル別: Opus 1件 / Sonnet 2件
```

## エラーハンドリング

- **Executor失敗時**: 失敗したIssueのステータスを `FAILURE` としてレポートに記載。他のIssueの実装は継続する
- **コンフリクト検出漏れ**: Executorがpush時にコンフリクトが発生した場合、そのIssueを `CONFLICT` としてレポートに記載
- **Executor生成順序**: Phase 4の逐次生成プロトコルを参照（tmuxレースコンディション対策）
- **全Executor失敗**: エラー詳細をまとめてユーザーに報告し、手動対応を促す
