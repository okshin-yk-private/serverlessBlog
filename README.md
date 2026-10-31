# Serverless Blog Platform

AWS サーバーレスアーキテクチャを学習するための個人ブログ基盤。

## 技術スタック

| カテゴリ | 技術 |
|---------|------|
| Backend | Go (Lambda ARM64, `provided.al2023`。版は `go-functions/go.mod` が唯一の参照元) |
| Public site | Astro SSG + slug ベース URL (`/posts/<slug>/`)。CodeBuild でビルドし S3 + CloudFront で配信 |
| Admin | React 19 + Vite + Tailwind + Tiptap エディタ + メタデータサイドバー |
| Infrastructure | Terraform ~> 1.14 (`.terraform-version`) |
| Database | DynamoDB (BlogPosts に `SlugIndex` GSI) |
| CDN | CloudFront (CloudFront Functions + KeyValueStore による atomic deployment) |
| Auth | Cognito |

## 開発

コマンドの一覧と検証の選び方は [docs/ai-shared-rules.md](./docs/ai-shared-rules.md) と
[docs/ai-verification.md](./docs/ai-verification.md) が正です。主なものは次のとおりです。

```bash
# 依存同期 + lint + format + 型検査 + 単体テスト + Go テスト
bun run verify

# 個別実行
bun run test:unit   # admin / public-astro / scripts/deploy / tests/config
bun run test:go     # go-functions (make test)
bun run typecheck   # admin / public-astro

# E2E テスト
bun run test:e2e
bun run test:e2e:admin

# Terraform
cd terraform/environments/dev
terraform init && terraform validate

# ローカル環境のツール・版の確認
bun run doctor
```

Claude Code 向けのスキル（`/create-issue`, `/implement-issue`, `/create-pr` など）は `CLAUDE.md` に
一覧があります。本体は `.claude/skills/`、Codex CLI の入口は `.agents/skills/` です。

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
│   ├── public-astro/    # 公開サイト (Astro SSG)
│   ├── admin/           # 管理画面 (React)
│   └── shared-ui/       # 共有 UI
├── tests/               # E2E (Playwright) と設定テスト
├── scripts/             # デプロイ・CI 補助スクリプト
└── docs/                # ドキュメント
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

- [ドキュメント索引](./docs/README.md)
- [アーキテクチャ](./docs/architecture/README.md)
- [Terraform](./terraform/README.md)
- [Go Lambda](./go-functions/README.md)
- [テスト戦略](./docs/testing-strategy.md)
- [セキュリティ](./docs/SECURITY.md)
