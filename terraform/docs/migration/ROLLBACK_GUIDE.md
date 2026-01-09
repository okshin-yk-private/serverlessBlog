# ロールバック手順書

Terraform移行が失敗した場合のロールバック手順を説明します。

**Requirements: 9.3**

## 概要

この手順書は、CDKからTerraformへの移行中または移行後に問題が発生した場合に、システムを元の状態に戻すための手順を提供します。

### 想定シナリオ

1. **terraform apply失敗**: importまたはリソース作成/更新が途中で失敗
2. **サービス疎通失敗**: 移行後にアプリケーションが正常に動作しない
3. **設定ミスマッチ**: Terraform設定とAWSリソースの設定が一致しない
4. **パフォーマンス問題**: 移行後にパフォーマンスが劣化

---

## 前提条件

ロールバック実行前に以下を確認してください:

- [ ] AWS CLI設定済み（適切な認証情報）
- [ ] Terraform CLIインストール済み
- [ ] CDKコードが残っている（まだ削除していない）
- [ ] CloudFormationスタックが存在する

```bash
# 前提条件の確認
aws sts get-caller-identity
terraform version
cd infrastructure && npx cdk --version

# CloudFormationスタックの存在確認
aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
  --query 'StackSummaries[?contains(StackName, `BlogApp`)].[StackName,StackStatus]' --output table
```

---

## ロールバックレベル

問題の深刻度に応じて、適切なロールバックレベルを選択してください。

### レベル1: Terraform状態のロールバック（影響: 最小）

Terraform状態ファイルをロールバックし、AWSリソースは変更しません。

**適用条件**:
- Terraform importが途中で失敗した
- terraform applyがエラーで中断された
- Terraform状態とAWSリソースの不整合

**手順**:

```bash
cd terraform/environments/${ENVIRONMENT}

# 1. 現在の状態をバックアップ
terraform state pull > terraform.tfstate.backup.$(date +%Y%m%d_%H%M%S)

# 2. 問題のあるリソースを状態から削除（AWSリソースは削除しない）
terraform state rm module.database.aws_dynamodb_table.blog_posts
terraform state rm module.storage.aws_s3_bucket.images
terraform state rm module.storage.aws_s3_bucket.public_site
terraform state rm module.storage.aws_s3_bucket.admin_site
# ... 他のリソースも必要に応じて削除

# 3. または、S3状態バケットから以前のバージョンを復元
aws s3 cp s3://${STATE_BUCKET}/serverless-blog/terraform.tfstate ./terraform.tfstate.old
aws s3 cp ./terraform.tfstate.old s3://${STATE_BUCKET}/serverless-blog/terraform.tfstate

# 4. 状態の確認
terraform state list
```

---

### レベル2: 部分的なロールバック（影響: 中）

特定のモジュールのみをロールバックします。

**適用条件**:
- 特定のリソース（例: Lambda関数）の設定に問題がある
- 一部のリソースのみ移行が完了していない

**手順**:

```bash
cd terraform/environments/${ENVIRONMENT}

# 1. 問題のあるモジュールを特定
terraform state list | grep module.lambda

# 2. モジュールの状態を削除
terraform state rm module.lambda

# 3. CDKで該当スタックを再デプロイ
cd ../../../infrastructure
npx cdk deploy BlogApp-GoLambdaStack --require-approval never

# 4. 他のモジュールはTerraform管理のまま維持
```

---

### レベル3: 完全ロールバック（影響: 大）

すべてのリソースをCDK管理に戻します。

**適用条件**:
- 全体的な移行失敗
- 複数のリソースで問題が発生
- 本番環境の緊急復旧

**手順**:

```bash
# ===== Step 1: Terraform状態の完全削除 =====
cd terraform/environments/${ENVIRONMENT}

# 状態バックアップ
terraform state pull > terraform.tfstate.fullbackup.$(date +%Y%m%d_%H%M%S)

# 状態から全リソースを削除（AWSリソースは削除しない！）
terraform state list | while read resource; do
  terraform state rm "$resource"
done

# ===== Step 2: CDKの状態確認 =====
cd ../../../infrastructure

# CDKがリソースを認識していることを確認
npx cdk diff --all

# ===== Step 3: CDKで完全再デプロイ =====
# 注意: --forceを使用してCDK状態をリフレッシュ
npx cdk deploy --all --require-approval never

# ===== Step 4: 検証 =====
# CloudFormationスタックの状態確認
aws cloudformation describe-stacks \
  --query 'Stacks[?contains(StackName, `BlogApp`)].[StackName,StackStatus]' --output table

# サービス疎通確認
./scripts/health-check.sh ${ENVIRONMENT}
```

---

## リソース別ロールバック手順

### DynamoDB

```bash
# Terraform状態から削除（データは保持）
terraform state rm module.database.aws_dynamodb_table.blog_posts

# CDKでテーブル設定を確認
cd infrastructure
npx cdk diff BlogApp-DatabaseStack

# テーブルの動作確認
aws dynamodb describe-table --table-name serverless-blog-posts-${ENVIRONMENT}
aws dynamodb scan --table-name serverless-blog-posts-${ENVIRONMENT} --limit 1
```

