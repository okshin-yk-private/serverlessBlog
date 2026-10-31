# 公開サイトの入口制御と404監視（2026-10）

- 公開ページはKVSの `routes:v1:<revision>:<bucket>`（32分割）で完全一致判定し、未知のURLを同一リリースの404へ書き換える。viewer-responseで内部マーカー付き200を404へ変換する。API・管理画面・画像・共有 `/_astro/` は従来の経路を維持する。
- 新規公開・ロールバックは32個の索引と公開ポインターを一つの条件付きUpdateKeysで更新する。既存リリースの移行は `bun scripts/deploy/prepareRoutes.ts BUCKET KVS_ARN` をインフラ切替前に実行する。公開ポインターは変更しない。
- 一つの索引値が1,024バイトを超える場合、公開前に失敗する。KVS全体は5MB上限があり、古いリリースの索引を保持するため将来の容量整理が必要。上限時も現在の公開ポインターを変更しない。
- 旧404 Lambda/IAMは関連付け解除後も一時保持する。Edge replicaの自動削除を確認してから別変更で整理する。
- 本番の `serverless-blog-public-5xx` は10件以上/5分で5xxが1%以上、3期間中2期間を検知。`serverless-blog-public-traffic` は1,000件超/5分が3期間中2期間で通知する。遮断は行わない。CloudFrontメトリクスと通知先SNSはus-east-1に置く。新SNSメール購読の確認が必要。
- Lambda同時実行クォータは実効10に対する希望100。Service Quotas APIが標準1000との比較で拒否する場合はSupport Centerから申請する。申請完了とAWSによる反映完了は分けて記録する。

# 監視とロギング

Lambda は Go で実装し、監視設定は Terraform（`terraform/modules/monitoring/`、PRD の
`terraform/environments/prd/edge-monitoring.tf`）で管理する。以前この節にあった
Lambda Powertools for TypeScript と CDK の `MonitoringStack` の説明は、現行構成に存在しないため削除した。

## ログ

- Lambda は `go-functions/internal/middleware/` の `slog` JSON ハンドラで構造化ログを出す。
  記録する項目、マスク対象、記録しない内容は [structured-logging.md](./structured-logging.md) を参照。
- 共通フィールドは `requestId`（API Gateway のリクエスト ID）、`lambdaRequestId`、`traceId`、
  `coldStart`。HTTP 呼び出しの完了時に `msg = "request completed"` と `statusCode`・`durationMs` を 1 件記録する。
- ロググループの保持期間は PRD 90 日、DEV 14 日（`terraform/modules/lambda/main.tf` の `log_retention_days`）。
- API Gateway のアクセスログと実行ログ（`INFO`）は PRD のみ有効（`terraform/modules/api/main.tf`）。
- CloudFront の標準ログ（v2）は PRD のみ、アクセスログ用バケットの `cloudfront/` に 90 日保存する。

### CloudWatch Logs Insights の例

```
# エラーのみ
fields @timestamp, requestId, msg, error
| filter level = "ERROR"
| sort @timestamp desc

# 特定のリクエストを追跡
fields @timestamp, level, msg
| filter requestId = "<API Gateway のリクエスト ID>"

# 遅いリクエスト
fields @timestamp, requestId, statusCode, durationMs
| filter msg = "request completed" and durationMs > 1000
| sort durationMs desc
```

## トレース

- Lambda の X-Ray は `enable_xray` で切り替える。PRD は `Active`、DEV は `PassThrough`。
- API Gateway ステージの X-Ray は PRD のみ有効。
- Go 側で独自のサブセグメントは作っていない。`traceId` はランタイムの `_X_AMZN_TRACE_ID` をログに残す用途。

## メトリクスとアラーム

アラームは `enable_alarms = true` の環境（PRD のみ）で作成し、SNS トピックからメール（`alarm_email`）へ通知する。
カスタムメトリクス（EMF）は使っていない。すべて AWS 標準メトリクス。

| アラーム | メトリクス | 条件 |
| --- | --- | --- |
| `<project>-Lambda-AllErrors` | 全関数の `AWS/Lambda Errors` 合計 | 5 分で 5 件超（1 期間） |
| `<project>-Lambda-AllDuration` | 全関数の `Duration` 最大 | 10,000 ms 超が 2 期間 |
| `<project>-Lambda-AllThrottles` | 全関数の `Throttles` 合計 | 5 分で 3 件超（1 期間） |
| `<table>-ReadThrottles` / `-WriteThrottles` | DynamoDB のスロットリング | 5 分で 1 件以上 |
| `<api>-4XXError` | API Gateway 4XX | 5 分で 10 件超 |
| `<api>-5XXError` | API Gateway 5XX | 5 分で 5 件超 |
| `<api>-Latency` | API Gateway 平均レイテンシ | 2,000 ms 超が 2 期間 |
| `serverless-blog-public-5xx` | CloudFront 5xx 率（us-east-1） | 冒頭の節を参照 |
| `serverless-blog-public-traffic` | CloudFront リクエスト数（us-east-1） | 冒頭の節を参照 |

閾値と評価期間の正は Terraform。変更したらこの表も更新する。

### 監視していないもの（既知の穴）

- サイトビルド（CodeBuild）の失敗と、ビルド状態の再整合用 DLQ（`terraform/modules/lambda/sitebuild_events.tf`）に溜まったメッセージ。
  管理画面のビルド状態でしか気づけない。
- 費用。AWS Budgets は未導入。Cost Anomaly Detection は導入済みだが、このリポジトリの Terraform では管理していない。

## ダッシュボード

PRD に `BlogPlatform-Monitoring` を作成する。関数ごとの Errors / Invocations / Duration / Throttles、
DynamoDB のスロットリング、API Gateway の 4XX / 5XX / Latency を表示する。

## 通知が届かないとき

1. SNS のメール購読が「確認済み」か確認する。Terraform で作った購読は、届いたメールのリンクを開くまで有効にならない。
2. `alarm_email` が PRD のデプロイで渡っているか確認する。
3. CloudFront のアラームと SNS は us-east-1 にある。ap-northeast-1 だけを見ていないか確認する。
