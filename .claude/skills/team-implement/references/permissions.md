# Worktree Executor 権限要件

Worktree 分離モード（`isolation: "worktree"`）の Executor は、`.claude/settings.local.json` の `permissions.allow` ホワイトリストを継承する。Executor が権限拒否で失敗する場合は、以下の Bash コマンドパターンが登録されているか確認する。

## Git 操作（必須）
- `Bash(git fetch:*)` - リモートブランチ取得
- `Bash(git checkout:*)` - ブランチ作成・切り替え
- `Bash(git push:*)` - リモートへのプッシュ
- `Bash(git stash:*)` - 変更の一時退避
- `Bash(git status:*)` - 状態確認
- `Bash(git diff:*)` - 差分確認
- `Bash(git log:*)` - ログ確認
- `Bash(git branch:*)` - ブランチ管理
- `Bash(git commit:*)` - コミット
- `Bash(git add:*)` - ステージング

## ビルド・テスト
- `Bash(go test:*)` - Go テスト
- `Bash(make:*)` - Go lint / test（`make -C go-functions lint` / `make test`）
- `Bash(gofmt:*)` - Go フォーマット
- `Bash(go mod:*)` - Go モジュール管理
- `Bash(go install:*)` - Go ツールインストール
- `Bash(terraform fmt:*)` - Terraform フォーマット
- `Bash(terraform init:*)` - Terraform 初期化
- `Bash(terraform validate:*)` - Terraform 検証
- `Bash(bun run test:*)` - ユニット・設定テスト
- `Bash(bun run lint:*)` - リント
- `Bash(bun run typecheck:*)` - 型チェック
- `Bash(bun install:*)` - 依存関係インストール
- `Bash(bun run format:check:*)` - フォーマットチェック

## PR 作成・マージ予約
- `Bash(gh pr:*)` - GitHub PR 操作
- `Bash(python3 scripts/ci/enqueue_pr.py:*)` - `develop` 向け PR の auto-merge 予約・merge queue 投入

## Commander 用（起動間隔・リカバリ待機）
- `Bash(sleep:*)` - Executor 起動間隔の待機・リカバリ待機

## フォールバック戦略

権限不足により Executor が失敗した場合（ログに「Bash ツールが拒否」等が出る場合）は、Commander が逐次実装へフォールバックし、`.claude/settings.local.json` のパーミッション設定不足をユーザーに報告する。
