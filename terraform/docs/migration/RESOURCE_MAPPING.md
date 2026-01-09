# CDK Logical ID to Terraform Resource Address Mapping

このドキュメントは、既存のCDK管理リソースをTerraform管理に移行する際のリソースマッピングを定義します。

**Requirements: 9.1, 9.4**

## 概要

移行対象のCDKスタックとTerraformモジュールの対応:

| CDKスタック | Terraformモジュール | 状態 |
|------------|-------------------|------|
| DatabaseStack | modules/database | 移行対象 |
| StorageStack | modules/storage | 移行対象 |
| AuthStack | modules/auth | 移行対象 |
| ApiStack | modules/api | 移行対象 |
| GoLambdaStack | modules/lambda | 移行対象 |
| ApiIntegrationsStack | modules/api (統合) | 移行対象 |
| CdnStack | modules/cdn | 移行対象 |
| MonitoringStack | modules/monitoring | 移行対象 |

---

## 1. Database Module (DynamoDB)

### DynamoDBテーブル

| CDK Logical ID | CDK Resource Name | Terraform Resource Address | Import ID Format |
|---------------|-------------------|---------------------------|------------------|
| BlogPostsTable | serverless-blog-posts | `module.database.aws_dynamodb_table.blog_posts` | `{table_name}` |

**Import ID例:**
- DEV: `serverless-blog-posts-dev`
- PRD: `serverless-blog-posts-prd`

**検証項目:**
- パーティションキー: `id` (String)
- 課金モード: PAY_PER_REQUEST
- GSI: CategoryIndex, PublishStatusIndex
- PITR: 有効
- 暗号化: 有効 (AWS managed key)

---

## 2. Storage Module (S3)

### S3バケット

| CDK Logical ID | CDK Bucket Name Pattern | Terraform Resource Address | Import ID Format |
|---------------|------------------------|---------------------------|------------------|
| ImageBucket | serverless-blog-images-{env}-{account} | `module.storage.aws_s3_bucket.images` | `{bucket_name}` |
| PublicSiteBucket | serverless-blog-public-site-{env}-{account} | `module.storage.aws_s3_bucket.public_site` | `{bucket_name}` |
| AdminSiteBucket | serverless-blog-admin-site-{env}-{account} | `module.storage.aws_s3_bucket.admin_site` | `{bucket_name}` |
| AccessLogsBucket | serverless-blog-access-logs-{env}-{account} | `module.storage.aws_s3_bucket.access_logs[0]` | `{bucket_name}` |

**関連リソース:**

| リソース種別 | Terraform Resource Address | Import ID Format |
|------------|---------------------------|------------------|
| バケットバージョニング | `module.storage.aws_s3_bucket_versioning.images` | `{bucket_name}` |
| バケット暗号化 | `module.storage.aws_s3_bucket_server_side_encryption_configuration.images` | `{bucket_name}` |
| パブリックアクセスブロック | `module.storage.aws_s3_bucket_public_access_block.images` | `{bucket_name}` |
| ライフサイクルルール | `module.storage.aws_s3_bucket_lifecycle_configuration.images` | `{bucket_name}` |

**検証項目:**
- バージョニング: 有効 (imagesバケット)
- 暗号化: SSE-S3
- パブリックアクセスブロック: 全て有効
- ライフサイクル: 90日後の古いバージョン削除

---

## 3. Auth Module (Cognito)

### Cognito User Pool

| CDK Logical ID | CDK Resource Name | Terraform Resource Address | Import ID Format |
|---------------|-------------------|---------------------------|------------------|
| BlogUserPool | serverless-blog-user-pool | `module.auth.aws_cognito_user_pool.main` | `{region}_{user_pool_id}` |
| BlogUserPoolClient | serverless-blog-admin-client | `module.auth.aws_cognito_user_pool_client.main` | `{user_pool_id}/{client_id}` |

**Import ID例:**
- User Pool: `ap-northeast-1_XXXXXXXXX`
- Client: `ap-northeast-1_XXXXXXXXX/YYYYYYYYYYYYYYYYYYYYYYYYY`

