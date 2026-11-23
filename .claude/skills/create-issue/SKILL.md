---
name: create-issue
description: 要望やバグ報告の概要からコードベースを調査し、修正方針を含む詳細な GitHub Issue を作成する。
argument-hint: <要望の概要テキスト>
disable-model-invocation: true
---

# 要望調査 & Issue 作成ワークフロー

リポジトリルートの `docs/ai-shared-rules.md` に従う。
要望やバグ報告をもとにコードベースを調査し、原因・修正方針・テスト観点を備えた GitHub Issue を作成する。

## 前提

- 引数 `$ARGUMENTS` に要望の概要テキストが渡される
- 引数がない場合はユーザーに要望内容を確認する

## 手順

### 1. 要望の理解

引数から要望の背景と期待動作を整理する。仕様判断が必要な不明点があればユーザーに質問する。

### 2. コードベース調査

#### 2-0. 調査基準の確認（最初に必ず行う）

ローカルのチェックアウトが古いまま調査すると、上流で解消済みの問題を報告してしまう。

```bash
git fetch origin
git rev-list --left-right --count HEAD...origin/develop   # 「ahead behind」
```

- `behind` が 0 でなければ、`origin/develop` を基準に読む（`git show origin/develop:<path>` または `git worktree add` で作成した新しい worktree で読む）
- Issue に記載するファイルパス・行番号・スニペットは `origin/develop` の状態に合わせる

#### 2a. 関連箇所の特定と影響調査

- `docs/ai-shared-rules.md` と必要に応じた `.kiro/steering/structure.md` を起点にし、Grep / Glob で該当箇所を特定する
- 対象コンポーネント（`go-functions/cmd/`・`go-functions/internal/`・`frontend/admin/`・`frontend/public-astro/`・`terraform/modules/`・`tests/config/`・`.github/workflows/` 等）のエントリーポイントからデータフロー・バリデーション・権限制御・表示ロジックを追跡する
- 同じ処理が画面別・ロール別・環境別（DEV / PRD）に分かれている場合はすべて確認し、変更対象と副作用の範囲を洗い出す

### 3. 修正方針の策定

調査結果をもとに以下を整理する:
- 修正が必要なファイルと具体的な変更内容
- 変更間の依存関係と実装順序
- テストで確認すべきポイントと影響範囲

### 4. Issue 作成

起票前に、同じ問題を扱う Issue がないか **クローズ済みも含めて** 検索する。

```bash
gh issue list --state all --search "<キーワード>" --limit 20
```

- 未解決の重複 Issue があれば新規作成せず、既存 Issue へのコメントで補足する
- クローズ済みで解消済みなら新規作成しない。一部が残る場合は残存範囲だけを新しい Issue にし、元の Issue 番号を「備考」に記す

本文は一時ファイルまたは HEREDOC で `gh issue create` に渡す。

**タイトル:** 要望・不具合の要点を簡潔に記述する

**本文テンプレート:**

```markdown
## 概要

[要望・バグの説明。何が問題で、どうあるべきかを 1〜2 段落で記述]

## 現状

[現在のコードの該当箇所を示す。`origin/develop` 基準のファイルパス・行番号・コードスニペットを含める]

\`\`\`
// ファイルパス:行番号
該当コードのスニペット
\`\`\`

## 修正方針

[番号付きリストで具体的な修正手順を記述]

1. ...
2. ...
3. ...

## 対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `ファイルパス` | 変更の概要 |

## テスト観点

- [テストで確認すべきポイントを列挙]

## 備考

[スコープ外の事項、注意点、確認事項があれば記載]
```

### 5. 完了報告

作成した Issue 番号と URL を示し、調査で判明した主な原因・変更点・修正方針の要点を報告する。
