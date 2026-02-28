# API Module

API GatewayとCognito Authorizerを管理するTerraformモジュールです。

## 概要

ブログAPIのエンドポイントを提供する以下のリソースを作成・管理します:

- **REST API**: ブログAPIのメインエントリポイント
- **Cognito Authorizer**: 保護されたエンドポイントの認証
- **APIリソース/メソッド**: /posts、/auth、/imagesエンドポイント
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

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| api_name | REST API name | `string` | n/a | yes |
| environment | Environment identifier (dev, prd) | `string` | n/a | yes |
| stage_name | API stage name | `string` | n/a | yes |
| cognito_user_pool_arn | Cognito User Pool ARN for Authorizer | `string` | n/a | yes |
| cors_allow_origins | CORS allowed origins | `list(string)` | `["*"]` | no |
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
    ├── images
    │   ├── upload-url        # アップロードURL取得 (認証必須)
    │   └── {key+}            # 画像削除 (認証必須)
    └── auth
        ├── login             # ログイン
        ├── logout            # ログアウト (認証必須)
        └── refresh           # トークン更新
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
| POST /admin/auth/login | POST | なし |
| POST /admin/auth/logout | POST | Cognito |
| POST /admin/auth/refresh | POST | なし |

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
