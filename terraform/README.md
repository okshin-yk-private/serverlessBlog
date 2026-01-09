# Serverless Blog - Terraform Infrastructure

AWS CDKから移行したサーバーレスブログプラットフォームのTerraformインフラストラクチャ定義です。

## 概要

このTerraformプロジェクトは、サーバーレスブログプラットフォームのAWSインフラストラクチャを管理します。

### アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────┐
│                        CloudFront CDN                            │
│                    (HTTPS、Gzip/Brotli圧縮)                        │
└─────────────────────────────────────────────────────────────────┘
         │              │              │              │
         ▼              ▼              ▼              ▼
   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
   │ /        │  │ /admin/* │  │ /images/*│  │ /api/*   │
   │ (S3)     │  │ (S3)     │  │ (S3)     │  │ (APIGW)  │
   └──────────┘  └──────────┘  └──────────┘  └──────────┘
                                                   │
                                                   ▼
                                          ┌──────────────┐
                                          │  API Gateway │
                                          │  + Cognito   │
                                          │  Authorizer  │
                                          └──────────────┘
                                                   │
                                                   ▼
                                          ┌──────────────┐
                                          │   Lambda     │
                                          │  (Go/ARM64)  │
                                          └──────────────┘
                                                   │
                              ┌────────────────────┼────────────────────┐
                              ▼                    ▼                    ▼
                       ┌──────────┐         ┌──────────┐         ┌──────────┐
                       │ DynamoDB │         │    S3    │         │ Cognito  │
                       │ (Posts)  │         │ (Images) │         │(User Pool)│
                       └──────────┘         └──────────┘         └──────────┘
```

### 主な機能

- **ブログ記事管理**: DynamoDBによる記事のCRUD操作
- **画像ストレージ**: S3によるPresigned URLでの画像アップロード/配信
- **認証**: Cognito User Poolによるユーザー認証
- **CDN配信**: CloudFrontによる静的コンテンツ・API配信
- **モニタリング**: CloudWatch Alarms、ダッシュボード、SNS通知

## ディレクトリ構造

```
terraform/
├── README.md                    # このファイル
├── versions.tf                  # Terraform/プロバイダバージョン制約
├── bootstrap/                   # 状態バックエンドのブートストラップ
│   ├── main.tf
│   ├── variables.tf
│   ├── outputs.tf
│   └── versions.tf
├── modules/                     # 再利用可能なTerraformモジュール
│   ├── database/                # DynamoDB
│   ├── storage/                 # S3バケット
│   ├── auth/                    # Cognito
│   ├── api/                     # API Gateway
│   ├── lambda/                  # Lambda関数
│   ├── cdn/                     # CloudFront
│   └── monitoring/              # CloudWatch
├── environments/                # 環境別設定
│   ├── dev/                     # 開発環境
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   ├── backend.tf
│   │   └── terraform.tfvars
│   └── prd/                     # 本番環境
│       ├── main.tf
│       ├── variables.tf
│       ├── outputs.tf
│       ├── backend.tf
│       └── terraform.tfvars
├── docs/                        # ドキュメント
│   └── migration/
│       ├── IMPORT_GUIDE.md      # インポート手順
│       └── RESOURCE_MAPPING.md  # リソースマッピング
├── scripts/                     # ユーティリティスクリプト
│   └── validate-import.sh       # インポート検証
└── examples/                    # 使用例
    └── complete/                # 完全なデプロイ例
```

## 前提条件

- **Terraform**: >= 1.14.0
- **AWS CLI**: 設定済み（適切なIAM権限）
- **Go**: 1.25.x（Lambda関数ビルド用）
- **jq**: JSON処理用

## クイックスタート

### 1. 状態バックエンドの初期化

初回のみ、状態管理用S3バケットを作成します。

```bash
cd terraform/bootstrap

# 初期化と適用
terraform init
terraform apply
```

### 2. 環境のデプロイ

```bash
# 開発環境
cd terraform/environments/dev
terraform init
terraform plan
terraform apply

# 本番環境
cd terraform/environments/prd
terraform init
terraform plan
terraform apply
```

## モジュール一覧

| モジュール | 説明 | 主要リソース |
|-----------|------|-------------|
| [database](./modules/database/README.md) | DynamoDBテーブル | BlogPostsテーブル、GSI |
| [storage](./modules/storage/README.md) | S3バケット | images、public-site、admin-site |
| [auth](./modules/auth/README.md) | Cognito認証 | User Pool、App Client |
| [api](./modules/api/README.md) | API Gateway | REST API、Cognito Authorizer |
| [lambda](./modules/lambda/README.md) | Lambda関数 | 11個のGo Lambda関数 |
| [cdn](./modules/cdn/README.md) | CloudFront | 統合ディストリビューション |
| [monitoring](./modules/monitoring/README.md) | 監視 | CloudWatch Alarms、Dashboard |

## 環境別設定

### 開発環境 (dev)

- X-Rayトレーシング: 無効
- CloudWatchアラーム: 無効
- DynamoDB削除保護: 無効

### 本番環境 (prd)

- X-Rayトレーシング: 有効
- CloudWatchアラーム: 有効
- DynamoDB削除保護: 有効

## CDKからの移行

既存のCDK管理リソースをTerraformにインポートする場合は、以下のドキュメントを参照してください。

- [インポートガイド](./docs/migration/IMPORT_GUIDE.md)
- [リソースマッピング](./docs/migration/RESOURCE_MAPPING.md)

## CI/CD

GitHub Actionsによる自動化:

- **developブランチ**: `terraform fmt`、`validate`、`plan`の実行
- **mainブランチ**: 承認後に本番デプロイ
- **セキュリティスキャン**: Checkov（CI）、Trivy（ローカル）

詳細は [.github/workflows/terraform.yml](../.github/workflows/terraform.yml) を参照。

## セキュリティ

### スキャンツール

- **Checkov**: CIでのIaCセキュリティスキャン
- **Trivy**: ローカルpre-commitでのスキャン

### セキュリティ設定

- 全S3バケット: SSE-S3暗号化、パブリックアクセスブロック
- DynamoDB: サーバーサイド暗号化、PITR有効
- CloudFront: HTTPS強制、TLS 1.2以上
- IAM: 最小権限原則

## 開発ガイド

### ローカル開発

```bash
# フォーマットチェック
terraform fmt -check -recursive

# バリデーション
cd terraform/environments/dev
terraform validate

# プラン
terraform plan
```

### pre-commitフック

```bash
# pre-commitのインストール
pip install pre-commit

# フックのセットアップ
pre-commit install

# 手動実行
pre-commit run --all-files
```

### terraform-docs

モジュールのREADME.mdはterraform-docsで生成されます。

```bash
# terraform-docsのインストール
brew install terraform-docs  # macOS
# または
go install github.com/terraform-docs/terraform-docs@latest

# ドキュメント生成
cd terraform/modules/database
terraform-docs markdown . > README.md
```

## トラブルシューティング

### 状態ロックエラー

```bash
# ロック状態の確認
terraform force-unlock <LOCK_ID>
```

### プロバイダ初期化エラー

```bash
# プロバイダキャッシュのクリア
rm -rf .terraform
terraform init
```

### インポートエラー

[インポートガイド](./docs/migration/IMPORT_GUIDE.md)のトラブルシューティングセクションを参照。

## バージョン情報

| コンポーネント | バージョン |
|--------------|-----------|
| Terraform | ~> 1.14 |
| AWS Provider | ~> 6.0 |
| Go | 1.25.x |

## ライセンス

このプロジェクトは内部利用のみを目的としています。

## 関連ドキュメント

- [プロダクト仕様](../.kiro/steering/product.md)
- [技術仕様](../.kiro/steering/tech.md)
- [移行要件](../.kiro/specs/cdk-to-terraform-migration/requirements.md)
