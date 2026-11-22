---
name: implement-issue
description: >-
  Issue 番号（#N）や GitHub Issue の URL が示され、「対応して」「直して」「修正して」「実装して」「Implement issue #N」など単一 Issue に基づくコード変更・機能実装を求められたときに使う。Issue 本文とコメントを読み取り、専用 worktree で TDD（再現テスト→修正→検証）まで一貫して進める。対象外: Issue の起票・一覧表示・要約のみ、Issue を伴わない通常のコード修正やテスト実行、PR 作成、PR レビュー対応、複数 Issue の並列実装。
argument-hint: <Issue番号 or Issue URL>
---

# Issue 実装ワークフロー（TDD）

リポジトリルートの `docs/ai-shared-rules.md` と `docs/ai-verification.md` に従い、指定された GitHub Issue を実装する。動作変更には TDD を用いる。

## 前提

- 引数 `$ARGUMENTS` に Issue 番号または Issue URL が渡される
- Issue URL の場合は末尾の番号を抽出して Issue 番号として使う
- 引数がない場合はユーザーに Issue 番号を確認する

## 手順

### 1. Issue 情報の取得

```bash
gh issue view <Issue番号> --json title,body,number,labels,comments
```

Issue の **本文（body）とコメント（comments）の両方** から、概要・修正方針・対象ファイル・テスト観点を把握する。
コメントには質問への回答や追加要件・方針変更が含まれる場合があるため、Issue 本文と矛盾する場合はより新しいコメントを優先する。

### 1.5. 作業場所の準備

メインのチェックアウトは他セッションと共有されている場合があるため、ブランチを切り替えない。Issue ごとに `origin/develop` 起点の worktree を作成し、以降の作業はすべてその中で行う（`docs/ai-shared-rules.md`）。

```bash
git fetch origin
git worktree add .claude/worktrees/issue-<N> -b fix/issue-<N> origin/develop
# 機能追加の場合は feat/issue-<N>（Issue の種別・ラベルに合わせる）
```

- 同じ Issue の作業ブランチが既にあれば、そのブランチを使う worktree を作る（`git worktree add .claude/worktrees/issue-<N> <branch>`）
- 新しい worktree には依存パッケージも husky のフック（`.husky/_`）も無いため、作成直後にルートで `bun install --frozen-lockfile` を実行する（未実行だとコミット時チェックが警告なしでスキップされる）。検証前に対象パッケージでも同様に依存を揃える

### 2. 対象コードの確認

Issue の「対象ファイル」に記載されたファイルと関連テストを読み、現状のコードと前後の文脈を把握する。
Issue の「現状」スニペットと実コードに差異がある場合、依頼の意図を保てる範囲なら継続し、要件・外部動作・変更範囲が変わる差異だけ報告して方針を確認する。

### 3. RED: 動作変更を再現するテスト

`docs/ai-verification.md` に従う。動作変更には回帰テストを先に書く。文書・静的設定・書式だけの変更は構文・参照・設定検証を使い、実装をなぞるだけのテストは追加しない。

1. 既存テストがあれば追加し、新規作成時は既存の命名規則・構造および `docs/ai-shared-rules.md`・`docs/ai-verification.md` の規約に合わせる
2. テストを実行して **意図どおり失敗する（RED）** ことを確認する（成功してしまう場合や構文エラーがある場合はテストを見直す）

### 4. GREEN: テストを通す最小限の実装

Issue の修正方針に従い、テストが通る **最小限** の修正を行う（過度なリファクタリングはしない）。修正後にテストを再実行し、GREEN を確認する。

### 5. REFACTOR（必要な場合のみ）

テストが GREEN の状態を維持しながら、明確に改善効果がある範囲だけ軽微にリファクタリングする。

### 6. フォーマット・リント・最終検証

`docs/ai-shared-rules.md` と `docs/ai-verification.md` に記載された変更範囲に対応するフォーマッター・リンター・関連テスト全体を実行し、既存テストが壊れていないことを確認する。

### 7. 完了報告

次の形式でユーザーに報告する:

```
## 実装完了サマリー

**Issue:** #<番号> <タイトル>

### 作成・修正したファイル
- `ファイルパス`: 変更内容の説明

### テスト結果
- 実行コマンド・対象テスト: <コマンド / テストファイル>
- テスト数: N 件
- 結果: 全件 GREEN

### 次のステップ
依頼が実装までならここで完了。commit・push・PR 作成や CI 確認まで承認されていれば、共有ルールと create-pr の手順で続行し、依頼範囲を完了させる。
```
