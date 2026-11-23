---
name: team-implement
description: 複数の GitHub Issue を Agent Teams（Commander + Executor）で独立 worktree に分けて並列 TDD 実装する。
argument-hint: <Issue番号1> <Issue番号2> ... [-y]
disable-model-invocation: true
---

# Team Implement: 並列 Issue 実装ワークフロー

複数の GitHub Issue を **Agent Teams** で並列に TDD 実装する Commander ワークフロー。
各 Issue は Executor teammate が独立した Git worktree で実装し、Commander が依存制御・進捗監視・PR 作成を統括する。

## 前提

- 引数 `$ARGUMENTS` に 1 つ以上の Issue 番号がスペース区切りで渡される（`-y` があれば実行計画の確認を省略）
- `.claude/settings.json` で `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` が有効であること
- ベースブランチ: `origin/develop` / Worktree 作成先: `.claude/worktrees/`（`.gitignore` 済み）
- 権限エラーや初回セットアップ時は [references/permissions.md](references/permissions.md) を参照する

## Phase 1: Issue 情報取得 & コンフリクト分析

### 1a. 全 Issue の情報を並列取得

```bash
gh issue view <Issue番号> --json title,body,number,labels,comments
```

各 Issue からタイトル・修正方針・「対象ファイル」セクションのパス・ラベル（`bug` の有無で `fix/issue-<N>` / `feat/issue-<N>` を決定）を抽出する。

### 1b. コンフリクト検出（2 層）

1. **Layer 1（構造化抽出）**:
   ```bash
   bash scripts/analyze-issue-conflicts.sh <Issue番号1> <Issue番号2> ...
   ```
2. **Layer 2（影響推測）**: Issue 本文・修正方針から、共有パッケージ（`go-functions/internal/domain/`, `poststore/`, `middleware/` 等）、テストヘルパー、設定ファイル（`terraform/modules/*/variables.tf` 等）への波及を推測する。

同一ファイルを複数 Issue が編集する場合は `blockedBy` で逐次実行とし、別ファイルなら並列実行する。

### 1c. 複雑度評価 & モデル選択

手動指定（例: `/team-implement 127:opus 129 130:sonnet`）があれば優先する。未指定なら次の合計スコアで決定する（5 点以上 → `opus`、5 点未満 → `sonnet`）。

| シグナル | 点数 | 判定基準 |
|---------|------|----------|
| ラベル `complexity:high` | +5 | Issue labels に含まれる |
| クロスドメイン変更 | +3 | `go-functions/`, `frontend/`, `terraform/`, `.github/` の 2 領域以上にまたがる |
| 対象ファイル数 >= 6 | +2 | 「対象ファイル」セクションの件数 |
| アーキテクチャキーワード | +2 | 本文に `refactor`, `migration`, `redesign`, `architecture`, `breaking change` を含む |
| 複数テストスコープ | +1 | Go + Frontend 等、2 つ以上のテストスコープに該当 |

## Phase 2: 実行計画の提示

```
## 実行計画

### 並列グループ 1（同時実行）
- #42: <タイトル> → fix/issue-42 [Sonnet]
  対象: go-functions/cmd/posts/create/main.go
  複雑度スコア: 2
- #57: <タイトル> → feat/issue-57 [Opus]
  対象: go-functions/internal/auth/authorizer.go, terraform/modules/auth/main.tf
  複雑度スコア: 5 (クロスドメイン + アーキテクチャキーワード)

### 逐次グループ（#42 完了後）
- #63: <タイトル> → fix/issue-63 [Sonnet]
  対象: go-functions/cmd/posts/create/main.go, terraform/modules/api/main.tf
  複雑度スコア: 3
  ⚠️ #42 と posts/create/main.go が競合 → #42 完了後に実行

最大同時実行: 3 Executors
```

`-y` 指定または同一対象・範囲の事前承認があればそのまま進む。未承認の計画だけユーザーに確認する。

## Phase 3: チームと TaskList の作成

Issue が 1 件だけでも `TeamCreate` でチームを作成する（チームが無いと in-process 実行になり、tmux の別ペインが開かないため）。

```
TeamCreate(
  team_name="team-implement-<Issue番号をハイフン区切り>",
  description="Implement issues #<N1>, #<N2>, ..."
)
```

続けて `TaskCreate` で各 Issue のタスクを登録し、競合する Issue には `blockedBy` を設定する。

## Phase 4: Executor Teammate の逐次起動

