# Terraform Import Guide

このドキュメントは、既存CDK管理リソースをTerraformへインポートするための手順を説明します。

**Requirements: 9.1, 9.2, 9.3, 9.4, 9.5**

## 前提条件

1. **AWS CLI設定済み**
   ```bash
   aws configure
   # または
   export AWS_PROFILE=dev  # dev環境の場合
   export AWS_PROFILE=prd  # prd環境の場合
   ```

2. **Terraform 1.14.0以上**
   ```bash
   terraform version
   # Terraform v1.14.x
   ```

3. **jqインストール済み**
   ```bash
   jq --version
   ```

4. **状態バケットが存在する**
   ```bash
   # bootstrapが実行済みであること
   cd terraform/bootstrap
   terraform init && terraform apply
   ```

---

## Phase 0: 事前準備

### 1. 現行CDK状態のバックアップ

```bash
# CDK CloudFormationスタックの一覧
aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE

# スタックのエクスポート（参考用）
for stack in DatabaseStack StorageStack AuthStack ApiStack GoLambdaStack CdnStack MonitoringStack; do
  aws cloudformation get-template --stack-name "BlogApp-$stack" > "backup/cdk-$stack-template.json"
done
```

### 2. リソースIDの取得

各リソースのIDを取得してメモします。

#### DynamoDB

```bash
# テーブル名を確認
aws dynamodb list-tables --query 'TableNames[?contains(@, `serverless-blog`)]'
```

#### S3

```bash
# バケット一覧
aws s3api list-buckets --query 'Buckets[?contains(Name, `serverless-blog`)].[Name]' --output table
```

#### Cognito

```bash
# User Pool ID
aws cognito-idp list-user-pools --max-results 60 --query "UserPools[?contains(Name, 'serverless-blog')].[Id,Name]" --output table

# User Pool Client ID
USER_POOL_ID="ap-northeast-1_XXXXXXXXX"  # 上記で取得したID
aws cognito-idp list-user-pool-clients --user-pool-id $USER_POOL_ID --query 'UserPoolClients[*].[ClientId,ClientName]' --output table
```

#### API Gateway

```bash
# REST API ID
aws apigateway get-rest-apis --query "items[?contains(name, 'serverless-blog')].[id,name]" --output table

# Authorizer ID
REST_API_ID="xxxxxxxxxx"  # 上記で取得したID
aws apigateway get-authorizers --rest-api-id $REST_API_ID --query 'items[*].[id,name]' --output table

# Resource IDs
aws apigateway get-resources --rest-api-id $REST_API_ID --query 'items[*].[id,path]' --output table
```

#### Lambda

```bash
# Lambda関数一覧
aws lambda list-functions --query "Functions[?contains(FunctionName, 'blog-')].[FunctionName,Runtime,Architectures[0]]" --output table
```

#### CloudFront

```bash
# Distribution ID
aws cloudfront list-distributions --query "DistributionList.Items[?contains(Comment, 'blog') || contains(Comment, 'Blog')].[Id,DomainName,Comment]" --output table

# OAC ID
aws cloudfront list-origin-access-controls --query 'OriginAccessControlList.Items[*].[Id,Name]' --output table

# CloudFront Functions
aws cloudfront list-functions --query 'FunctionList.Items[*].[Name,Status]' --output table

# Cache Policies (custom)
aws cloudfront list-cache-policies --type custom --query 'CachePolicyList.Items[*].CachePolicy.[Id,CachePolicyConfig.Name]' --output table

# Origin Request Policies (custom)
aws cloudfront list-origin-request-policies --type custom --query 'OriginRequestPolicyList.Items[*].OriginRequestPolicy.[Id,OriginRequestPolicyConfig.Name]' --output table
```

---

## Phase 1: インポートブロックの設定

### 1. import.tfファイルの更新

各モジュールの`import.tf`ファイルのコメントを解除し、実際のIDを設定します。

#### modules/database/import.tf

```hcl
import {
  to = aws_dynamodb_table.blog_posts
  id = "serverless-blog-posts-dev"  # 実際のテーブル名
}
```

#### modules/storage/import.tf

```hcl
# 画像バケット
import {
  to = aws_s3_bucket.images
  id = "serverless-blog-images-dev-123456789012"  # 実際のバケット名
}

# 関連リソースも忘れずに
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

# 他のバケットも同様...
```

#### modules/auth/import.tf

```hcl
import {
  to = aws_cognito_user_pool.main
  id = "ap-northeast-1_XXXXXXXXX"  # 実際のUser Pool ID
}

import {
  to = aws_cognito_user_pool_client.main
  id = "ap-northeast-1_XXXXXXXXX/YYYYYYYYYYYYYYYYYYYYYYYYY"  # {user_pool_id}/{client_id}
}
```

#### modules/api/import.tf

```hcl
# REST API
import {
  to = aws_api_gateway_rest_api.main
  id = "xxxxxxxxxx"  # 実際のREST API ID
}

# Authorizer
import {
  to = aws_api_gateway_authorizer.cognito
  id = "xxxxxxxxxx/yyyyyyyy"  # {rest_api_id}/{authorizer_id}
}

# 各リソース（取得したresource_idを使用）
import {
  to = aws_api_gateway_resource.posts
  id = "xxxxxxxxxx/aaaaaa"  # {rest_api_id}/{resource_id}
}

# Stage
import {
  to = aws_api_gateway_stage.main
  id = "xxxxxxxxxx/dev"  # {rest_api_id}/{stage_name}
}
```

#### modules/lambda/import.tf

