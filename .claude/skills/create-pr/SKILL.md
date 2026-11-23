---
name: create-pr
description: 承認された変更をコミット・pushし、develop 向けの PR を作成して auto-merge 予約まで行う依頼に使う。
argument-hint: [branch-name]
disable-model-invocation: true
allowed-tools: Read, Write, Bash(git *), Bash(gh *), Bash(python3 scripts/ci/enqueue_pr.py *)
---

# PR 作成

リポジトリルートの `docs/ai-shared-rules.md` に従う。今回の依頼で承認された変更だけを PR に含める。
PR 作成の依頼には commit・push を含む。`develop` 向け PR の作成依頼は、CI 成功後の merge queue でのマージ（および続く DEV デプロイ）の承認も含む。`main` 向けはマージしない（PRD デプロイは別途明示依頼が必要）。

## 変更とブランチ

- 会話の依頼範囲と `git status`、作業ツリー・ステージ済み・コミット済みの差分を照合する。今回の依頼に含まれない変更は混ぜず、帰属が不明な差分だけユーザーに確認する。
- ベースブランチは `develop`。`git fetch origin develop` で最新状態を確認し、リポジトリのデフォルトブランチから推測しない。別のベースはユーザーが明示指定したときだけ使う。
- 依頼に対応する作業ブランチが既にあればそのまま使う。新規作成時は `origin/develop` を起点とし、指定名または `fix/issue-<N>` / `feat/issue-<N>` など変更内容に合うブランチ名を付ける。
- ブランチの作成・切り替えは worktree で行い（`git worktree add .claude/worktrees/<name> -b <branch> origin/develop`）、メインのチェックアウトのブランチは変えない（他セッションと共有されている場合があるため）。
- 未コミット変更や別作業のコミットがある状態で機械的に checkout しない。必要なら隔離した worktree に承認範囲の差分を移し、元の変更を保全する。`reset`・`clean`・無関係な変更の `stash`・`force-push` で状態を合わせない。

## 検証・提出

1. 共有ルールに従って変更範囲の検証を完了し、今回の変更に起因する失敗があれば修正して該当検証を再実行する。すでに確認済みの範囲について、形式的な再承認を求めない。
2. 対象パスだけを `git add <paths>` でステージする。`git add .` / `git add -A` は使わず、ステージ済み差分に秘密情報や無関係な変更がないか確認して commit する。
3. 対象ブランチを push する。認証・権限不足はそのまま報告し、承認や hook を迂回しない。リモート変更と競合した場合は状態を再取得し、変更を保全できる方法を選ぶ。
4. 既存 PR があれば更新し、なければ `gh pr create --base develop --head <branch>` で作成する（明示的な別ベース指定があれば置き換える）。PR 本文は一時ファイルに書き出し、`--body-file` で渡す。
5. PR 本文には、課題と変更後の動作、検証結果、残る制約を簡潔に記す。関連 Issue の要件をすべて満たした場合だけ `Closes #<N>` を付ける。

## CI 監視とマージ（`develop` 向け）

ユーザーが「PR だけ」「マージしない」「draft」と指定した場合、および `main` 向けはマージしない。それ以外は次を実行する。

1. PR の作成・更新直後、CI 完了を待たずに auto-merge を予約する。スクリプトが base が `develop` であること、および fork・closed・draft・Dependabot 作成の PR でないことを確認し、条件を満たさなければ `BLOCKED` で止まる（`--dry-run` で判定だけ確認できる）。

   ```bash
   python3 scripts/ci/enqueue_pr.py <PR番号> --auto
   ```

   予約できたら、必須チェック成功時に GitHub が merge queue へ自動投入する。この時点では「マージ済み」「DEV Deploy 成功」とは書かず、「auto-merge 予約済み」として報告する。CI が失敗してもマージされないため、今回の変更に起因する失敗なら修正して push する（CI 監視・Auto-fix がセッションを再起動する場合がある）。
2. `--auto` が「repository auto-merge is disabled」で `BLOCKED` になった場合は、次の手順にフォールバックする。
   1. head SHA に対する全 workflow 実行が終わるまで待つ。重複起動で `cancelled` になった実行は結果として扱わない。
   2. `All CI Checks Passed`、`Security Scan Summary`、`Dependency Update Security Gate` が最新の実行で成功し、head が変わっていないことを確認する。今回の変更に起因する失敗なら修正して push し、1 から繰り返す。外部要因なら報告して止める。
   3. `--auto` なしで実行し、直接 merge queue へ投入する。

      ```bash
      python3 scripts/ci/enqueue_pr.py <PR番号>
      ```
3. queue の `merge_group` チェック、マージ、続く DEV Deploy の結果を実際に観測できた場合だけ、その結果を報告する。

## 完了

PR URL、ベース・head、検証結果、CI 状態、マージと DEV Deploy の結果を報告する。
実行中・未実行・外部要因でブロックされた検証は成功として扱わない。
ローカルで修復できるエラーのまま終了せず、承認範囲内で解決まで進める。
