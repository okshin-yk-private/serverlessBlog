---
description: Stage changes, create commit with descriptive message, and push to remote
allowed-tools: Bash
argument-hint: [message]
---

# Commit Command

<instructions>

## Purpose
変更のステージング、コミットメッセージ生成、プッシュを一括実行する。

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
変更があれば `git add .` でステージング。
ただし、以下のファイルは除外：
- `.env` や認証情報を含むファイル
- 一時ファイル

### Step 3: コミットメッセージ作成

#### 引数がある場合
ユーザー指定のメッセージを使用。

#### 引数がない場合
差分を分析して以下のフォーマットでメッセージを生成：

```
<type>: <端的なタイトル（50文字以内）>

<変更内容の説明（必要に応じて）>

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
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

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
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
- main/master への直接プッシュは警告を出す

</instructions>