```hcl
# 各Lambda関数
import {
  to = aws_lambda_function.create_post
  id = "blog-create-post-go"
}

import {
  to = aws_lambda_function.get_post
  id = "blog-get-post-go"
}

# 他の関数も同様...

# CloudWatch Log Groups
import {
  to = aws_cloudwatch_log_group.create_post
  id = "/aws/lambda/blog-create-post-go"
}
```

#### modules/cdn/import.tf

```hcl
import {
  to = aws_cloudfront_distribution.main
  id = "EXXXXXXXXXX"  # 実際のDistribution ID
}

import {
  to = aws_cloudfront_origin_access_control.s3_oac
  id = "EXXXXXXXXXXXXXXX"  # 実際のOAC ID
}

import {
  to = aws_cloudfront_function.image_path
  id = "ImagePathFunction-dev"
}

import {
  to = aws_cloudfront_cache_policy.images
  id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"  # 実際のCache Policy ID
}
```

---

## Phase 2: インポートの実行

### 1. Terraform初期化

```bash
cd terraform/environments/dev

# バックエンド初期化
terraform init

# フォーマットと検証
terraform fmt -check -recursive
terraform validate
```

### 2. インポートプレビュー

```bash
# planでインポート対象を確認
terraform plan

# 期待される出力:
# Plan: X to import, 0 to add, 0 to change, 0 to destroy.
```

**重要:** `terraform plan`の出力で`to change`や`to destroy`がある場合は、Terraform設定とAWSリソースの差分を確認し、設定を調整してください。

### 3. インポート実行

```bash
# インポート実行
terraform apply

# 確認プロンプトで "yes" を入力
```

### 4. インポート後の検証

```bash
# 状態確認
terraform state list

# 差分がないことを確認
terraform plan
# 期待される出力:
# No changes. Your infrastructure matches the configuration.
```

---

## Phase 3: 検証

### 1. 検証スクリプトの実行

```bash
cd terraform
./scripts/validate-import.sh dev
```

### 2. サービス疎通テスト

```bash
# API疎通確認
CLOUDFRONT_DOMAIN=$(terraform output -raw cloudfront_domain_name)
curl -I "https://$CLOUDFRONT_DOMAIN/"
curl -I "https://$CLOUDFRONT_DOMAIN/api/posts"

# 管理画面アクセス確認
curl -I "https://$CLOUDFRONT_DOMAIN/admin/"
```

### 3. 機能テスト

```bash
# 記事一覧取得
curl "https://$CLOUDFRONT_DOMAIN/api/posts" | jq .

# 公開記事取得（存在する場合）
curl "https://$CLOUDFRONT_DOMAIN/api/posts/{id}" | jq .
```

---

## ロールバック手順

インポートに失敗した場合、以下の手順でロールバックします。

### 1. Terraform状態の削除

```bash
# 特定リソースを状態から削除（AWSリソースは削除しない）
terraform state rm module.database.aws_dynamodb_table.blog_posts

# または全状態をリセット
rm -rf .terraform/terraform.tfstate
```

### 2. CDKへの復帰

```bash
# CDKプロジェクトに戻る
cd infrastructure

# CDKデプロイで状態を確認（変更なしを期待）
npx cdk diff

# 必要に応じてCDKで再デプロイ
npx cdk deploy --all
```

### 3. 手動修復手順

リソースインポートが失敗した場合の個別対応:

#### DynamoDB

```bash
# テーブル設定の確認と修正
aws dynamodb describe-table --table-name serverless-blog-posts-dev

# Terraform設定を実際のリソースに合わせて修正
```

#### S3

```bash
# バケット設定の確認
aws s3api get-bucket-versioning --bucket serverless-blog-images-dev-...
aws s3api get-bucket-encryption --bucket serverless-blog-images-dev-...

# ライフサイクル設定の確認
aws s3api get-bucket-lifecycle-configuration --bucket serverless-blog-images-dev-...
```

#### CloudFront

```bash
# ディストリビューション設定の確認
aws cloudfront get-distribution --id EXXXXXXXXXX

# 設定の差分を確認し、Terraform設定を調整
```

---

## トラブルシューティング

### Error: Resource already managed by Terraform

状態ファイルにすでにリソースが存在する場合:

```bash
# 状態を確認
terraform state list | grep "aws_dynamodb_table"

# 既存エントリを削除してから再インポート
terraform state rm module.database.aws_dynamodb_table.blog_posts
```

### Error: Import ID not found

指定したIDでリソースが見つからない場合:

```bash
# AWSで実際のリソースIDを確認
aws dynamodb list-tables
aws s3api list-buckets

# import.tfのIDを修正
```

### Error: Configuration does not match imported resource

Terraform設定とAWSリソースの設定が異なる場合:

1. `terraform plan`の出力で差分を確認
2. Terraform設定をAWSリソースに合わせて修正
3. または、計画的にAWSリソースを更新

### Error: Circular dependency

モジュール間の循環参照がある場合:

1. 依存関係を確認（`depends_on`の設定）
2. インポート順序を調整（基盤層→API層→コンピュート層→配信層）
3. 必要に応じて一時的に`import`ブロックを分割

---

## チェックリスト

### インポート前

- [ ] CDK状態のバックアップ完了
- [ ] 全リソースIDの取得完了
- [ ] import.tfファイルの更新完了
- [ ] terraform validateが成功

### インポート後

- [ ] terraform planで差分なし
- [ ] 検証スクリプトがパス
- [ ] API疎通テスト成功
- [ ] 管理画面アクセス可能
- [ ] import.tfのコメントアウトまたは削除

### 本番移行前

- [ ] dev環境でのインポート成功
- [ ] dev環境での機能テスト完了
- [ ] prd環境のリソースID取得
- [ ] prd環境のimport.tf更新
- [ ] 本番デプロイ計画の承認
