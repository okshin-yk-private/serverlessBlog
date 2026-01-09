# リソースインポート失敗時の手動修復手順書

Terraformインポートが失敗した場合の個別リソースの手動修復手順を説明します。

**Requirements: 9.5**

## 概要

この手順書は、`terraform import`または`import`ブロックによるインポートが失敗した場合に、手動で問題を解決するための手順を提供します。

### よくあるインポート失敗の原因

1. **IDの不一致**: 指定したリソースIDが存在しない
2. **設定の不一致**: Terraform設定とAWSリソースの設定が異なる
3. **権限不足**: AWSアクセス権限が不十分
4. **リソースの依存関係**: 依存するリソースが先にインポートされていない
5. **状態の競合**: リソースが既に別の状態で管理されている

---

## 事前診断

インポート失敗時に最初に実行する診断手順:

```bash
# 1. エラーメッセージを記録
terraform plan 2>&1 | tee import-error.log

# 2. AWS側のリソース状態を確認
aws sts get-caller-identity
aws configure list

# 3. Terraform状態を確認
terraform state list
terraform show

# 4. AWSリソースの存在確認
# (リソース種別に応じたコマンドを実行)
```

---

## リソース別修復手順

### 1. DynamoDB テーブル

#### エラー: テーブルが見つからない

```bash
# 原因: テーブル名の不一致

# 1. 実際のテーブル名を確認
aws dynamodb list-tables --query 'TableNames[?contains(@, `serverless-blog`)]' --output text

# 2. テーブル詳細を確認
aws dynamodb describe-table --table-name <ACTUAL_TABLE_NAME>

# 3. import.tfを修正
# modules/database/import.tf
import {
  to = aws_dynamodb_table.blog_posts
  id = "<ACTUAL_TABLE_NAME>"  # 実際のテーブル名に修正
}
```

#### エラー: 設定の不一致（GSIなど）

```bash
# 1. GSI設定を確認
aws dynamodb describe-table --table-name <TABLE_NAME> \
  --query 'Table.GlobalSecondaryIndexes[*].{Name:IndexName,PK:KeySchema[0].AttributeName,SK:KeySchema[1].AttributeName}'

# 2. Terraform設定を実際のGSI設定に合わせて修正
# modules/database/main.tf のGSI定義を確認・修正

# 3. 差分を確認
terraform plan
```

**修正テンプレート (main.tf)**:

```hcl
resource "aws_dynamodb_table" "blog_posts" {
  name         = var.table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  attribute {
    name = "category"
    type = "S"
  }

  attribute {
    name = "createdAt"
    type = "S"
  }

  attribute {
    name = "publishStatus"
    type = "S"
  }

  # GSI設定 - AWS側の設定と一致させる
  global_secondary_index {
    name               = "CategoryIndex"  # 実際のGSI名に合わせる
    hash_key           = "category"
    range_key          = "createdAt"
    projection_type    = "ALL"
  }

  global_secondary_index {
    name               = "PublishStatusIndex"  # 実際のGSI名に合わせる
    hash_key           = "publishStatus"
    range_key          = "createdAt"
    projection_type    = "ALL"
  }
}
```

---

### 2. S3 バケット

#### エラー: バケットが見つからない

```bash
# 1. バケット一覧を確認
aws s3api list-buckets --query 'Buckets[?contains(Name, `serverless-blog`)].[Name]' --output text

# 2. import.tfを修正
```

#### エラー: バージョニング/暗号化設定の不一致

```bash
# 1. バージョニング設定を確認
aws s3api get-bucket-versioning --bucket <BUCKET_NAME>

# 2. 暗号化設定を確認
aws s3api get-bucket-encryption --bucket <BUCKET_NAME>

# 3. パブリックアクセスブロック設定を確認
aws s3api get-public-access-block --bucket <BUCKET_NAME>

# 4. ライフサイクル設定を確認
aws s3api get-bucket-lifecycle-configuration --bucket <BUCKET_NAME>
```

**修正テンプレート**:

```hcl
# 個別リソースとしてインポートする場合
# バージョニングが有効な場合
resource "aws_s3_bucket_versioning" "images" {
  bucket = aws_s3_bucket.images.id
  versioning_configuration {
    status = "Enabled"  # AWS側の設定と一致させる
  }
}

# 暗号化設定
resource "aws_s3_bucket_server_side_encryption_configuration" "images" {
  bucket = aws_s3_bucket.images.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"  # AWS側の設定と一致させる
    }
  }
}
```

