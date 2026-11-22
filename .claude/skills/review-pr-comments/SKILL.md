---
name: review-pr-comments
description: PRのレビューコメントを確認し、修正が必要なものは修正してコミット・プッシュし、全コメントに返信する
argument-hint: <PR番号 or PR URL>
disable-model-invocation: true
---

# PRレビューコメント対応ワークフロー

リポジトリルートの `docs/ai-shared-rules.md` と `docs/ai-verification.md` に従う。
指定されたPRに付いたレビューコメントを精査し、承認された依頼範囲で修正・検証・コミット・プッシュ・返信を行う。

## 前提

- 引数 `$ARGUMENTS` にPR番号またはPR URLが渡される
- PR URLの場合は末尾の番号を抽出してPR番号として使用する
- 引数がない場合は現在のブランチに紐づくPRを `gh pr view --json number` で特定する

## 手順

### 1. PR情報の取得と作業場所の準備

```bash
gh pr view <PR番号> --json title,body,headRefName,baseRefName,author
```

PRのブランチ名とPR作者のユーザー名（`author.login`）を記録する。

メインのチェックアウトは他のセッションと共有されている場合があるため、メインのチェックアウトでブランチを切り替えない（`docs/ai-shared-rules.md`）。

- 既に独立した worktree で `<headRefName>` にいる場合: `git fetch origin <headRefName>` のうえ `git pull --ff-only origin <headRefName>` で最新化する。
- それ以外の場合: worktree を作成してその中で作業する。

```bash
git fetch origin <headRefName>
git worktree add .claude/worktrees/pr-<PR番号> -b <headRefName> origin/<headRefName>
# 同名ローカルブランチが既存なら: git worktree add .claude/worktrees/pr-<PR番号> <headRefName>
```

新しい worktree には依存も husky のフック（`.husky/_`）も無いため、初回コミット前にルートで `bun install --frozen-lockfile` を実行する（未実行だとコミット時チェックが警告なしでスキップされる）。

### 2. レビューコメントの全件取得

GitHub APIで **2種類のコメント** を取得する。レビューボット（Greptile等）はPRレビューコメントではなくIssueコメントとして投稿する場合があるため、両方を確認する必要がある。ページネーション漏れを防ぐため `--paginate` を付ける。

owner/repoは `gh repo view --json nameWithOwner` で取得する。

#### 2a. PRレビューコメント（コード行に紐づくコメント）

```bash
gh api --paginate repos/{owner}/{repo}/pulls/{PR番号}/comments
```

#### 2b. Issueコメント（PR全体に対するコメント）

```bash
gh api --paginate repos/{owner}/{repo}/issues/{PR番号}/comments
```

**重要:** GitHubではPRはIssueの一種であるため、PRに対するIssueコメントは `issues/{番号}/comments` エンドポイントで取得できる。Greptile等のレビューボットはこちらに投稿することが多い。

取得した両方のコメントをマージして処理する。各コメントがどちらのソース（PR review comment / Issue comment）から取得されたかを記録しておく（返信時に使うAPIが異なるため）。

### 3. 未返信コメントの特定

取得したコメント一覧から以下の条件で **対応が必要なコメント** を特定する:

- **bot（greptile-apps[bot]等）や他のレビュアーからのコメント** で、かつ
- **PR作者（ステップ1で取得した `author.login`）からの返信がまだない** もの

判定方法:

**PRレビューコメントの場合:**
- `in_reply_to_id` フィールドを使ってスレッドをグループ化する
- 各スレッドの最後の返信者がPR作者でなければ未対応とする
- トップレベルコメント（`in_reply_to_id` が null）がスレッドの起点

**Issueコメントの場合:**
- Greptile等のbotコメントは通常1つの長いコメントに複数の指摘をまとめて投稿する
- そのコメントの後にPR作者からの返信コメントがあるかを時系列で確認する
- botコメントの本文からコードの指摘箇所（ファイルパス・行番号）を抽出する

対応済みコメントは「既に対応済み」として一覧に含めるが、再対応はしない。

### 4. 各コメントの精査

未返信の各コメントについて、以下を行う:

#### 4a. コメント内容の理解
- コメントの `path`（対象ファイル）と `line`（対象行）を確認
- コメント本文から指摘内容を理解する
- `suggestion` ブロックがある場合は提案コードも確認する

#### 4b. コードベースでの検証
- 対象ファイルを Read ツールで読み込み、指摘箇所の前後のコンテキストを理解する
- 指摘が正しいかどうかをコードベース全体の文脈で判断する
- 必要に応じて関連ファイル（テストファイル等）も確認する

#### 4c. 判断と分類
各コメントを以下のいずれかに分類する:

1. **修正する** - 指摘が妥当で、コード修正が必要
2. **修正不要** - 指摘は理解できるが、現在の実装が正しい理由がある
3. **既に対応済み** - 別のコミットで既に修正されている

### 5. 修正の実施と検証

「修正する」と判断したコメントについて:

- Edit ツールで対象ファイルを修正する
- 同じ問題が複数箇所にある場合は全て修正する
- 修正は最小限にとどめ、指摘された問題のみを解決する
- `docs/ai-verification.md` に従い、変更範囲に対応するテスト・lint・format チェックを実行して成功を確認する

### 6. コミットとプッシュ

修正があり、コミット・プッシュが依頼範囲に含まれる場合:

- 修正ファイルを個別に `git add <paths>` で追加する（`git add .` / `git add -A` は使わない）
- ステージ済み差分に秘密情報や無関係な変更がないか確認し、Conventional Commits 形式でコミットする:

```
fix: レビュー指摘対応の簡潔な説明

具体的な修正内容の説明。
```

- `git push origin <ブランチ名>` でプッシュする
- リモート変更と競合して rejected された場合は、状態を再取得して変更を保全できる方法を選ぶ（force-push はしない）

### 7. コメントへの返信

返信が依頼範囲に含まれる場合、全ての未返信コメントに対してGitHub APIで返信する。コメントのソースに応じて異なるAPIを使用する:

**PRレビューコメントへの返信:**
```bash
gh api repos/{owner}/{repo}/pulls/{PR番号}/comments/{comment_id}/replies -f body='返信内容'
```

**Issueコメントへの返信:**
```bash
gh api repos/{owner}/{repo}/issues/{PR番号}/comments -f body='返信内容'
```

返信の内容は分類に応じて:

- **修正した場合:** 「修正しました。（修正内容の簡潔な説明）（コミットハッシュ）」
- **修正不要の場合:** 「（現在の実装が正しい理由の説明）」
- **既に対応済みの場合:** 「（既に対応済みのコミットハッシュを参照して説明）」

返信は簡潔に、技術的根拠を含めて記述する。日本語で返信する。

### 8. サマリー報告

全コメントの対応結果をユーザーに報告する。以下の形式:

```
## レビューコメント対応サマリー

全N件のコメントを確認しました:

### 修正したもの
- (ファイル名): 修正内容の説明

### 修正不要と判断したもの
- (ファイル名): 理由の説明

### 既に対応済みだったもの
- (ファイル名): 対応済みコミットの参照
```
