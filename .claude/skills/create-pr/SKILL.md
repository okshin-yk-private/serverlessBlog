---
name: create-pr
description: 最新のmainブランチから新しいブランチを作成し、今回のセッションで修正したファイルのみをコミットしてPRを作成する
argument-hint: [branch-name]
disable-model-invocation: true
allowed-tools: Bash(git *), Bash(gh *)
---

# ブランチ作成 & PR作成ワークフロー

このセッション（今回の会話）でClaude Codeが修正・作成したファイルのみを対象に、最新のメインブランチから分岐した新しいブランチにコミットし、PRを作成する。

## 対象ファイルの特定（最重要）

PRに含めるのは **このセッションでClaude Codeが編集・作成したファイルだけ** である。

- 会話履歴を遡り、自分が Edit / Write ツールで変更・作成したファイルのパスを全てリストアップする
- `git diff` や `git status` に表示されていても、このセッションで自分が触っていないファイルは **絶対にステージング（git add）しない**
- 判断に迷う場合はユーザーに確認する

## 手順

以下の手順を順番に実行すること。各ステップでエラーが発生した場合は停止してユーザーに報告する。

### 1. 対象ファイルの確認

会話履歴から、このセッションで自分が修正・作成したファイルの一覧をユーザーに提示し、確認を取る。

### 2. ブランチ名の決定

- 引数でブランチ名が指定されている場合: `$ARGUMENTS` を使用する
- 引数がない場合: 今回の変更内容から適切なブランチ名を生成する（例: `fix/issue-123`, `feature/add-xxx`）
- ブランチ名はケバブケース（小文字+ハイフン区切り）で、`feature/`, `fix/`, `chore/`, `refactor/` 等のプレフィックスを付ける

### 3. メインブランチの最新を取得

リポジトリのデフォルトブランチ（main or master）を特定し、最新を取得する:

```bash
gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name'
git fetch origin <default-branch>
```

### 4. 新しいブランチを作成

最新のリモートデフォルトブランチから分岐して新しいブランチを作成する:

```bash
git checkout -b <branch-name> origin/<default-branch>
```

**重要:** 必ずリモートのデフォルトブランチから分岐すること。現在のブランチやローカルのブランチからではない。

### 5. 対象ファイルのみをステージング＆コミット

- ステップ1で確認した対象ファイルだけを `git add <file1> <file2> ...` で個別にステージングする
- **`git add .` や `git add -A` は絶対に使わない**
- 適切なコミットメッセージで1つまたは複数のコミットを作成する
- `.env`、credentials等の機密ファイルをコミットしないよう注意する

### 6. リモートにプッシュ

```bash
git push -u origin <branch-name>
```

### 7. PRを作成

`gh pr create` でPRを作成する。PRの内容:

- **タイトル:** 変更内容を簡潔に要約（70文字以内）
- **本文:** 以下の形式で記述する（該当しないセクションは省略してよい）

```
## Related Issue
Closes #<Issue番号>

## Summary
<変更内容の要約を1-3行で>

## Test plan
<テストの実行方法や確認手順>

## Notes
<補足事項、制約、既知の問題、レビュー時の注意点など>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- **Related Issue:** `/implement-issue` 経由で作業した場合は必ず `Closes #番号` を記載してIssueを自動クローズする。関連Issueがない場合はセクションごと省略する
- **Notes:** レビュアーへの補足（設計判断の理由、影響範囲、今後の課題など）があれば記載する。なければ省略する

- **ベースブランチ:** リポジトリのデフォルトブランチ

### 8. 完了報告

PR URLをユーザーに表示する。
