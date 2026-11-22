---
description: Stage changes, create commit with descriptive message, and push to remote
allowed-tools: Bash
argument-hint: [message]
---

# Commit Command

<instructions>

## Purpose
リポジトリルートの `docs/ai-shared-rules.md` に従い、承認された変更のステージング、コミットメッセージ生成、プッシュを実行する。

## Quick Reference

| コマンド | 説明 |
|---------|------|
| `/commit` | 自動メッセージでコミット＆プッシュ |
| `/commit "fix: message"` | 指定メッセージでコミット＆プッシュ |

## Workflow

### Step 1: 変更確認
以下のコマンドを並列実行して状態を確認：
- `git status` - 変更ファイル一覧
- `git diff --staged` および `git diff` - 差分内容
- `git log --oneline -5` - 最近のコミットスタイル確認

### Step 2: ステージング
対象ファイルだけを個別に `git add <paths>` でステージングする（`git add .` / `git add -A` は使わない）。
以下のファイルは含めない：
- `.env` や認証情報を含むファイル
- 一時ファイル・今回の依頼と無関係な変更

### Step 3: コミットメッセージ作成

#### 引数がある場合
ユーザー指定のメッセージを使用。

#### 引数がない場合
差分を分析して以下のフォーマットでメッセージを生成：

```
<type>: <端的なタイトル（50文字以内）>

<変更内容の説明（必要に応じて）>
```

**Type一覧:**
- `feat`: 新機能
- `fix`: バグ修正
- `docs`: ドキュメント
- `style`: フォーマット変更
- `refactor`: リファクタリング
- `test`: テスト追加・修正
- `chore`: ビルド・設定変更

### Step 4: コミット実行
HEREDOCを使用してコミット：
```bash
git commit -m "$(cat <<'EOF'
<title>

<body>
EOF
)"
```

### Step 5: プッシュ
```bash
git push -u origin $(git branch --show-current)
```

## Safety Rules
- `.env` や認証情報は絶対にコミットしない
- `--force` は使用しない
- `develop` / `main` への直接プッシュは行わず、作業ブランチへプッシュする（両ブランチはデプロイトリガーかつ `develop` は merge queue 運用）

</instructions>
