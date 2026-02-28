# Auth Module

Cognito User PoolとApp Clientを管理するTerraformモジュールです。

## 概要

ブログプラットフォームのユーザー認証を提供する以下のリソースを作成・管理します:

- **User Pool**: Eメールベースサインイン、パスワードポリシー、MFA設定
- **App Client**: 認証フロー設定、トークン有効期限

## 使用方法

```hcl
module "auth" {
  source = "../../modules/auth"

  user_pool_name          = "serverless-blog-dev"
  environment             = "dev"
  mfa_configuration       = "OPTIONAL"
  password_minimum_length = 12

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
| aws_cognito_user_pool.main | resource |
| aws_cognito_user_pool_client.main | resource |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| user_pool_name | Cognito User Pool name | `string` | n/a | yes |
| environment | Environment identifier (dev, prd) | `string` | n/a | yes |
| mfa_configuration | MFA configuration (OFF, OPTIONAL, ON) | `string` | `"OPTIONAL"` | no |
| password_minimum_length | Minimum password length | `number` | `12` | no |
| tags | Additional tags for resources | `map(string)` | `{}` | no |

## Outputs

| Name | Description |
|------|-------------|
| user_pool_id | Cognito User Pool ID |
| user_pool_arn | Cognito User Pool ARN |
| user_pool_client_id | Cognito User Pool Client ID |

## パスワードポリシー

| 設定 | 値 |
|------|-----|
| 最小長 | 12文字（デフォルト） |
| 大文字必須 | true |
| 小文字必須 | true |
| 数字必須 | true |
| 記号必須 | true |

## 認証フロー

App Clientで有効な認証フロー:

- `ALLOW_USER_PASSWORD_AUTH`: ユーザー名/パスワード認証
- `ALLOW_USER_SRP_AUTH`: SRP認証
- `ALLOW_REFRESH_TOKEN_AUTH`: リフレッシュトークン

## トークン有効期限

| トークン | 有効期限 |
|---------|---------|
| Access Token | 1時間 |
| ID Token | 1時間 |
| Refresh Token | 30日 |

## 既存リソースのインポート

```hcl
# import.tf
import {
  to = aws_cognito_user_pool.main
  id = "ap-northeast-1_XXXXXXXXX"  # User Pool ID
}

import {
  to = aws_cognito_user_pool_client.main
  id = "ap-northeast-1_XXXXXXXXX/YYYYYYYYYYYYYYYYYYYYYYYYY"  # {user_pool_id}/{client_id}
}
```

## セキュリティ考慮事項

- MFAはデフォルトでOPTIONAL（ユーザー選択可能）
- パスワードポリシーは厳格に設定
- App ClientはクライアントシークレットなしでSPA向けに設定

## 関連モジュール

- [api](../api/README.md) - Cognito AuthorizerによるAPI保護
- [lambda](../lambda/README.md) - 認証関連Lambda関数
