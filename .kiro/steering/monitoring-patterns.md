# モニタリングパターン ステアリング

## 目的

CloudWatch、X-Ray、Lambda Powertoolsを使用して、このサーバーレスブログプラットフォーム全体で一貫したモニタリング実装をガイドする。

---

## Lambda Powertools 統合

### 初期化パターン

すべてのLambdaハンドラーは3つのPowertoolsコンポーネントを初期化する：

```typescript
import { Logger } from '@aws-lambda-powertools/logger';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics';

const logger = new Logger({ serviceName: 'functionName' });
const tracer = new Tracer({ serviceName: 'functionName' });
const metrics = new Metrics({
  serviceName: 'functionName',
  namespace: 'BlogPlatform',
});
```

### サービス名規則

サービス名はLambda関数名と一致させる（キャメルケース）：
- `createPost`, `getPost`, `listPosts`, `updatePost`, `deletePost`
- `login`, `logout`, `refresh`
- `getUploadUrl`

### コンテキスト付加

ハンドラー開始時に必ずコンテキストを付加する：

```typescript
export async function handler(event, context) {
  logger.addContext(context);
  metrics.addMetadata('requestId', context.awsRequestId);
  // ... ハンドラーロジック
}
```

---

## ロギングパターン

### ログレベル

| レベル | 使用ケース |
|-------|----------|
| `DEBUG` | 開発時のデバッグのみ |
| `INFO` | 通常操作（リクエスト受信、操作完了） |
| `WARN` | バリデーション失敗、回復可能な問題 |
| `ERROR` | 例外、操作失敗 |

### 構造化ログ形式

すべてのログに関連するコンテキストを含める：

```typescript
// 良い例: コンテキストリッチなロギング
logger.info('Received create post request', { request });
logger.info('Post created successfully', { postId });
logger.warn('Validation failed', { error: validationError });
logger.error('Error creating post', { error });
```

### セキュリティ: 機密データは絶対にログに出力しない

- パスワード、トークン、APIキー
- 個人情報を含むリクエストボディ全体
- クレジットカード番号

---

## メトリクスパターン

### カスタムメトリクス名前空間

すべてのカスタムメトリクスは名前空間 `BlogPlatform` を使用

### メトリクス命名規則

`{Operation}{Outcome}` パターン：
- `PostCreated`, `PostUpdated`, `PostDeleted`
- `ValidationError`, `PostCreationError`
- `LoginSuccess`, `LoginFailure`

### 使用パターン

```typescript
// 成功メトリクス
metrics.addMetric('PostCreated', MetricUnit.Count, 1);

// エラーメトリクス
metrics.addMetric('ValidationError', MetricUnit.Count, 1);
```

---

## X-Ray トレーシング

> **環境制限**: X-Rayトレーシングは**本番環境（prd）のみ**で有効化する。dev環境では設定しない。

### AWS クライアントトレーシング

本番環境でのみAWS SDKクライアントをトレースする：

```typescript
const isProd = process.env.STAGE === 'prd';
const isTest = process.env.NODE_ENV === 'test';

const tracedClient = (isProd && !isTest)
  ? tracer.captureAWSv3Client(client)
  : client;
```

### CDK設定パターン

```typescript
// Lambda関数のX-Ray設定
const lambdaFunction = new lambda.Function(this, 'Function', {
  // ... 他の設定
  tracing: props.stage === 'prd'
    ? lambda.Tracing.ACTIVE
    : lambda.Tracing.DISABLED,
});
```

### トレース伝播（prd環境のみ）

X-RayトレースIDは以下を通じて伝播する：
- API Gateway -> Lambda
- Lambda -> DynamoDB
- Lambda -> S3

---

## CloudWatch アラーム

> **環境制限**: CloudWatch Alarmは**本番環境（prd）のみ**で設定する。dev環境では設定しない。

### CDK条件分岐パターン

```typescript
// MonitoringStackはprd環境のみで作成
if (props.stage === 'prd') {
  new MonitoringStack(app, 'MonitoringStack', {
    lambdaFunctions: [...],
    dynamodbTables: [...],
    apiGateways: [...],
    alarmEmail: props.alarmEmail,
  });
}
```

### アラーム命名規則

`{ResourceId}-{MetricType}` パターン：
- `FunctionId-ErrorRate`
- `FunctionId-Duration`
- `FunctionId-Throttles`
- `TableId-ReadThrottles`
- `ApiId-5XXError`