---

### 3. Cognito User Pool

#### エラー: User Pool IDが見つからない

```bash
# 1. User Pool一覧を確認
aws cognito-idp list-user-pools --max-results 60 \
  --query "UserPools[?contains(Name, 'serverless-blog')].[Id,Name]" --output table

# 2. 正しいIDを取得
USER_POOL_ID=$(aws cognito-idp list-user-pools --max-results 60 \
  --query "UserPools[?Name=='serverless-blog-${ENVIRONMENT}'].Id" --output text)

# 3. import.tfを修正
# import {
#   to = aws_cognito_user_pool.main
#   id = "ap-northeast-1_XXXXXXXXX"  # 正しいIDに修正
# }
```

#### エラー: パスワードポリシーの不一致

```bash
# 1. 現在のポリシーを確認
aws cognito-idp describe-user-pool --user-pool-id $USER_POOL_ID \
  --query 'UserPool.Policies.PasswordPolicy'

# 2. Terraform設定を修正
```

**修正テンプレート**:

```hcl
resource "aws_cognito_user_pool" "main" {
  name = var.user_pool_name

  # AWS側のポリシーと一致させる
  password_policy {
    minimum_length                   = 12  # 実際の設定値
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = true
    require_uppercase                = true
    temporary_password_validity_days = 7
  }

  # MFA設定
  mfa_configuration = "OPTIONAL"  # 実際の設定値
}
```

#### エラー: App Clientの設定不一致

```bash
# 1. Client一覧を確認
aws cognito-idp list-user-pool-clients --user-pool-id $USER_POOL_ID \
  --query 'UserPoolClients[*].[ClientId,ClientName]' --output table

# 2. Client詳細を確認
aws cognito-idp describe-user-pool-client \
  --user-pool-id $USER_POOL_ID \
  --client-id <CLIENT_ID>
```

---

### 4. API Gateway

#### エラー: REST API IDが見つからない

```bash
# 1. REST API一覧を確認
aws apigateway get-rest-apis \
  --query "items[?contains(name, 'serverless-blog')].[id,name]" --output table

# 2. import.tfを修正
```

#### エラー: リソースパス/メソッドの不一致

```bash
# 1. リソース一覧を取得
REST_API_ID="<API_ID>"
aws apigateway get-resources --rest-api-id $REST_API_ID \
  --query 'items[*].[id,path]' --output table

# 2. メソッド一覧を確認
aws apigateway get-method --rest-api-id $REST_API_ID \
  --resource-id <RESOURCE_ID> --http-method GET
```

**手動インポートスクリプト**:

```bash
#!/bin/bash
# API Gatewayリソースの一括インポートヘルパー

REST_API_ID="<YOUR_API_ID>"
ENV="dev"

# リソースIDを取得してインポートブロックを生成
aws apigateway get-resources --rest-api-id $REST_API_ID \
  --query 'items[*].[id,path]' --output text | while read id path; do

  # パスからリソース名を推測
  resource_name=$(echo "$path" | sed 's|/||g; s|-|_|g; s|{.*}||g')

  if [ -n "$resource_name" ]; then
    echo "# Path: $path"
    echo "import {"
    echo "  to = aws_api_gateway_resource.$resource_name"
    echo "  id = \"$REST_API_ID/$id\""
    echo "}"
    echo ""
  fi
done
```

---

### 5. Lambda 関数

#### エラー: 関数が見つからない

```bash
# 1. 関数一覧を確認
aws lambda list-functions \
  --query "Functions[?contains(FunctionName, 'blog-')].[FunctionName,Runtime]" --output table

# 2. 正しい関数名でimport.tfを修正
```

#### エラー: ランタイム/アーキテクチャの不一致

```bash
# 1. 関数の設定を確認
aws lambda get-function --function-name blog-create-post-go \
  --query 'Configuration.{Runtime:Runtime,Arch:Architectures[0],Memory:MemorySize,Timeout:Timeout}'

# 2. 環境変数を確認
aws lambda get-function-configuration --function-name blog-create-post-go \
  --query 'Environment.Variables'

# 3. Terraform設定を修正
```

**修正テンプレート**:

