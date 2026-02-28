# CDN Module

CloudFrontディストリビューションを管理するTerraformモジュールです。

## 概要

ブログプラットフォームのコンテンツ配信を提供する統合CloudFrontディストリビューションを作成・管理します:

- **S3オリジン**: public-site、admin-site、images
- **API Gatewayオリジン**: /api/*パス
- **OAC**: Origin Access Control によるS3アクセス制御
- **HTTPS強制**: 全通信をHTTPSにリダイレクト

## 使用方法

```hcl
module "cdn" {
  source = "../../modules/cdn"

  environment                             = "dev"
  image_bucket_name                       = module.storage.image_bucket_name
  image_bucket_regional_domain_name       = module.storage.image_bucket_regional_domain_name
  public_site_bucket_name                 = module.storage.public_site_bucket_name
  public_site_bucket_regional_domain_name = module.storage.public_site_bucket_regional_domain_name
  admin_site_bucket_name                  = module.storage.admin_site_bucket_name
  admin_site_bucket_regional_domain_name  = module.storage.admin_site_bucket_regional_domain_name
  rest_api_id                             = module.api.rest_api_id
  api_stage_name                          = module.api.stage_name
  aws_region                              = "ap-northeast-1"
  price_class                             = "PriceClass_100"

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
| aws_cloudfront_distribution.main | resource |
| aws_cloudfront_origin_access_control.s3_oac | resource |
| aws_cloudfront_cache_policy.* | resource |
| aws_cloudfront_origin_request_policy.* | resource |
| aws_cloudfront_function.* | resource |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| environment | Environment identifier (dev, prd) | `string` | n/a | yes |
| image_bucket_name | Image bucket name | `string` | n/a | yes |
| image_bucket_regional_domain_name | Image bucket regional domain name | `string` | n/a | yes |
| public_site_bucket_name | Public site bucket name | `string` | n/a | yes |
| public_site_bucket_regional_domain_name | Public site bucket regional domain name | `string` | n/a | yes |
| admin_site_bucket_name | Admin site bucket name | `string` | n/a | yes |
| admin_site_bucket_regional_domain_name | Admin site bucket regional domain name | `string` | n/a | yes |
| rest_api_id | REST API ID for /api/* origin | `string` | n/a | yes |
| api_stage_name | API Gateway stage name | `string` | n/a | yes |
| aws_region | AWS region for API Gateway | `string` | n/a | yes |
| price_class | CloudFront price class | `string` | `"PriceClass_100"` | no |
| tags | Additional tags for resources | `map(string)` | `{}` | no |

## Outputs

| Name | Description |
|------|-------------|
| distribution_id | CloudFront distribution ID |
| distribution_domain_name | CloudFront domain name |
| distribution_arn | CloudFront distribution ARN |
| oac_id | Origin Access Control ID |
| public_site_url | Public site URL (root path) |
| admin_site_url | Admin site URL (/admin/ path) |
| images_base_url | Images base URL (/images/ path) |
| api_base_url | API base URL (/api/ path) |

## パス構成

| パス | オリジン | キャッシュ | 説明 |
|------|---------|---------|------|
| / | public-site (S3) | 24時間 | 公開サイトのデフォルト |
| /admin/* | admin-site (S3) | 24時間 | 管理画面 |
| /images/* | images (S3) | 7日間 | 画像ファイル |
| /api/* | API Gateway | キャッシュなし | API呼び出し |

## キャッシュ設定

### 静的コンテンツ（S3）

| 設定 | 値 |
|------|-----|
| Default TTL | 86400秒（24時間） |
| Max TTL | 604800秒（7日間） |
| Min TTL | 0秒 |
| Compress | 有効（Gzip/Brotli） |

### 画像コンテンツ

| 設定 | 値 |
|------|-----|
| Default TTL | 604800秒（7日間） |
| Max TTL | 2592000秒（30日間） |
| Min TTL | 86400秒（24時間） |

### API（キャッシュ無効）

| 設定 | 値 |
|------|-----|
| Default TTL | 0秒 |
| Caching Disabled | true |

## セキュリティ設定

### HTTPS強制

`viewer_protocol_policy = "redirect-to-https"`

### TLS設定

| 設定 | 値 |
|------|-----|
| Minimum Protocol Version | TLSv1.2_2021 |
| SSL Support Method | sni-only |

### Origin Access Control (OAC)

S3オリジンへのアクセスはOACで制御されます。バケットポリシーは環境のmain.tfで別途設定されます。

## CloudFront Functions

### ImagePathFunction

画像パスの正規化を行うCloudFront Function:
- `/images/path/to/image.jpg` を `/path/to/image.jpg` にリライト

## Price Class

| クラス | エッジロケーション | コスト |
|-------|------------------|-------|
| PriceClass_100 | 北米、欧州 | 最低 |
| PriceClass_200 | + アジア、中東、アフリカ | 中 |
| PriceClass_All | 全リージョン | 最高 |

## 既存リソースのインポート

```hcl
# import.tf
import {
  to = aws_cloudfront_distribution.main
  id = "EXXXXXXXXXX"  # Distribution ID
}

import {
  to = aws_cloudfront_origin_access_control.s3_oac
  id = "EXXXXXXXXXXXXXXX"  # OAC ID
}

import {
  to = aws_cloudfront_function.image_path
  id = "ImagePathFunction-dev"
}

import {
  to = aws_cloudfront_cache_policy.images
  id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # Cache Policy ID
}
```

## 関連モジュール

- [storage](../storage/README.md) - S3バケット（オリジン）
- [api](../api/README.md) - API Gateway（オリジン）
- [lambda](../lambda/README.md) - CloudFrontドメインを環境変数として参照