**検証項目:**
- サインイン: Eメールベース
- パスワードポリシー: 12文字以上、全文字種必須
- MFA: OPTIONAL
- メール検証: 有効
- 認証フロー: USER_PASSWORD_AUTH, USER_SRP_AUTH, REFRESH_TOKEN_AUTH
- トークン有効期限: access/id 1時間, refresh 30日
- セルフサインアップ: 無効

---

## 4. API Module (API Gateway)

### REST API

| CDK Logical ID | CDK Resource Name | Terraform Resource Address | Import ID Format |
|---------------|-------------------|---------------------------|------------------|
| BlogApi | serverless-blog-api | `module.api.aws_api_gateway_rest_api.main` | `{rest_api_id}` |
| BlogCognitoAuthorizer | - | `module.api.aws_api_gateway_authorizer.cognito` | `{rest_api_id}/{authorizer_id}` |
| RequestValidator | - | `module.api.aws_api_gateway_request_validator.main` | `{rest_api_id}/{validator_id}` |

### Gateway Responses

| Response Type | Terraform Resource Address | Import ID Format |
|--------------|---------------------------|------------------|
| DEFAULT_4XX | `module.api.aws_api_gateway_gateway_response.default_4xx` | `{rest_api_id}/DEFAULT_4XX` |
| DEFAULT_5XX | `module.api.aws_api_gateway_gateway_response.default_5xx` | `{rest_api_id}/DEFAULT_5XX` |

### API Resources

| API Path | Terraform Resource Address | Import ID Format |
|----------|---------------------------|------------------|
| /admin | `module.api.aws_api_gateway_resource.admin` | `{rest_api_id}/{resource_id}` |
| /posts | `module.api.aws_api_gateway_resource.posts` | `{rest_api_id}/{resource_id}` |
| /posts/{id} | `module.api.aws_api_gateway_resource.posts_id` | `{rest_api_id}/{resource_id}` |
| /admin/posts | `module.api.aws_api_gateway_resource.admin_posts` | `{rest_api_id}/{resource_id}` |
| /admin/posts/{id} | `module.api.aws_api_gateway_resource.admin_posts_id` | `{rest_api_id}/{resource_id}` |
| /admin/images | `module.api.aws_api_gateway_resource.admin_images` | `{rest_api_id}/{resource_id}` |
| /admin/images/upload-url | `module.api.aws_api_gateway_resource.admin_images_upload_url` | `{rest_api_id}/{resource_id}` |
| /admin/images/{key+} | `module.api.aws_api_gateway_resource.admin_images_key` | `{rest_api_id}/{resource_id}` |
| /admin/auth | `module.api.aws_api_gateway_resource.admin_auth` | `{rest_api_id}/{resource_id}` |
| /admin/auth/login | `module.api.aws_api_gateway_resource.admin_auth_login` | `{rest_api_id}/{resource_id}` |
| /admin/auth/logout | `module.api.aws_api_gateway_resource.admin_auth_logout` | `{rest_api_id}/{resource_id}` |
| /admin/auth/refresh | `module.api.aws_api_gateway_resource.admin_auth_refresh` | `{rest_api_id}/{resource_id}` |

### Stage

| CDK Stage | Terraform Resource Address | Import ID Format |
|-----------|---------------------------|------------------|
| dev | `module.api.aws_api_gateway_stage.main` | `{rest_api_id}/dev` |
| prd | `module.api.aws_api_gateway_stage.main` | `{rest_api_id}/prd` |

**検証項目:**
- REST API名: serverless-blog-api-{env}
- エンドポイントタイプ: REGIONAL
- Cognito Authorizer設定
- CORSゲートウェイレスポンス

---

## 5. Lambda Module

### Lambda Functions