### 閾値（prd環境のみ）

| リソース | メトリクス | 閾値 | 評価 |
|---------|----------|-----|------|
| Lambda | Errors | 5分間で1件超過 | 1期間 |
| Lambda | Duration | 平均10秒超過 | 2期間 |
| Lambda | Throttles | 5分間で1件超過 | 1期間 |
| DynamoDB | ReadThrottles | 5分間で1件超過 | 1期間 |
| DynamoDB | WriteThrottles | 5分間で1件超過 | 1期間 |
| API Gateway | 4XXError | 5分間で10件超過 | 1期間 |
| API Gateway | 5XXError | 5分間で5件超過 | 1期間 |
| API Gateway | Latency | 平均2秒超過 | 2期間 |

### 通知（prd環境のみ）

すべてのアラームはSNSトピック `BlogPlatform-Alarms` にルーティングされる
- メールサブスクリプションは `ALARM_EMAIL` 環境変数で設定

---

## CloudWatch ダッシュボード

### ダッシュボード名

`BlogPlatform-Monitoring`

### ウィジェット構成

1. **Lambda ウィジェット**（関数ごと）：
   - エラー＆呼び出しグラフ
   - 実行時間＆スロットルグラフ

2. **DynamoDB ウィジェット**（テーブルごと）：
   - 読み取り/書き込みスロットルグラフ

3. **API Gateway ウィジェット**（APIごと）：
   - 4XX/5XXエラーグラフ
   - レイテンシーグラフ

---

## CDK 実装パターン

### MonitoringStack インターフェース

```typescript
interface MonitoringStackProps {
  lambdaFunctions: lambda.IFunction[];
  dynamodbTables: dynamodb.ITable[];
  apiGateways: apigateway.IRestApi[];
  alarmEmail: string;
}
```

### リソース構成

- SSL強制ポリシー付きSNSトピック
- 関数ごとのLambdaアラーム（各3アラーム）
- テーブルごとのDynamoDBアラーム（各2アラーム）
- APIごとのAPI Gatewayアラーム（各3アラーム）
- すべてのウィジェットを含むダッシュボード

---

## テストパターン

### ユニットテスト

CDKアサーションで検証：
- リソース数（トピック、サブスクリプション、アラーム、ダッシュボード）
- アラームプロパティ（閾値、期間、メトリクス）
- ダッシュボードウィジェット内容

### 統合テスト

モック化されたPowertoolsでハンドラーを検証：
- 期待されるコンテキストでのログ呼び出し
- 成功/失敗時のメトリクス出力
- X-Rayトレースヘッダー処理

---

## CloudWatch Logs Insights クエリ

### エラー調査

```sql
fields @timestamp, @message, level, error
| filter level = "ERROR"
| sort @timestamp desc
| limit 20
```

### リクエストトレーシング

```sql
fields @timestamp, @message, service, postId
| filter function_request_id = "REQUEST_ID"
| sort @timestamp asc
```

### レイテンシー分析

```sql
fields @timestamp, service, @duration
| filter @duration > 1000
| sort @duration desc
| limit 10
```

---

## 環境別設定まとめ

| 機能 | dev環境 | prd環境 |
|-----|---------|---------|
| Lambda Powertools (Logger, Metrics) | 有効 | 有効 |
| X-Ray トレーシング | 無効 | 有効 |
| CloudWatch アラーム | 無効 | 有効 |
| CloudWatch ダッシュボード | 任意 | 有効 |
| SNS通知 | 無効 | 有効 |

---

## ベストプラクティスまとめ

1. **常にPowertoolsを使用** - すべてのLambdaでLogger、Metricsを使用（環境問わず）
2. **コンテキストを付加** - ハンドラー開始時にLambdaコンテキストをloggerに追加
3. **コンテキストリッチなログ** - ログに関連するID（postId、userId）を含める
4. **結果ごとにメトリクス** - 成功と失敗を別々に追跡
5. **慎重なアラーム設定** - 誤検知を減らすため2期間評価を使用（prdのみ）
6. **X-Rayは本番のみ** - コスト削減のためdev環境ではX-Rayを無効化
7. **アラームは本番のみ** - dev環境での不要な通知を防止
8. **秘密情報をログに出力しない** - パスワード、トークン、個人情報はログに含めない