ブロックされていないタスクから最大 3 体まで Executor を起動する。
Claude Code の tmux ペイン作成は並列呼び出しだとプロンプト送信が欠落する競合を起こすため、**1 ターンにつき 1 回の `Task()`** として必ず `team_name` と `isolation="worktree"` を指定し、前の Executor の idle 通知または初回応答を受け取ってから次を起動する。

- **起動手順**: Executor 1 起動 → idle 待機 → `sleep 3` → Executor 2 起動 → idle 待機 → `sleep 5` → Executor 3 起動 → 最大 90 秒 idle 待機
- **3 体目が 90 秒タイムアウトした場合**: [references/recovery.md](references/recovery.md) の段階的リカバリ手順に従う
- **モデル指定**: Opus 選択時のみ `model="opus"` を渡す（省略時は `executor.md` の `sonnet` が使われる）

```
Task(
  subagent_type="executor",
  team_name="team-implement-<Issue番号をハイフン区切り>",
  isolation="worktree",
  # Opus 選択時のみ: model="opus",
  prompt="""
  あなたは Executor Agent です。以下の GitHub Issue を TDD で実装してください。

  ## Issue 情報
  Issue 番号: #<N>
  タイトル: <title>
  本文:
  <body>

  コメント:
  <comments>

  ## 実装ルール
  1. ブランチ名: <fix/issue-N or feat/issue-N>（ベース: origin/develop）
  2. worktree の初回コミット前にルートで `bun install --frozen-lockfile` を実行し、husky フック（`.husky/_`）を有効化する。
  3. 動作変更は TDD（RED → GREEN → REFACTOR）、静的変更は `docs/ai-verification.md` の構文・参照検証に従う。
  4. commit が依頼範囲に含まれる場合だけ Conventional Commits でコミットする。
  5. 変更範囲に対応する検証コマンドとフォーマット確認を完了させる。
  6. push が承認されている場合は事前に Codex レビューを試行する:
     - 変更ファイル取得: `git diff --name-only origin/develop...HEAD`
     - レビュー実行: `Skill("codex:review", "<files> --focus all")`
     - HIGH / MEDIUM 指摘は根拠を確認し、範囲内の修正・再検証・再レビューを行う。未解決なら報告し、レビュー済みとして push しない。
     - MCP 利用不可なら `Review: SKIPPED` と報告する。必須チェックが通り push が承認済みなら続行可能。
  7. push が依頼範囲に含まれる場合だけ対象ブランチを push する。

  ## 完了報告形式
  - Issue 番号とタイトル / ブランチ名 / 変更ファイル一覧 / テスト結果（件数・成否） / レビュー結果（APPROVED / FIXED / SKIPPED） / コミット一覧
  """
)
```

## Phase 5: 進捗監視 & 後続タスクの起動

- `TaskList` を確認し、前提タスクが完了した `blockedBy` タスクがあれば、Phase 4 と同じく 1 体ずつ逐次起動する
- 全タスクが終了するまで監視を続ける

## Phase 6: PR 作成と auto-merge 予約

PR 作成が依頼範囲に含まれる場合、`docs/ai-shared-rules.md` および `.claude/skills/create-pr/SKILL.md` に従って各完了 Issue の PR を作成する（本文は一時ファイルに書き `--body-file` で渡す）。

```bash
gh pr create \
  --base develop \
  --head <branch-name> \
  --title "<type>(<scope>): <summary>" \
  --body-file <body-file>
```

依頼が「PR だけ」「マージしない」「draft」でなく `develop` 向けであれば、PR 作成直後に auto-merge を予約する（無効時のフォールバックは `.claude/skills/create-pr/SKILL.md` に従う）。

```bash
python3 scripts/ci/enqueue_pr.py <PR番号> --auto
```

実行中・未実施・ブロックされた検証は成功として報告しない。

## Phase 7: サマリーレポートとエラーハンドリング

- Executor が失敗した Issue は `FAILURE`、push 時競合は `CONFLICT` として記録し、他 Issue の進行は止めない。全件失敗時はエラー詳細をまとめてユーザーに報告する。
- 完了時は次の形式で報告する:

```
## Team Implement 完了レポート

| Issue | タイトル | モデル | ステータス | ブランチ | PR |
|-------|---------|--------|-----------|---------|-----|
| #42 | Fix posts handler | Sonnet | ✅ SUCCESS | fix/issue-42 | #XXX |

### コンフリクト解決
- #63 は #42 完了後に逐次実行（posts/create/main.go 競合）

### 統計
- 総 Issue 数: N / 成功: X / 失敗: Y / 総 PR 数: Z
```
