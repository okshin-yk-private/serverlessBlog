---
description: Execute local deployment workflow for serverless blog
allowed-tools: Bash, Read
argument-hint: [options]
---

# Local Deploy Command

<instructions>

## Purpose
GitHub Actions CI/CDパイプラインと同等のデプロイをローカルから実行する。

## Quick Reference

| コマンド | 説明 |
|---------|------|
| `/local-deploy` | ヘルプ表示 |
| `/local-deploy dev` | dev環境フルデプロイ |
| `/local-deploy prd` | prd環境デプロイ（二重確認あり） |
| `/local-deploy --dry-run` | 変更なしでプラン確認 |
| `/local-deploy frontend` | フロントエンドのみ |
| `/local-deploy infrastructure` | インフラのみ |

## Execution

**引数に応じてスクリプトを実行:**

1. 引数なし → ヘルプ表示
   ```bash
   ./scripts/local-deploy.sh --help
   ```

2. `dev` または `prd` → 環境指定デプロイ
   ```bash
   ./scripts/local-deploy.sh --env {env}
   ```

3. `--dry-run` → dry-runモード
   ```bash
   ./scripts/local-deploy.sh --dry-run
   ```

4. `frontend` または `infrastructure` → コンポーネント指定
   ```bash
   ./scripts/local-deploy.sh --component {component}
   ```

5. その他 → 引数をそのまま渡す
   ```bash
   ./scripts/local-deploy.sh $ARGUMENTS
   ```

## Available Options

- `--env <dev|prd>` - ターゲット環境（デフォルト: dev）
- `--component <all|infrastructure|frontend>` - デプロイ対象
- `--dry-run` - 変更なしでプラン確認
- `--auto-approve` - 確認プロンプトスキップ
- `--lambda <function>` - 単一Lambda関数のみ
- `--frontend <public|admin>` - 単一フロントエンドのみ
- `--verbose` - 詳細出力
- `--skip-prereq-check` - 前提条件チェックスキップ
- `--no-invalidation` - CloudFront無効化スキップ

## Lambda Functions

posts-create, posts-get, posts-get_public, posts-list,
posts-update, posts-delete, auth-login, auth-logout,
auth-refresh, images-get_upload_url, images-delete

## Prerequisites

- AWS CLI (認証済み)
- Go 1.25+
- Terraform 1.14+
- Bun
- Node.js 22+
- jq

## Troubleshooting

| エラー | 解決策 |
|-------|--------|
| AWS認証エラー | `aws sso login` または `aws configure` |
| Terraform失敗 | `terraform init` を手動実行 |
| SSMパラメータ未検出 | パラメータパスを確認 |

</instructions>
