---
name: review-pr-comments
description: PR のレビューコメントを精査し、承認された依頼範囲で修正・検証・push・返信を行う。
argument-hint: <PR番号 or PR URL>
disable-model-invocation: true
---

# PR レビューコメント対応ワークフロー

リポジトリルートの `docs/ai-shared-rules.md` と `docs/ai-verification.md` に従う。
指定された PR のレビューコメントを精査し、承認された依頼範囲で修正・検証・コミット・プッシュ・返信を行う。

## 前提

- 引数 `$ARGUMENTS` に PR 番号または PR URL が渡される
- PR URL の場合は末尾の番号を抽出して PR 番号として使う
- 引数がない場合は現在のブランチに紐づく PR を `gh pr view --json number` で特定する

## 手順

### 1. PR 情報の取得と作業場所の準備

```bash
gh pr view <PR番号> --json title,body,headRefName,baseRefName,author
```

PR のブランチ名と PR 作者のユーザー名（`author.login`）を記録する。

メインのチェックアウトは他セッションと共有されている場合があるため、メインのチェックアウトでブランチを切り替えない（`docs/ai-shared-rules.md`）。

- 既に独立した worktree で `<headRefName>` にいる場合: `git fetch origin <headRefName>` のうえ `git pull --ff-only origin <headRefName>` で最新化する
- それ以外の場合: worktree を作成してその中で作業する

```bash
git fetch origin <headRefName>
git worktree add .claude/worktrees/pr-<PR番号> -b <headRefName> origin/<headRefName>
# 同名ローカルブランチが既存なら: git worktree add .claude/worktrees/pr-<PR番号> <headRefName>
```

新しい worktree には依存パッケージも husky のフック（`.husky/_`）も無いため、初回コミット前にルートで `bun install --frozen-lockfile` を実行する（未実行だとコミット時チェックが警告なしでスキップされる）。

### 2. レビューコメントとスレッド状態の取得

GitHub ではレビューボット（Greptile 等）がコード行コメントではなく PR の Issue コメントとして投稿する場合があるため、両方を確認する。30 件超で取りこぼさないよう `--paginate --slurp` と `jq 'add'` で全ページを 1 つの配列に結合する。

owner/repo は `gh repo view --json nameWithOwner -q .nameWithOwner` で取得する。

#### 2a. PR レビューコメント（コード行に紐づくコメント）

```bash
gh api --paginate --slurp repos/{owner}/{repo}/pulls/{PR番号}/comments | jq 'add'
```

#### 2b. レビュースレッドの解決状態（Resolve 済み除外用）

REST API にはスレッドの解決状態が含まれないため、UI 上で Resolve 済みのスレッドを未対応と誤判定しないよう GraphQL で `isResolved` を確認する:

```bash
gh api graphql --paginate \
  -F owner='{owner}' -F repo='{repo}' -F number={PR番号} \
  -f query='query($owner:String!,$repo:String!,$number:Int!,$endCursor:String){repository(owner:$owner,name:$repo){pullRequest(number:$number){reviewThreads(first:100,after:$endCursor){pageInfo{hasNextPage endCursor}nodes{isResolved comments(first:100){nodes{databaseId author{login}}}}}}}}'
```

#### 2c. Issue コメント（PR 全体に対するコメント）

```bash
gh api --paginate --slurp repos/{owner}/{repo}/issues/{PR番号}/comments | jq 'add'
```

返信時に使う API が異なるため、各コメントが PR レビューコメントか Issue コメントかを区別して保持する。

### 3. 未対応コメントの特定

以下を満たすコメントを **対応対象** として特定する:

- **bot（`greptile-apps[bot]` 等）や他のレビュアーからのコメント** であること
- **Resolve 済みスレッドではない** こと（ステップ 2b で `isResolved: true` のスレッドは除外）
- **PR 作者（ステップ 1 の `author.login`）からの返信がまだない** こと

判定方法:

- **PR レビューコメント**: `in_reply_to_id` でスレッドをまとめ、トップレベルコメント（`in_reply_to_id == null`）を起点として最後の返信者が PR 作者でなければ未対応とする
- **Issue コメント**: bot コメントの後に PR 作者の返信コメントがあるかを時系列で確認し、未返信であれば本文から指摘箇所（ファイルパス・行番号）を抽出する

すでに対応・解決済みのコメントは一覧に含めるだけで再対応しない。

### 4. 各コメントの精査

未対応の各コメントについて以下を確認する:

- コメントの `path`・`line`・本文・`suggestion` ブロックを読み、指摘の意図を把握する
- 対象ファイルと関連ファイル（テスト含む）を読み、コードベース全体の文脈で妥当性を検証する
- 各コメントを次のいずれかに分類する:
  1. **修正する**: 指摘が妥当でコード修正が必要
  2. **修正不要**: 指摘の意図は理解できるが、現行実装を維持すべき明確な根拠がある
  3. **既に対応済み**: 別コミットで解消済み

### 5. 修正の実施と検証

「修正する」と判断したコメントについて:

- 対象ファイルを最小限の変更で修正する（同じ問題が複数箇所にある場合は漏れなく直す）
- `docs/ai-verification.md` に従い、変更範囲に対応するテスト・lint・format チェックを実行して成功を確認する

### 6. コミットとプッシュ

修正があり、コミット・プッシュが依頼範囲に含まれる場合:

- 修正ファイルだけを個別に `git add <paths>` で追加する（`git add .` / `git add -A` は使わない）
- ステージ済み差分に秘密情報や無関係な変更がないか確認し、Conventional Commits 形式でコミットする:

```
fix: レビュー指摘対応の簡潔な説明

具体的な修正内容の説明。
```

- `git push origin <ブランチ名>` でプッシュする
- リモート変更と競合して拒否（rejected）された場合は、状態を再取得して変更を保全できる方法を選ぶ（force-push はしない）

### 7. コメントへの返信

返信が依頼範囲に含まれる場合、未対応コメントすべてに GitHub API で返信する。

**PR レビューコメントへの返信:**
```bash
gh api repos/{owner}/{repo}/pulls/{PR番号}/comments/{comment_id}/replies -f body='返信内容'
```

**Issue コメントへの返信:**
```bash
gh api repos/{owner}/{repo}/issues/{PR番号}/comments -f body='返信内容'
```

分類に応じて、技術的根拠を添えて簡潔な日本語で返信する:
- **修正した場合**: 「修正しました。（修正内容の簡潔な説明）（コミットハッシュ）」
- **修正不要の場合**: 「（現行実装が正しい理由の説明）」
- **既に対応済みの場合**: 「（対応済みコミットハッシュを参照した説明）」

### 8. サマリー報告

全コメントの対応結果を次の形式でユーザーに報告する:

```
## レビューコメント対応サマリー

全N件のコメントを確認しました:

### 修正したもの
- (ファイル名): 修正内容の説明

### 修正不要と判断したもの
- (ファイル名): 理由の説明

### 既に対応済み・Resolve 済みだったもの
- (ファイル名): 対応済みコミットまたは Resolve 状態の参照
```
