# Database Module

DynamoDBテーブルを管理するTerraformモジュールです。

## 概要

ブログ記事を格納するDynamoDBテーブルを作成し、以下の機能を提供します:

- PAY_PER_REQUEST課金モード
- CategoryIndex、PublishStatusIndex GSI
- ポイントインタイムリカバリ (PITR)
- サーバーサイド暗号化

## 使用方法

```hcl
module "database" {
  source = "../../modules/database"

  table_name  = "serverless-blog-posts-dev"
  environment = "dev"
  enable_pitr = true

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
| aws_dynamodb_table.blog_posts | resource |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| table_name | Name of the DynamoDB table | `string` | n/a | yes |
| environment | Environment identifier (dev, prd) | `string` | n/a | yes |
| enable_pitr | Enable Point-in-Time Recovery for DynamoDB table | `bool` | `true` | no |
| tags | Additional tags for resources | `map(string)` | `{}` | no |

## Outputs

| Name | Description |
|------|-------------|
| table_name | DynamoDB table name |
| table_arn | DynamoDB table ARN |
| table_id | DynamoDB table ID |
| category_index_name | CategoryIndex GSI name |
| publish_status_index_name | PublishStatusIndex GSI name |
| table_stream_arn | DynamoDB table stream ARN (if enabled) |

## テーブル構造

### プライマリキー

| 属性 | タイプ | 説明 |
|------|--------|------|
| id | String | 記事UUID（パーティションキー） |

### Global Secondary Indexes

#### CategoryIndex

| 属性 | キータイプ | 説明 |
|------|-----------|------|
| category | HASH | カテゴリ名 |
| createdAt | RANGE | 作成日時（ISO8601） |

#### PublishStatusIndex

| 属性 | キータイプ | 説明 |
|------|-----------|------|
| publishStatus | HASH | 公開ステータス (draft/published) |
| createdAt | RANGE | 作成日時（ISO8601） |

## 既存リソースのインポート

```hcl
# import.tf
import {
  to = aws_dynamodb_table.blog_posts
  id = "serverless-blog-posts-dev"  # 実際のテーブル名
}
```

## セキュリティ設定

- **暗号化**: AWSマネージドキーによるサーバーサイド暗号化が有効
- **削除保護**: prd環境では削除保護が有効
- **PITR**: デフォルトでポイントインタイムリカバリが有効

## 関連モジュール

- [lambda](../lambda/README.md) - DynamoDBへのアクセス権限を持つLambda関数
