# Complete Deployment Example

このディレクトリには、サーバーレスブログプラットフォームの完全なデプロイ例が含まれています。

## 概要

この例は、開発環境（dev）と同等の構成をデプロイします。本番環境にデプロイする場合は、`terraform.tfvars`の値を適宜調整してください。

## 前提条件

1. **AWS CLI設定済み**
   ```bash
   aws configure
   ```

2. **Terraform 1.14.0以上**
   ```bash
   terraform version
   ```

3. **Goバイナリのビルド**
   ```bash
   cd go-functions
   make build
   ```

4. **状態バックエンドの初期化**
   ```bash
   cd terraform/bootstrap
   terraform init && terraform apply
   ```

## ファイル構成

```
complete/
├── README.md           # このファイル
├── main.tf             # モジュール呼び出し
├── variables.tf        # 変数定義
├── outputs.tf          # 出力定義
├── backend.tf          # バックエンド設定
└── terraform.tfvars    # 変数値
```

## 使用方法

### 1. バックエンド設定の更新

`backend.tf`のバケット名を実際の状態バケット名に更新します：

```hcl
terraform {
  backend "s3" {
    bucket       = "terraform-state-YOUR_ACCOUNT_ID"  # 実際のバケット名に置換
    key          = "serverless-blog/terraform.tfstate"
    region       = "ap-northeast-1"
    encrypt      = true
    use_lockfile = true
  }
}
```

### 2. 変数値の設定

`terraform.tfvars`を環境に合わせて編集します：

```hcl
project_name = "serverless-blog"
environment  = "dev"
aws_region   = "ap-northeast-1"
alarm_email  = "your-email@example.com"
```

### 3. 初期化とデプロイ

```bash
# 初期化
terraform init

# プラン確認
terraform plan

# デプロイ
terraform apply
```

### 4. 出力確認

```bash
# CloudFrontドメイン名
terraform output cloudfront_domain_name

# API エンドポイント
terraform output api_endpoint

# 管理画面URL
terraform output admin_site_url
```

## カスタマイズ

### 本番環境向け設定

```hcl
# terraform.tfvars
environment     = "prd"
enable_alarms   = true
enable_xray     = true
enable_pitr     = true
```

### CORS設定のカスタマイズ

```hcl
# main.tf内のapiモジュール
cors_allow_origins = ["https://your-domain.com"]
```

### CloudFront価格クラスの変更

```hcl
# main.tf内のcdnモジュール
price_class = "PriceClass_200"  # アジア含む
```

## クリーンアップ

```bash
# 全リソースの削除
terraform destroy
```

**注意**: 本番環境では`deletion_protection_enabled`が有効なため、一部リソースは手動で削除保護を解除する必要があります。

## トラブルシューティング

### Lambda関数デプロイエラー

Goバイナリが存在することを確認してください：

```bash
ls -la go-functions/bin/*/bootstrap
```

### 状態ロックエラー

```bash
terraform force-unlock <LOCK_ID>
```

### CloudFront更新の遅延

CloudFrontの設定変更は伝播に数分かかります。デプロイ完了後、5-10分待ってからアクセスしてください。
