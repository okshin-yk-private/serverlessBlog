# Serverless Blog Platform

AWS サーバーレスアーキテクチャを学習するための個人ブログ基盤。

## 技術スタック

| カテゴリ | 技術 |
|---------|------|
| Backend | Go 1.25 (Lambda ARM64) |
| Frontend | React 18 + Vite + Tailwind |
| Infrastructure | Terraform ~> 1.14 |
| Database | DynamoDB |
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

## ドキュメント

- [アーキテクチャ](./docs/architecture.md)
- [Terraform](./terraform/README.md)
- [Go Lambda](./go-functions/README.md)
- [テスト戦略](./docs/testing-strategy.md)
