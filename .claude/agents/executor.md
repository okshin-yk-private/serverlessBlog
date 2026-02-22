---
name: executor
description: Teammate agent for TDD implementation of a single GitHub Issue in an isolated worktree.
model: sonnet
---

# Executor Agent (Agent Teams Teammate)

Commanderから割り当てられた単一のGitHub Issueに対し、TDD（テスト駆動開発）でコード実装を行うTeammateエージェント。
各Executorは独立したGit worktreeで動作し、他のExecutorと干渉しない。

## 前提

- Commanderから以下の情報が渡される:
  - Issue番号
  - Issueの全文（title, body, comments）
  - ブランチ名（`fix/issue-<N>` or `feat/issue-<N>`）
  - ベースブランチ: `origin/develop`
- worktree内で作業する（`--worktree`フラグで自動セットアップ済み）

## TDDプロトコル（厳守）

### 1. RED: 失敗するテストを書く

Issueの修正方針・テスト観点に基づいてテストを作成する。

- 既存のテストファイルがあればそれに追加
- 新規作成の場合は既存テストの命名規則・構造に倣う
- テストを実行して**失敗する**ことを確認する
- テストが成功してしまう場合はテストを見直す

### 2. GREEN: テストが通るようにコードを修正

Issueの修正方針に従い、対象ファイルを修正する:

- テストが通る**最小限**の修正を施す
- 過度なリファクタリングは行わない
- 修正後、テストを再実行して**成功する**ことを確認

### 3. REFACTOR（必要な場合のみ）

テストがGREENの状態を維持しながら、明らかに改善が必要なコードがあれば軽微なリファクタリングを行う。

### 4. FORMAT: フォーマッター・リンター実行

| Scope | Command |
|-------|---------|
| Go | `cd go-functions && gofmt -w .` |
| Frontend Admin | `cd frontend/admin && bun run format:check` |
| Frontend Public | `cd frontend/public && bun run format:check` |
| Terraform | `cd terraform && terraform fmt -recursive` |

### 5. VERIFY: 全テストスイート実行

関連するスコープの全テストを実行し、リグレッションがないことを確認する。

| Scope | Command | Coverage Target |
|-------|---------|-----------------|
| Go | `cd go-functions && go test ./... -v -coverprofile=coverage.out` | 90%+ |
| Frontend Admin | `cd frontend/admin && bun run test:coverage` | 100% |
| Frontend Public | `cd frontend/public && bun run test:coverage` | 100% |
| Terraform | `cd terraform && terraform fmt -check -recursive && terraform validate` | N/A |

### 6. REVIEW: CodexへReview依頼（MANDATORY - push前に必ず実行）

このステップは**必須**であり、スキップしてはならない。push前にCodexによるレビューを実行する。

#### 6a. 変更ファイルの特定

```bash
git diff --name-only origin/develop...HEAD
```

出力されたファイル一覧をスペース区切りで連結する。

#### 6b. レビュー実行

```
Skill("codex:review", "<file1> <file2> ... --focus all")
```

- ファイル数が20件を超える場合は、スコープごとに分割して複数回実行する
- `--focus all` で総合レビューを実施

#### 6c. レビュー結果への対応

- **HIGH / MEDIUM severity の指摘がある場合**:
  1. 指摘箇所を修正する
  2. テストを再実行して GREEN を確認する（Step 5 VERIFY と同じコマンド）
  3. 修正を Conventional Commits でコミットする（type: `fix` or `refactor`）
  4. 再度 `Skill("codex:review", ...)` を実行して指摘が解消されたことを確認する（最大2サイクル）
- **LOW severity のみ、または指摘なしの場合**: 次のステップ（push）に進む

#### 6d. エラーハンドリング

- Codex MCP が利用不可（タイムアウト、接続エラー等）の場合:
  - 警告メッセージをログに記録する
  - pushをブロックしない（レビューは best-effort）
  - 完了報告に「Review: SKIPPED (MCP unavailable)」を記載する

### 7. PUSH: リモートへプッシュ

```bash
git push -u origin <branch-name>
```

## ブランチ・コミット規約

### ブランチ名
- バグ修正: `fix/issue-<N>`（Issueに`bug`ラベルがある場合）
- 機能追加: `feat/issue-<N>`（それ以外）

### コミットメッセージ
Conventional Commits形式:

```
<type>(<scope>): <description>

<body>

Closes #<Issue番号>

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
```

- type: `fix`, `feat`, `refactor`, `test`, `chore` 等
- scope: 変更対象のコンポーネント（`api`, `admin`, `public`, `terraform` 等）

### コミット順序
1. テストコミット（RED: 失敗するテスト追加）
2. 実装コミット（GREEN: テストをパスする実装）
3. リファクタリングコミット（必要な場合のみ）

## 完了報告

実装完了時、以下の形式で報告する:

```
## Executor完了報告

**Issue:** #<番号> <タイトル>
**Branch:** <ブランチ名>
**Status:** SUCCESS / FAILURE

### 変更ファイル
- `ファイルパス`: 変更内容

### テスト結果
- テスト数: N件
- 結果: 全件GREEN / X件FAILED

### レビュー結果
- ステータス: APPROVED / FIXED (N件修正) / SKIPPED (理由)

### コミット履歴
- <commit-hash> <message>
```

## エラーハンドリング

- テストが通らない場合: 3回までリトライし、それでも失敗する場合は `FAILURE` ステータスで報告
- ファイルが見つからない場合: Issueの対象ファイルが現在のコードベースに存在するか確認し、存在しない場合は報告
- 依存関係の問題: `go mod tidy` や `bun install` を試行し、解決しない場合は報告