| CDK Logical ID | Function Name | Terraform Resource Address | Import ID Format |
|---------------|--------------|---------------------------|------------------|
| CreatePostGo | blog-create-post-go | `module.lambda.aws_lambda_function.create_post` | `blog-create-post-go` |
| GetPostGo | blog-get-post-go | `module.lambda.aws_lambda_function.get_post` | `blog-get-post-go` |
| GetPublicPostGo | blog-get-public-post-go | `module.lambda.aws_lambda_function.get_public_post` | `blog-get-public-post-go` |
| ListPostsGo | blog-list-posts-go | `module.lambda.aws_lambda_function.list_posts` | `blog-list-posts-go` |
| UpdatePostGo | blog-update-post-go | `module.lambda.aws_lambda_function.update_post` | `blog-update-post-go` |
| DeletePostGo | blog-delete-post-go | `module.lambda.aws_lambda_function.delete_post` | `blog-delete-post-go` |
| LoginGo | blog-login-go | `module.lambda.aws_lambda_function.login` | `blog-login-go` |
| LogoutGo | blog-logout-go | `module.lambda.aws_lambda_function.logout` | `blog-logout-go` |
| RefreshGo | blog-refresh-go | `module.lambda.aws_lambda_function.refresh` | `blog-refresh-go` |
| GetUploadUrlGo | blog-upload-url-go | `module.lambda.aws_lambda_function.get_upload_url` | `blog-upload-url-go` |
| DeleteImageGo | blog-delete-image-go | `module.lambda.aws_lambda_function.delete_image` | `blog-delete-image-go` |

### CloudWatch Log Groups

| Function | Terraform Resource Address | Import ID Format |
|----------|---------------------------|------------------|
| create_post | `module.lambda.aws_cloudwatch_log_group.create_post` | `/aws/lambda/blog-create-post-go` |
| get_post | `module.lambda.aws_cloudwatch_log_group.get_post` | `/aws/lambda/blog-get-post-go` |
| get_public_post | `module.lambda.aws_cloudwatch_log_group.get_public_post` | `/aws/lambda/blog-get-public-post-go` |
| list_posts | `module.lambda.aws_cloudwatch_log_group.list_posts` | `/aws/lambda/blog-list-posts-go` |
| update_post | `module.lambda.aws_cloudwatch_log_group.update_post` | `/aws/lambda/blog-update-post-go` |
| delete_post | `module.lambda.aws_cloudwatch_log_group.delete_post` | `/aws/lambda/blog-delete-post-go` |
| login | `module.lambda.aws_cloudwatch_log_group.login` | `/aws/lambda/blog-login-go` |
| logout | `module.lambda.aws_cloudwatch_log_group.logout` | `/aws/lambda/blog-logout-go` |
| refresh | `module.lambda.aws_cloudwatch_log_group.refresh` | `/aws/lambda/blog-refresh-go` |
| get_upload_url | `module.lambda.aws_cloudwatch_log_group.get_upload_url` | `/aws/lambda/blog-upload-url-go` |
| delete_image | `module.lambda.aws_cloudwatch_log_group.delete_image` | `/aws/lambda/blog-delete-image-go` |

**検証項目:**
- ランタイム: provided.al2023
- アーキテクチャ: arm64
- メモリ: 128 MB
- タイムアウト: 30秒
- X-Ray: prd環境のみActive
- 環境変数: TABLE_NAME, BUCKET_NAME, etc.

---

## 6. CDN Module (CloudFront)

### CloudFront Distribution

| CDK Logical ID | Terraform Resource Address | Import ID Format |
|---------------|---------------------------|------------------|
| UnifiedDistribution | `module.cdn.aws_cloudfront_distribution.main` | `{distribution_id}` |

### Origin Access Control

| CDK Logical ID | Terraform Resource Address | Import ID Format |
|---------------|---------------------------|------------------|
| S3 OAC | `module.cdn.aws_cloudfront_origin_access_control.s3_oac` | `{oac_id}` |

### CloudFront Functions

| Function Name | Terraform Resource Address | Import ID Format |
|--------------|---------------------------|------------------|
| ImagePathFunction-{env} | `module.cdn.aws_cloudfront_function.image_path` | `ImagePathFunction-{env}` |
| AdminSpaFunction-{env} | `module.cdn.aws_cloudfront_function.admin_spa` | `AdminSpaFunction-{env}` |
| ApiPathFunction-{env} | `module.cdn.aws_cloudfront_function.api_path` | `ApiPathFunction-{env}` |

### Cache Policies

