# Lambda Module

Go Lambda関数とIAMロールを管理するTerraformモジュールです。

## 概要

ブログプラットフォームの11のGo Lambda関数を作成・管理します:

- **Posts関数**: createPost、getPost、getPublicPost、listPosts、updatePost、deletePost
- **Auth関数**: login、logout、refresh
- **Images関数**: getUploadUrl、deleteImage

## 使用方法

```hcl
module "lambda" {
  source = "../../modules/lambda"

  environment         = "dev"
  table_name          = module.database.table_name
  table_arn           = module.database.table_arn
  bucket_name         = module.storage.image_bucket_name
  bucket_arn          = module.storage.image_bucket_arn
  user_pool_id        = module.auth.user_pool_id
  user_pool_arn       = module.auth.user_pool_arn
  user_pool_client_id = module.auth.user_pool_client_id
  cloudfront_domain   = module.cdn.distribution_domain_name
  enable_xray         = false
  go_binary_path      = "${path.module}/../../../go-functions/bin"

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
| archive | ~> 2.0 |

## Providers

| Name | Version |
|------|---------|
| aws | ~> 6.0 |
| archive | ~> 2.0 |

## Resources

| Name | Type |
|------|------|
| aws_lambda_function.* | resource |
| aws_iam_role.lambda_posts | resource |
| aws_iam_role.lambda_auth | resource |
| aws_iam_role.lambda_images | resource |
| aws_iam_policy.* | resource |
| aws_cloudwatch_log_group.* | resource |
| data.archive_file.* | data source |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| environment | Environment identifier (dev, prd) | `string` | n/a | yes |
| table_name | DynamoDB table name | `string` | n/a | yes |
| table_arn | DynamoDB table ARN | `string` | n/a | yes |
| bucket_name | S3 bucket name for images | `string` | n/a | yes |
| bucket_arn | S3 bucket ARN for images | `string` | n/a | yes |
| user_pool_id | Cognito User Pool ID | `string` | n/a | yes |
| user_pool_arn | Cognito User Pool ARN for IAM policy | `string` | n/a | yes |
| user_pool_client_id | Cognito User Pool Client ID | `string` | n/a | yes |
| cloudfront_domain | CloudFront domain name | `string` | n/a | yes |
| enable_xray | Enable X-Ray tracing (recommended for prd) | `bool` | `false` | no |
| go_binary_path | Path to Go binaries | `string` | `"../../go-functions/bin"` | no |
| tags | Additional tags for resources | `map(string)` | `{}` | no |

## Outputs

| Name | Description |
|------|-------------|
| function_arns | Map of Lambda function ARNs |
| function_invoke_arns | Map of Lambda function Invoke ARNs for API Gateway |
| function_names | List of all Lambda function names |
| posts_role_arn | Posts domain Lambda execution role ARN |
| auth_role_arn | Auth domain Lambda execution role ARN |
| images_role_arn | Images domain Lambda execution role ARN |
| *_function_arn | 個別の関数ARN |
| *_function_name | 個別の関数名 |

## 関数一覧

| 関数名 | ドメイン | 説明 | メモリ | タイムアウト |
|-------|---------|------|--------|------------|
| create_post | posts | 記事作成 | 128MB | 30s |
| get_post | posts | 記事取得（管理用） | 128MB | 30s |
| get_public_post | posts | 記事取得（公開用） | 128MB | 30s |
| list_posts | posts | 記事一覧 | 128MB | 30s |
| update_post | posts | 記事更新 | 128MB | 30s |
| delete_post | posts | 記事削除 | 128MB | 30s |
| login | auth | ログイン | 128MB | 30s |
| logout | auth | ログアウト | 128MB | 30s |
| refresh | auth | トークン更新 | 128MB | 30s |
| get_upload_url | images | 画像アップロードURL取得 | 128MB | 30s |
| delete_image | images | 画像削除 | 128MB | 30s |

## ランタイム設定

| 設定 | 値 |
|------|-----|
| Runtime | provided.al2023 |
| Architecture | arm64 (Graviton2) |
| Handler | bootstrap |

## 環境変数

全関数に共通の環境変数:

| 変数名 | 説明 |
|-------|------|
| TABLE_NAME | DynamoDBテーブル名 |
| BUCKET_NAME | S3バケット名 |
| USER_POOL_ID | Cognito User Pool ID |
| USER_POOL_CLIENT_ID | Cognito User Pool Client ID |
| CLOUDFRONT_DOMAIN | CloudFrontドメイン名 |
| ENVIRONMENT | 環境識別子 |

## IAMロール構成

最小権限原則に基づき、関数グループ別にIAMロールを分離:

### posts ロール

```
- dynamodb:GetItem
- dynamodb:PutItem
- dynamodb:UpdateItem
- dynamodb:DeleteItem
- dynamodb:Query
- logs:CreateLogGroup
- logs:CreateLogStream
- logs:PutLogEvents
```

### auth ロール

```
- cognito-idp:AdminInitiateAuth
- cognito-idp:AdminRespondToAuthChallenge
- cognito-idp:GlobalSignOut
- logs:CreateLogGroup
- logs:CreateLogStream
- logs:PutLogEvents
```

### images ロール

```
- s3:PutObject
- s3:DeleteObject
- s3:GetObject
- logs:CreateLogGroup
- logs:CreateLogStream
- logs:PutLogEvents
```

## X-Rayトレーシング

`enable_xray = true`で有効化されます（prd環境推奨）。

追加されるIAMポリシー:
```
- xray:PutTraceSegments
- xray:PutTelemetryRecords
```

## 既存リソースのインポート

```hcl
# import.tf
import {
  to = aws_lambda_function.create_post
  id = "blog-create-post-go"
}

import {
  to = aws_cloudwatch_log_group.create_post
  id = "/aws/lambda/blog-create-post-go"
}

import {
  to = aws_iam_role.lambda_posts
  id = "lambda-posts-role"
}
```

## ビルド要件

Lambda関数は事前にビルドされたGoバイナリを参照します:

```bash
cd go-functions
make build  # ARM64用バイナリをbin/にビルド
```

ディレクトリ構造:
```
go-functions/
└── bin/
    ├── createPost/bootstrap
    ├── getPost/bootstrap
    ├── getPublicPost/bootstrap
    ├── listPosts/bootstrap
    ├── updatePost/bootstrap
    ├── deletePost/bootstrap
    ├── login/bootstrap
    ├── logout/bootstrap
    ├── refresh/bootstrap
    ├── getUploadUrl/bootstrap
    └── deleteImage/bootstrap
```

## 関連モジュール

- [database](../database/README.md) - DynamoDBテーブル（Posts関数用）
- [storage](../storage/README.md) - S3バケット（Images関数用）
- [auth](../auth/README.md) - Cognito（Auth関数用）
- [api](../api/README.md) - API Gateway統合
- [monitoring](../monitoring/README.md) - CloudWatchアラーム