```hcl
resource "aws_lambda_function" "create_post" {
  function_name = "blog-create-post-go"

  # AWS側の設定と一致させる
  runtime       = "provided.al2023"
  architectures = ["arm64"]
  handler       = "bootstrap"
  memory_size   = 128  # 実際の値
  timeout       = 30   # 実際の値

  # 環境変数を実際の設定と一致させる
  environment {
    variables = {
      TABLE_NAME      = var.table_name
      BUCKET_NAME     = var.bucket_name
      # ... 他の環境変数
    }
  }
}
```

---

### 6. CloudFront

#### エラー: ディストリビューションが見つからない

```bash
# 1. ディストリビューション一覧を確認
aws cloudfront list-distributions \
  --query "DistributionList.Items[*].[Id,DomainName,Comment]" --output table

# 2. import.tfを修正
```

#### エラー: オリジン設定の不一致

```bash
# 1. ディストリビューション設定を取得
aws cloudfront get-distribution --id <DIST_ID> \
  --query 'Distribution.DistributionConfig.Origins.Items[*].{Id:Id,Domain:DomainName}'

# 2. キャッシュビヘイビアを確認
aws cloudfront get-distribution --id <DIST_ID> \
  --query 'Distribution.DistributionConfig.CacheBehaviors.Items[*].{Path:PathPattern,Origin:TargetOriginId}'
```

---

## 共通の修復パターン

### パターン1: 完全一致を目指す

```bash
# 1. AWSリソースの現在の設定をエクスポート
aws <service> describe-<resource> --<id> > actual_config.json

# 2. Terraform設定と比較
terraform show -json | jq '.values.root_module.resources[] | select(.address == "aws_xxx.yyy")' > tf_config.json

# 3. 差分を確認
diff actual_config.json tf_config.json

# 4. Terraform設定を修正して差分をなくす
```

### パターン2: 段階的インポート

```bash
# 依存関係の少ないリソースから順にインポート
# 1. 基盤リソース
terraform apply -target=module.database
terraform apply -target=module.storage
terraform apply -target=module.auth

# 2. 依存リソース
terraform apply -target=module.api

# 3. アプリケーションリソース
terraform apply -target=module.lambda
terraform apply -target=module.cdn
terraform apply -target=module.monitoring
```

### パターン3: import後の差分許容

```hcl
# 一時的にlifecycleで変更を無視
resource "aws_xxx" "yyy" {
  # ...

  lifecycle {
    ignore_changes = [
      tags,  # タグの差分を無視
      # 他の属性
    ]
  }
}
```

---

## トラブルシューティングマトリックス

| エラーメッセージ | 原因 | 解決策 |
|----------------|------|--------|
| `Error: Cannot import non-existent resource` | IDが存在しない | AWSでリソースを確認し、正しいIDを使用 |
| `Error: Resource already managed` | 重複インポート | `terraform state rm`で既存エントリを削除 |
| `Error: Configuration does not match` | 設定差分 | Terraform設定をAWS設定に合わせて修正 |
| `Error: Access Denied` | 権限不足 | IAMポリシーを確認・追加 |
| `Error: Cycle dependency` | 循環参照 | depends_onを確認・調整 |

---

## 権限不足の修復

インポートに必要な最小権限:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:DescribeTable",
        "dynamodb:DescribeContinuousBackups",
        "s3:GetBucket*",
        "s3:ListBucket",
        "cognito-idp:DescribeUserPool",
        "cognito-idp:DescribeUserPoolClient",
        "cognito-idp:ListUserPoolClients",
        "apigateway:GET",
        "lambda:GetFunction",
        "lambda:GetFunctionConfiguration",
        "cloudfront:GetDistribution",
        "cloudfront:GetOriginAccessControl",
        "cloudwatch:DescribeAlarms",
        "sns:GetTopicAttributes"
      ],
      "Resource": "*"
    }
  ]
}
```

---

## 修復完了確認

```bash
# 1. terraform planで差分なしを確認
terraform plan
# Expected: No changes. Your infrastructure matches the configuration.

# 2. 検証スクリプト実行
./scripts/validate-import.sh ${ENVIRONMENT}

# 3. サービス疎通テスト
./scripts/health-check.sh ${ENVIRONMENT}
```

---

## 支援が必要な場合

上記の手順で解決できない場合:

1. エラーログを保存 (`terraform plan 2>&1 > error.log`)
2. AWS Supportにケースを作成（Enterprise Support）
3. Terraform Registryのドキュメントを確認
4. HashiCorp Discussで質問
