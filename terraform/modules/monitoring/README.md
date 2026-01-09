# Monitoring Module

CloudWatch Alarms、Dashboard、SNS通知を管理するTerraformモジュールです。

## 概要

ブログプラットフォームの監視・アラート機能を提供します:

- **Lambda Alarms**: エラー率、実行時間、スロットル
- **DynamoDB Alarms**: 読み取り/書き込みスロットル
- **API Gateway Alarms**: 4XX/5XX エラー、レイテンシ
- **SNS通知**: メールによるアラーム通知
- **Dashboard**: 統合ダッシュボード

## 使用方法

```hcl
module "monitoring" {
  source = "../../modules/monitoring"

  environment           = "prd"
  project_name          = "serverless-blog"
  alarm_email           = "alerts@example.com"
  lambda_function_names = module.lambda.function_names
  dynamodb_table_names  = [module.database.table_name]
  api_gateway_name      = "serverless-blog-api-prd"
  api_gateway_stage     = "prd"
  enable_alarms         = true

  tags = {
    Project     = "serverless-blog"
    Environment = "prd"
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
| aws_sns_topic.alarms | resource |
| aws_sns_topic_subscription.email | resource |
| aws_cloudwatch_metric_alarm.lambda_errors | resource |
| aws_cloudwatch_metric_alarm.lambda_duration | resource |
| aws_cloudwatch_metric_alarm.lambda_throttles | resource |
| aws_cloudwatch_metric_alarm.dynamodb_read_throttles | resource |
| aws_cloudwatch_metric_alarm.dynamodb_write_throttles | resource |
| aws_cloudwatch_metric_alarm.api_4xx_errors | resource |
| aws_cloudwatch_metric_alarm.api_5xx_errors | resource |
| aws_cloudwatch_metric_alarm.api_latency | resource |
| aws_cloudwatch_dashboard.main | resource |

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| environment | Environment identifier (dev, prd) | `string` | n/a | yes |
| project_name | Project name for resource naming | `string` | n/a | yes |
| alarm_email | Email address for alarm notifications | `string` (sensitive) | n/a | yes |
| lambda_function_names | List of Lambda function names to monitor | `list(string)` | n/a | yes |
| dynamodb_table_names | List of DynamoDB table names to monitor | `list(string)` | n/a | yes |
| api_gateway_name | API Gateway name to monitor | `string` | n/a | yes |
| api_gateway_stage | API Gateway stage to monitor | `string` | n/a | yes |
| enable_alarms | Enable CloudWatch alarms (recommended for prd) | `bool` | `true` | no |
| tags | Additional tags for resources | `map(string)` | `{}` | no |

## Outputs

| Name | Description |
|------|-------------|
| alarm_topic_arn | Alarm SNS topic ARN |
| alarm_topic_name | Alarm SNS topic name |
| dashboard_name | CloudWatch dashboard name |
| dashboard_arn | CloudWatch dashboard ARN |
| lambda_error_alarm_arns | Map of Lambda function names to error alarm ARNs |
| lambda_duration_alarm_arns | Map of Lambda function names to duration alarm ARNs |
| lambda_throttle_alarm_arns | Map of Lambda function names to throttle alarm ARNs |
| dynamodb_read_throttle_alarm_arns | Map of DynamoDB table names to read throttle alarm ARNs |
| dynamodb_write_throttle_alarm_arns | Map of DynamoDB table names to write throttle alarm ARNs |
| api_4xx_alarm_arn | API Gateway 4XX error alarm ARN |
| api_5xx_alarm_arn | API Gateway 5XX error alarm ARN |
| api_latency_alarm_arn | API Gateway latency alarm ARN |

## アラーム設定

### Lambda アラーム

| アラーム | メトリクス | 閾値 | 期間 | 評価期間 |
|---------|----------|-----|------|---------|
| Errors | Errors | > 1 | 1分 | 1 |
| Duration | Duration (p90) | > 25000ms | 1分 | 3 |
| Throttles | Throttles | > 1 | 1分 | 1 |

### DynamoDB アラーム

| アラーム | メトリクス | 閾値 | 期間 | 評価期間 |
|---------|----------|-----|------|---------|
| ReadThrottle | ReadThrottledRequests | > 1 | 1分 | 1 |
| WriteThrottle | WriteThrottledRequests | > 1 | 1分 | 1 |

### API Gateway アラーム

| アラーム | メトリクス | 閾値 | 期間 | 評価期間 |
|---------|----------|-----|------|---------|
| 4XX Errors | 4XXError (Sum) | > 50 | 5分 | 1 |
| 5XX Errors | 5XXError (Sum) | > 5 | 5分 | 1 |
| Latency | Latency (p90) | > 5000ms | 5分 | 3 |

## ダッシュボード構成

```
┌─────────────────────────────────────────────────────────────┐
│                    Lambda Metrics                            │
├─────────────────────────────────────────────────────────────┤
│ Invocations │ Errors │ Duration │ Throttles │ Concurrent   │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│                   DynamoDB Metrics                           │
├─────────────────────────────────────────────────────────────┤
│ Read Capacity │ Write Capacity │ Throttled Requests          │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│                  API Gateway Metrics                         │
├─────────────────────────────────────────────────────────────┤
│ Count │ 4XX Errors │ 5XX Errors │ Latency                    │
└─────────────────────────────────────────────────────────────┘
```

## 環境別設定

### dev環境

```hcl
module "monitoring" {
  # ...
  enable_alarms = false  # 開発環境ではアラーム無効
}
```

### prd環境

```hcl
module "monitoring" {
  # ...
  enable_alarms = true  # 本番環境ではアラーム有効
}
```

## SNS通知

アラーム発生時にメール通知が送信されます。

1. 初回デプロイ後、指定したメールアドレスに確認メールが届きます
2. メール内のリンクをクリックして購読を確認してください
3. 確認後、アラーム通知が有効になります

## セキュリティ考慮事項

- `alarm_email`は`sensitive = true`としてマークされ、Terraformログに露出しません
- SNSトピックはプライベートで、指定されたエンドポイントのみがサブスクライブできます

## 既存リソースのインポート

```hcl
# import.tf
import {
  to = aws_sns_topic.alarms[0]
  id = "arn:aws:sns:ap-northeast-1:123456789012:serverless-blog-alarms-prd"
}

import {
  to = aws_cloudwatch_dashboard.main[0]
  id = "serverless-blog-prd"
}

import {
  to = aws_cloudwatch_metric_alarm.lambda_errors["function-name"]
  id = "serverless-blog-prd-function-name-errors"
}
```

## 関連モジュール

- [lambda](../lambda/README.md) - 監視対象Lambda関数
- [database](../database/README.md) - 監視対象DynamoDBテーブル
- [api](../api/README.md) - 監視対象API Gateway
