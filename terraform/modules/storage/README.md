# Storage Module

S3バケットを管理するTerraformモジュールです。

## 概要

ブログプラットフォームで使用する以下のS3バケットを作成・管理します:

- **images**: 画像ファイルストレージ（バージョニング有効）
- **public-site**: 公開サイト静的ファイル
- **admin-site**: 管理画面静的ファイル
- **access-logs**: アクセスログ（オプション）

## 使用方法

```hcl
module "storage" {
  source = "../../modules/storage"

  project_name                = "serverless-blog"
  environment                 = "dev"
  enable_access_logs          = false
  cloudfront_distribution_arn = ""  # 循環依存を避けるため別途設定

  tags = {
    Project     = "serverless-blog"
    Environment = "dev"
  }
}
```

## Requirements

| Name | Version |
|------|---------|
| terraform | ~> 1.14 |
| aws | ~> 6.0 |

## Providers

| Name | Version |
|------|---------|
| aws | ~> 6.0 |

## Resources

| Name | Type |
|------|------|
| aws_s3_bucket.images | resource |
| aws_s3_bucket.public_site | resource |
| aws_s3_bucket.admin_site | resource |
| aws_s3_bucket.access_logs | resource |
| aws_s3_bucket_versioning.* | resource |
| aws_s3_bucket_server_side_encryption_configuration.* | resource |
| aws_s3_bucket_public_access_block.* | resource |
| aws_s3_bucket_lifecycle_configuration.images | resource |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| project_name | Project name (used as bucket name prefix) | `string` | n/a | yes |
| environment | Environment identifier (dev, prd) | `string` | n/a | yes |
| enable_access_logs | Enable access logging (recommended for prd) | `bool` | `false` | no |
| cloudfront_distribution_arn | CloudFront distribution ARN for OAC policy | `string` | `""` | no |
| tags | Additional tags for resources | `map(string)` | `{}` | no |

## Outputs

| Name | Description |
|------|-------------|
| image_bucket_name | Image bucket name |
| image_bucket_arn | Image bucket ARN |
| image_bucket_id | Image bucket ID |
| image_bucket_regional_domain_name | Image bucket regional domain name for CloudFront OAC |
| public_site_bucket_name | Public site bucket name |
| public_site_bucket_arn | Public site bucket ARN |
| public_site_bucket_id | Public site bucket ID |
| public_site_bucket_regional_domain_name | Public site bucket regional domain name for CloudFront OAC |
| admin_site_bucket_name | Admin site bucket name |
| admin_site_bucket_arn | Admin site bucket ARN |
| admin_site_bucket_id | Admin site bucket ID |
| admin_site_bucket_regional_domain_name | Admin site bucket regional domain name for CloudFront OAC |
| access_logs_bucket_name | Access logs bucket name (null if disabled) |
| access_logs_bucket_arn | Access logs bucket ARN (null if disabled) |

## バケット命名規則

```
{project_name}-{bucket_type}-{environment}-{account_id}
```

例:
- `serverless-blog-images-dev-123456789012`
- `serverless-blog-public-site-prd-987654321098`

## セキュリティ設定

### 暗号化

全バケットでSSE-S3（AES-256）暗号化が有効です。

### パブリックアクセスブロック

全バケットで以下のパブリックアクセスブロックが有効です:
- `block_public_acls = true`
- `block_public_policy = true`
- `ignore_public_acls = true`
- `restrict_public_buckets = true`

### CloudFront OACアクセス

バケットポリシーは環境のmain.tfで別途設定されます（循環依存を避けるため）。

## ライフサイクルポリシー

imagesバケットには以下のライフサイクルポリシーが適用されます:

- 非現行バージョンの削除: 30日後
- 不完全なマルチパートアップロードの削除: 7日後

## 既存リソースのインポート

```hcl
# import.tf
import {
  to = aws_s3_bucket.images
  id = "serverless-blog-images-dev-123456789012"
}

import {
  to = aws_s3_bucket_versioning.images
  id = "serverless-blog-images-dev-123456789012"
}

import {
  to = aws_s3_bucket_server_side_encryption_configuration.images
  id = "serverless-blog-images-dev-123456789012"
}

import {
  to = aws_s3_bucket_public_access_block.images
  id = "serverless-blog-images-dev-123456789012"
}
```

## 関連モジュール

- [cdn](../cdn/README.md) - CloudFront OACによるS3アクセス
- [lambda](../lambda/README.md) - 画像アップロード/削除用Lambda関数