### S3バケット

```bash
# Terraform状態から削除（データは保持）
terraform state rm module.storage.aws_s3_bucket.images
terraform state rm module.storage.aws_s3_bucket_versioning.images
terraform state rm module.storage.aws_s3_bucket_server_side_encryption_configuration.images
terraform state rm module.storage.aws_s3_bucket_public_access_block.images

# バケットポリシーの確認
aws s3api get-bucket-policy --bucket serverless-blog-images-${ENVIRONMENT}-${ACCOUNT_ID}

# CDKでバケット設定を確認
npx cdk diff BlogApp-StorageStack
```

### Cognito

```bash
# Terraform状態から削除（ユーザーデータは保持）
terraform state rm module.auth.aws_cognito_user_pool.main
terraform state rm module.auth.aws_cognito_user_pool_client.main

# User Pool IDを確認
aws cognito-idp list-user-pools --max-results 60 \
  --query "UserPools[?Name=='serverless-blog-${ENVIRONMENT}'].Id" --output text

# ユーザー一覧を確認（影響確認）
aws cognito-idp list-users --user-pool-id ${USER_POOL_ID} --limit 5
```

### API Gateway

```bash
# Terraform状態から削除（APIは動作継続）
terraform state rm module.api.aws_api_gateway_rest_api.main
terraform state rm module.api.aws_api_gateway_authorizer.cognito
terraform state rm module.api.aws_api_gateway_stage.main

# REST API IDを確認
aws apigateway get-rest-apis \
  --query "items[?name=='serverless-blog-api-${ENVIRONMENT}'].id" --output text

# APIの動作確認
curl -I "https://${API_ENDPOINT}/api/posts"
```

### Lambda関数

```bash
# 特定の関数のみ状態から削除
terraform state rm module.lambda.aws_lambda_function.create_post
terraform state rm module.lambda.aws_lambda_function.get_post
# ... 他の関数

# または全Lambda関数を一括削除
terraform state list | grep aws_lambda_function | while read resource; do
  terraform state rm "$resource"
done

# Lambda関数の動作確認
aws lambda invoke --function-name blog-create-post-go \
  --payload '{"test": true}' /dev/null
```

### CloudFront

```bash
# Terraform状態から削除（配信は継続）
terraform state rm module.cdn.aws_cloudfront_distribution.main
terraform state rm module.cdn.aws_cloudfront_origin_access_control.s3_oac

# ディストリビューションの状態確認
aws cloudfront get-distribution --id ${DISTRIBUTION_ID} \
  --query 'Distribution.Status' --output text

# キャッシュ無効化（必要な場合）
aws cloudfront create-invalidation --distribution-id ${DISTRIBUTION_ID} \
  --paths "/*"
```

---

## ロールバック検証

ロールバック完了後、以下の検証を実施してください。

### 1. インフラ状態確認

```bash
# CloudFormationスタックの状態
aws cloudformation describe-stacks \
  --query 'Stacks[?contains(StackName, `BlogApp`)].{Name:StackName,Status:StackStatus}' \
  --output table

# Terraform状態の確認
terraform state list  # 空または意図したリソースのみ
```

### 2. サービス疎通テスト

```bash
# 検証スクリプト実行
./scripts/validate-import.sh ${ENVIRONMENT}

# ヘルスチェック
./scripts/health-check.sh ${ENVIRONMENT}
```

### 3. 機能テスト

```bash
# API疎通確認
CLOUDFRONT_DOMAIN=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[0].DomainName" --output text)

# 公開API
curl -s "https://${CLOUDFRONT_DOMAIN}/api/posts" | jq '.items | length'

# 管理画面
curl -I "https://${CLOUDFRONT_DOMAIN}/admin/"
```

---

## チェックリスト

### ロールバック前

- [ ] 問題の根本原因を特定した
- [ ] ロールバックレベルを決定した
- [ ] 必要なバックアップを取得した
- [ ] 影響範囲を確認した

### ロールバック中

- [ ] Terraform状態のバックアップを取得した
- [ ] 状態からリソースを削除した（AWSリソースは削除していない）
- [ ] CDKがリソースを認識していることを確認した

### ロールバック後

- [ ] CloudFormationスタックが正常
- [ ] サービス疎通テストが成功
- [ ] 機能テストが成功
- [ ] パフォーマンスが正常

---

## 緊急連絡先

本番環境で問題が発生した場合:

1. インシデント対応チームに連絡
2. このドキュメントの手順に従ってロールバック
3. 根本原因分析後、移行を再計画

---

## 注意事項

1. **データ損失なし**: Terraform状態からリソースを削除しても、AWSリソース自体は削除されません
2. **CDK互換性**: CDKコードを削除する前にロールバックテストを完了させてください
3. **本番環境**: 本番環境でのロールバックは、必ず複数人で確認しながら実施してください
4. **ドキュメント更新**: ロールバック後、問題と対応を文書化してください
