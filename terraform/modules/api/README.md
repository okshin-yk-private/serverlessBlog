# API Module

API GatewayとCognito Authorizerを管理するTerraformモジュールです。

## 概要

ブログAPIのエンドポイントを提供する以下のリソースを作成・管理します:

- **REST API**: ブログAPIのメインエントリポイント
- **Cognito Authorizer**: 保護されたエンドポイントの認証
- **APIリソース/メソッド**: /posts、/imagesエンドポイント
- **デプロイメントステージ**: dev/prd環境

## 使用方法

```hcl
module "api" {
  source = "../../modules/api"

  api_name              = "serverless-blog-api-dev"
  environment           = "dev"
  stage_name            = "dev"
  cognito_user_pool_arn = module.auth.user_pool_arn
  cors_allow_origins    = ["*"]

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
| aws_api_gateway_rest_api.main | resource |
| aws_api_gateway_authorizer.cognito | resource |
| aws_api_gateway_resource.* | resource |
| aws_api_gateway_method.* | resource |
| aws_api_gateway_request_validator.main | resource |
| aws_api_gateway_stage.main | resource |
| aws_api_gateway_deployment.main | resource |
| aws_api_gateway_method_settings.all | resource |
| aws_api_gateway_method_settings.admin_write | resource |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| api_name | REST API name | `string` | n/a | yes |
| environment | Environment identifier (dev, prd) | `string` | n/a | yes |
| stage_name | API stage name | `string` | n/a | yes |
| cognito_user_pool_arn | Cognito User Pool ARN for Authorizer | `string` | n/a | yes |
| cors_allow_origins | CORS allowed origins | `list(string)` | `["*"]` | no |
| throttling_rate_limit | Stage-wide default throttling rate limit (requests per second), applied to `*/*` | `number` | `100` | no |
| throttling_burst_limit | Stage-wide default throttling burst limit, applied to `*/*` | `number` | `200` | no |
| admin_write_throttling_rate_limit | Throttling rate limit for admin write methods (POST/PUT/PATCH/DELETE under `/admin/...`); must be positive and ≤ `throttling_rate_limit` | `number` | `10` | no |
| admin_write_throttling_burst_limit | Throttling burst limit for admin write methods (POST/PUT/PATCH/DELETE under `/admin/...`); must be positive and ≤ `throttling_burst_limit` | `number` | `20` | no |
| tags | Additional tags for resources | `map(string)` | `{}` | no |

## Outputs

| Name | Description |
|------|-------------|
| rest_api_id | REST API ID |
| rest_api_execution_arn | REST API Execution ARN |
| rest_api_root_resource_id | REST API Root Resource ID |
| api_endpoint | API endpoint URL |
| stage_name | API Gateway stage name |
| authorizer_id | Cognito Authorizer ID |
| request_validator_id | Request Validator ID |
| deployment_id | Deployment ID |
| *_resource_id | 各リソースID（posts、auth、images等） |

## APIエンドポイント構造

```
/
├── posts                     # 公開記事一覧
│   └── {id}                  # 公開記事詳細
└── admin
    ├── posts                 # 管理用記事操作 (認証必須)
    │   └── {id}              # 記事CRUD
    └── images
        ├── upload-url        # アップロードURL取得 (認証必須)
        └── {key+}            # 画像削除 (認証必須)
```

## 認証設定

| エンドポイント | メソッド | 認証 |
|---------------|---------|------|
| GET /posts | GET | なし |
| GET /posts/{id} | GET | なし |
| POST /admin/posts | POST | Cognito |
| GET /admin/posts/{id} | GET | Cognito |
| PUT /admin/posts/{id} | PUT | Cognito |
| DELETE /admin/posts/{id} | DELETE | Cognito |
| POST /admin/images/upload-url | POST | Cognito |
| DELETE /admin/images/{key+} | DELETE | Cognito |

## スロットリング

ステージ全体（`*/*`）にデフォルト 100 rps / burst 200 の共通スロットリングを適用します。加えて、
`/admin/...` 配下の書き込み系メソッド（POST/PUT/PATCH/DELETE。OPTIONSと公開GETは対象外）には、
個別に低い上限（デフォルト 10 rps / burst 20）を設定しています。管理画面の自動保存
（デバウンス1.5秒、開いているエディタ1つあたり約0.7rps）や複数画像の同時アップロードは問題なく
収まりつつ、単一の送信元がステージ全体の枠を使い切って他の全APIを429にする事態を防ぎます。

公開GET（`/posts`, `/categories`）はステージ全体の設定のままです。Astro SSGのビルド時に
公開APIを呼び出すため、個別の低い上限を設けてビルドを不安定にするリスクを避けています。

`admin_write_throttling_rate_limit` / `admin_write_throttling_burst_limit` は、それぞれ
`throttling_rate_limit` / `throttling_burst_limit`（ステージ全体の上限）を超えない値であることを
バリデーションで強制します。

## CORS設定

デフォルトで全オリジン（`*`）を許可します。本番環境では特定のオリジンに制限することを推奨します。

許可されるメソッド:
- GET
- POST
- PUT
- DELETE
- OPTIONS

許可されるヘッダー:
- Content-Type
- Authorization
- X-Amz-Date
- X-Api-Key
- X-Amz-Security-Token

## 既存リソースのインポート

```hcl
# import.tf
import {
  to = aws_api_gateway_rest_api.main
  id = "xxxxxxxxxx"  # REST API ID
}

import {
  to = aws_api_gateway_authorizer.cognito
  id = "xxxxxxxxxx/yyyyyyyy"  # {rest_api_id}/{authorizer_id}
}

import {
  to = aws_api_gateway_resource.posts
  id = "xxxxxxxxxx/aaaaaa"  # {rest_api_id}/{resource_id}
}

import {
  to = aws_api_gateway_stage.main
  id = "xxxxxxxxxx/dev"  # {rest_api_id}/{stage_name}
}
```

## Lambda統合

Lambda関数との統合は環境のmain.tfで別途設定されます。

```hcl
resource "aws_api_gateway_integration" "create_post" {
  rest_api_id             = module.api.rest_api_id
  resource_id             = module.api.admin_posts_resource_id
  http_method             = "POST"
  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = module.lambda.function_invoke_arns["create_post"]
}
```

## 関連モジュール

- [auth](../auth/README.md) - Cognito User Pool（Authorizer用）
- [lambda](../lambda/README.md) - バックエンドLambda関数
- [cdn](../cdn/README.md) - CloudFrontからのAPI呼び出し