| Policy Name | Terraform Resource Address | Import ID Format |
|------------|---------------------------|------------------|
| BlogImageCachePolicy-{env} | `module.cdn.aws_cloudfront_cache_policy.images` | `{policy_id}` |

### Origin Request Policies

| Policy Name | Terraform Resource Address | Import ID Format |
|------------|---------------------------|------------------|
| BlogApiOriginRequestPolicy-{env} | `module.cdn.aws_cloudfront_origin_request_policy.api` | `{policy_id}` |

**検証項目:**
- HTTPSリダイレクト: 有効
- 圧縮: Gzip/Brotli有効
- プライスクラス: PRICE_CLASS_100
- オリジン: public-site, admin-site, images, api-gateway
- デフォルトルートオブジェクト: index.html

---

## 7. Monitoring Module (CloudWatch)

### SNS Topic

| CDK Logical ID | Terraform Resource Address | Import ID Format |
|---------------|---------------------------|------------------|
| AlarmTopic | `module.monitoring.aws_sns_topic.alarms` | `arn:aws:sns:{region}:{account}:BlogPlatform-Alarms` |

### CloudWatch Dashboard

| CDK Logical ID | Terraform Resource Address | Import ID Format |
|---------------|---------------------------|------------------|
| MonitoringDashboard | `module.monitoring.aws_cloudwatch_dashboard.main` | `BlogPlatform-Monitoring` |

### CloudWatch Alarms

Lambda関数アラーム:
| Alarm Type | Terraform Resource Address | Import ID Format |
|------------|---------------------------|------------------|
| ErrorRate | `module.monitoring.aws_cloudwatch_metric_alarm.lambda_errors["function_name"]` | `{alarm_name}` |
| Duration | `module.monitoring.aws_cloudwatch_metric_alarm.lambda_duration["function_name"]` | `{alarm_name}` |
| Throttles | `module.monitoring.aws_cloudwatch_metric_alarm.lambda_throttles["function_name"]` | `{alarm_name}` |

DynamoDBアラーム:
| Alarm Type | Terraform Resource Address | Import ID Format |
|------------|---------------------------|------------------|
| ReadThrottles | `module.monitoring.aws_cloudwatch_metric_alarm.dynamodb_read_throttle["table_name"]` | `{alarm_name}` |
| WriteThrottles | `module.monitoring.aws_cloudwatch_metric_alarm.dynamodb_write_throttle["table_name"]` | `{alarm_name}` |

API Gatewayアラーム:
| Alarm Type | Terraform Resource Address | Import ID Format |
|------------|---------------------------|------------------|
| 4XXError | `module.monitoring.aws_cloudwatch_metric_alarm.api_4xx["api_name"]` | `{alarm_name}` |
| 5XXError | `module.monitoring.aws_cloudwatch_metric_alarm.api_5xx["api_name"]` | `{alarm_name}` |
| Latency | `module.monitoring.aws_cloudwatch_metric_alarm.api_latency["api_name"]` | `{alarm_name}` |

---

## インポート実行順序

依存関係を考慮した推奨インポート順序:

1. **Phase 1: 基盤層（依存関係なし）**
   - database: DynamoDBテーブル
   - storage: S3バケット
   - auth: Cognito User Pool

2. **Phase 2: API層**
   - api: REST API, Authorizer, Resources

3. **Phase 3: コンピュート層**
   - lambda: Lambda関数, IAMロール, Log Groups

4. **Phase 4: 配信層**
   - cdn: CloudFront Distribution, OAC, Functions

5. **Phase 5: 運用層**
   - monitoring: SNS, Alarms, Dashboard

---

## 注意事項

1. **インポート前のバックアップ**
   - CDK状態のバックアップを取得
   - AWS CLIで現行リソース設定をエクスポート

2. **インポートブロックの使用**
   - Terraform 1.5+の`import`ブロックを使用
   - `terraform plan`で差分がないことを確認後に`apply`

3. **既知の差分**
   - CDK生成のリソース名とTerraform設定名の微差
   - タグ構造の違い
   - IAMポリシードキュメントのフォーマット差

4. **ロールバック準備**
   - インポート失敗時はCDKに戻せるよう準備
   - Terraform状態ファイルのバックアップ
