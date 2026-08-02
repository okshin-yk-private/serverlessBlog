# Serverless Blog Platform

AWS サーバーレスアーキテクチャを学習するための個人ブログ基盤。

## 技術スタック

| カテゴリ | 技術 |
|---------|------|
| Backend | Go 1.26.5 (Lambda ARM64) |
| Public site | Astro SSG + slug ベース URL (`/posts/<slug>/`) |
| Admin | React 19 + Vite + Tailwind + Tiptap エディタ + メタデータサイドバー |
| Infrastructure | Terraform ~> 1.14 |
| Database | DynamoDB (BlogPosts に `SlugIndex` GSI) |
| CDN | CloudFront |
| Auth | Cognito |

## 開発

### Claude Code コマンド（推奨）

| コマンド | 説明 |
|---------|------|
| `/local-deploy` | ローカルデプロイ |
| `/run-tests` | テスト実行 |
| `/lambda-build` | Lambda ビルド |
| `/clean` | クリーンアップ |
| `/commit` | コミット作成 |
| `/validate-env` | 環境検証 |

### 手動実行

```bash
# Go テスト
cd go-functions && go test ./...

# Frontend テスト
cd frontend/public && bun run test
cd frontend/admin && bun run test

# E2E テスト
bun run test:e2e
bun run test:e2e:admin

# Terraform
cd terraform/environments/dev
terraform init && terraform plan
```

## ディレクトリ構成

```
serverlessBlog/
├── terraform/           # IaC
│   ├── modules/         # 再利用モジュール
│   └── environments/    # dev, prd
├── go-functions/        # Lambda (Go)
│   ├── cmd/             # エントリーポイント
│   └── internal/        # 共通ライブラリ
├── frontend/
│   ├── public/          # 公開サイト
│   └── admin/           # 管理画面
└── .claude/             # Claude Code設定
```

## オペレーション

### 既存記事への slug バックフィル (PR7+)

`go-functions/cmd/scripts/backfill_post_slugs` で BlogPosts を Scan し、
slug が未設定の項目に `domain.GenerateSlug(title)` で算出した kebab-case を
書き戻す。衝突は `-2`, `-3`, ... サフィックスで解消。

```bash
# Dry-run でプレビュー
AWS_PROFILE=dev TABLE_NAME=blog-posts-dev make -C go-functions backfill-slugs ARGS="--dry-run"

# 本実行
AWS_PROFILE=dev TABLE_NAME=blog-posts-dev make -C go-functions backfill-slugs

# Astro SSG を slug ベースで再ビルド
aws codebuild start-build --project-name <project>
```

## ドキュメント

- [アーキテクチャ](./docs/architecture.md)
- [Terraform](./terraform/README.md)
- [Go Lambda](./go-functions/README.md)
- [テスト戦略](./docs/testing-strategy.md)
