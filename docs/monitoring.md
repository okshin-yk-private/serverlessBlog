# 監視とロギング

## 概要

このドキュメントでは、Serverless Blog Platformの監視とロギングの実装について説明します。

**Task 10.1: 監視とロギングの統合検証**に基づき、以下の機能を提供しています：

- CloudWatch Logsによる集中ロギング
- X-Rayトレーシングによる分散トレーシング
- Lambda Powertoolsによる構造化ロギング
- CloudWatchアラームによる自動監視
- CloudWatch Dashboardによる統合ビュー
- SNSによるアラーム通知

## Lambda Powertools統合

### 概要

すべてのLambda関数は[AWS Lambda Powertools for TypeScript](https://docs.powertools.aws.dev/lambda/typescript/latest/)を使用しています。

- **Logger**: 構造化ロギング
- **Tracer**: X-Ray統合トレーシング
- **Metrics**: カスタムメトリクス収集

### Logger（構造化ロギング）

#### 基本的な使い方

```typescript
import { Logger } from '@aws-lambda-powertools/logger';

const logger = new Logger({
  serviceName: 'createPost',
  logLevel: 'INFO'
});

// 情報ログ
logger.info('記事を作成中', { postId: '123' });

// 警告ログ
logger.warn('バリデーションエラー', { error: 'title is required' });

// エラーログ
logger.error('記事の作成に失敗しました', { error });
```

#### 構造化ログの形式

すべてのログは以下の構造化フォーマットで出力されます：

```json
{
  "level": "INFO",
  "message": "記事を作成中",
  "service": "createPost",
  "timestamp": "2025-01-09T12:34:56.789Z",
  "cold_start": false,
  "function_arn": "arn:aws:lambda:us-east-1:123456789012:function:createPost",
  "function_memory_size": "512",
  "function_name": "createPost",
  "function_request_id": "abc123",
  "postId": "123"
}
```

#### CloudWatch Logsでのログ確認

1. AWS Management Consoleで**CloudWatch**を開く
2. 左メニューから**Logs** > **Log groups**を選択
3. `/aws/lambda/<function-name>`ログ グループを選択
4. 最新のログストリームを選択してログを確認

**CloudWatch Logs Insightsクエリ例**:

```sql
# エラーログのみを抽出
fields @timestamp, @message, level, error
| filter level = "ERROR"
| sort @timestamp desc
| limit 20

# 特定のrequestIdでログを追跡
fields @timestamp, @message, service, postId
| filter function_request_id = "abc123"
| sort @timestamp asc

# レイテンシが高いリクエストを抽出
fields @timestamp, service, @duration
| filter @duration > 1000
| sort @duration desc
| limit 10
```

### Tracer（X-Rayトレーシング）

#### 基本的な使い方

```typescript
import { Tracer } from '@aws-lambda-powertools/tracer';

const tracer = new Tracer({ serviceName: 'createPost' });

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  // 自動的にX-Rayセグメントが生成される
  const segment = tracer.getSegment();

  // サブセグメントを作成（カスタムトレーシング）
  const subsegment = segment.addNewSubsegment('validateInput');
  try {
    // バリデーション処理
    validateInput(body);
    subsegment.close();
  } catch (error) {
    subsegment.addError(error);
    subsegment.close();
    throw error;
  }

  // DynamoDBクライアントも自動的にトレースされる
  await dynamoDBClient.send(new PutCommand({ ...params }));
};
```

#### X-Rayトレースの確認

1. AWS Management Consoleで**X-Ray**を開く
2. 左メニューから**Traces**を選択
3. トレースをクリックして詳細を表示

**X-Rayで確認できる情報**:
- API Gateway → Lambda → DynamoDBの呼び出しフロー
- 各サービスのレイテンシ
- エラーが発生したセグメント
- サービスマップ（アーキテクチャの可視化）

### Metrics（カスタムメトリクス）

#### 基本的な使い方

```typescript
import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics';

const metrics = new Metrics({
  namespace: 'BlogPlatform',
  serviceName: 'createPost'
});

// カウントメトリクス
metrics.addMetric('PostCreated', MetricUnit.Count, 1);

// ディメンション付きメトリクス
metrics.addDimension('PublishStatus', 'published');
metrics.addMetric('PublishedPostCreated', MetricUnit.Count, 1);

// メトリクスを送信（自動的にCloudWatchに送信される）
```

#### CloudWatchメトリクスの確認

1. AWS Management Consoleで**CloudWatch**を開く
2. 左メニューから**Metrics** > **All metrics**を選択
3. **BlogPlatform**ネームスペースを選択
4. メトリクスを選択してグラフを表示

## CloudWatchアラーム

### アラーム一覧

#### Lambda関数のアラーム

| アラーム名 | メトリクス | しきい値 | 説明 |
|-----------|-----------|---------|------|
| `{FunctionId}-ErrorRate` | Errors | 1 (5分間) | Lambda関数のエラー率が高い |
| `{FunctionId}-Duration` | Duration | 10秒 (平均, 2期間) | Lambda関数の実行時間が長い |
| `{FunctionId}-Throttles` | Throttles | 1 (5分間) | Lambda関数がスロットルされている |

#### DynamoDBテーブルのアラーム

| アラーム名 | メトリクス | しきい値 | 説明 |
|-----------|-----------|---------|------|
| `{TableId}-ReadThrottles` | ReadThrottleEvents | 1 (5分間) | DynamoDB読み取りスロットル発生 |
| `{TableId}-WriteThrottles` | WriteThrottleEvents | 1 (5分間) | DynamoDB書き込みスロットル発生 |

#### API Gatewayのアラーム

| アラーム名 | メトリクス | しきい値 | 説明 |
|-----------|-----------|---------|------|
| `{ApiId}-4XXError` | 4XXError | 10 (5分間) | API Gatewayの4xxエラーが多い |
| `{ApiId}-5XXError` | 5XXError | 5 (5分間) | API Gatewayの5xxエラーが多い |
| `{ApiId}-Latency` | Latency | 2秒 (平均, 2期間) | API Gatewayのレイテンシが高い |

### アラーム通知

すべてのアラームは **SNSトピック** (`BlogPlatform-Alarms`) に通知を送信します。

**通知先メールアドレスの設定**:

`infrastructure/bin/blog-app.ts`で設定：

```typescript
const monitoringStack = new MonitoringStack(app, 'MonitoringStack', {
  lambdaFunctions: [...],
  dynamodbTables: [...],
  apiGateways: [...],
  alarmEmail: 'your-email@example.com', // ← ここで設定
});
```

**アラームメール通知の内容**:
- アラーム名
- アラーム説明
- 現在の状態（ALARM / OK）
- アラームがトリガーされた理由
- メトリクスの値

### アラームの確認

1. AWS Management Consoleで**CloudWatch**を開く
2. 左メニューから**Alarms** > **All alarms**を選択
3. アラーム状態を確認：
   - **OK**: 正常
   - **ALARM**: アラーム発火中
   - **INSUFFICIENT_DATA**: データ不足

## CloudWatch Dashboard

### ダッシュボード概要

すべてのメトリクスを一元的に監視するための**CloudWatch Dashboard**が自動的に作成されます。

**ダッシュボード名**: `BlogPlatform-Monitoring`

### ダッシュボードの内容

#### Lambda関数メトリクス

各Lambda関数ごとに2つのウィジェット:

1. **Errors & Invocations**
   - エラー数
   - 実行回数

2. **Duration & Throttles**
   - 実行時間
   - スロットル数

#### DynamoDBメトリクス

各テーブルごとに1つのウィジェット:

- **Throttles**
  - 読み取りスロットル数
  - 書き込みスロットル数

#### API Gatewayメトリクス

各APIごとに2つのウィジェット:

1. **Errors**
   - 4xxエラー数
   - 5xxエラー数

2. **Latency**
   - レイテンシ（平均）

### ダッシュボードの確認

1. AWS Management Consoleで**CloudWatch**を開く
2. 左メニューから**Dashboards**を選択
3. **BlogPlatform-Monitoring**を選択

**ダッシュボードのカスタマイズ**:
- ウィジェットの追加/削除
- 時間範囲の変更（1時間、3時間、1日、1週間など）
- 自動更新の設定

## CDK実装

### MonitoringStack

監視インフラは`infrastructure/lib/monitoring-stack.ts`で定義されています。

#### スタックプロパティ

```typescript
export interface MonitoringStackProps extends cdk.StackProps {
  lambdaFunctions: lambda.IFunction[];  // 監視対象のLambda関数
  dynamodbTables: dynamodb.ITable[];    // 監視対象のDynamoDBテーブル
  apiGateways: apigateway.IRestApi[];   // 監視対象のAPI Gateway
  alarmEmail: string;                   // アラーム通知先メールアドレス
}
```

#### スタックの使用例

```typescript
import { MonitoringStack } from '../lib/monitoring-stack';

const monitoringStack = new MonitoringStack(app, 'MonitoringStack', {
  lambdaFunctions: [
    createPostFunction,
    getPostFunction,
    listPostsFunction,
    // ...
  ],
  dynamodbTables: [
    postsTable,
    usersTable,
  ],
  apiGateways: [
    blogApi,
  ],
  alarmEmail: 'admin@example.com',
});
```

### CDKスタックテスト

`infrastructure/test/monitoring-stack.test.ts`に16のユニットテストがあります。

**テスト実行**:

```bash
cd infrastructure
npm test -- monitoring-stack.test.ts
```

**テストカバレッジ**:
- SNSトピックとメールサブスクリプション
- Lambda関数のアラーム（エラー率、実行時間、スロットル）
- DynamoDBのアラーム（読み取り/書き込みスロットル）
- API Gatewayのアラーム（4xx、5xx、レイテンシ）
- アラームアクション（SNS通知）
- CloudWatch Dashboard（ウィジェット確認）
- スナップショットテスト

## ベストプラクティス

### ログレベルの使い分け

| ログレベル | 用途 | 例 |
|-----------|------|-----|
| **DEBUG** | 開発時のデバッグ情報 | 変数の値、内部処理の詳細 |
| **INFO** | 通常の動作情報 | リクエスト受付、処理開始/完了 |
| **WARN** | 警告（エラーではない） | バリデーションエラー、リトライ |
| **ERROR** | エラー | 例外、処理失敗 |

**本番環境**: `INFO`以上
**開発環境**: `DEBUG`以上

### 構造化ロギングのベストプラクティス

1. **コンテキスト情報を常に含める**:
   ```typescript
   logger.info('記事を作成中', {
     postId: post.id,
     userId: user.id,
     category: post.category
   });
   ```

2. **エラー時は詳細情報を記録**:
   ```typescript
   logger.error('記事の作成に失敗しました', {
     error: error.message,
     stack: error.stack,
     input: body
   });
   ```

3. **機密情報をログに含めない**:
   - パスワード
   - トークン
   - クレジットカード情報
   - 個人識別情報（PII）

### X-Rayトレーシングのベストプラクティス

1. **カスタムサブセグメントで重要な処理をトレース**:
   ```typescript
   const subsegment = tracer.getSegment().addNewSubsegment('expensiveOperation');
   try {
     await performExpensiveOperation();
     subsegment.close();
   } catch (error) {
     subsegment.addError(error);
     subsegment.close();
     throw error;
   }
   ```

2. **メタデータとアノテーションを追加**:
   ```typescript
   subsegment.addMetadata('input', { postId: '123' });
   subsegment.addAnnotation('operation', 'createPost');
   ```

3. **AWS SDKクライアントでトレーシングを有効化**:
   ```typescript
   import { captureAWSv3Client } from 'aws-xray-sdk-core';

   const dynamoDBClient = captureAWSv3Client(new DynamoDBClient({}));
   ```

### アラームのベストプラクティス

1. **適切なしきい値を設定**:
   - 本番環境の正常な動作を基準に設定
   - 誤検知を減らすため、2期間の評価を使用

2. **アラーム通知を整理**:
   - 重要度に応じてSNSトピックを分ける
   - アラーム名から問題を特定できるようにする

3. **定期的にアラームを見直す**:
   - アプリケーションの成長に応じてしきい値を調整
   - 不要になったアラームを削除

## トラブルシューティング

### ログが表示されない

**原因**: Lambda関数の実行ロールにCloudWatch Logsへの書き込み権限がない

**解決策**:
```typescript
const lambdaRole = new iam.Role(this, 'LambdaRole', {
  assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  managedPolicies: [
    iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
  ],
});
```

### X-Rayトレースが表示されない

**原因**: Lambda関数でX-Rayトレーシングが有効化されていない

**解決策**:
```typescript
const fn = new lambda.Function(this, 'MyFunction', {
  // ...
  tracing: lambda.Tracing.ACTIVE, // ← これを追加
});
```

### アラームメールが届かない

**原因**: SNSサブスクリプションが未確認

**解決策**:
1. SNSトピックのサブスクリプション確認メールを確認
2. メール内の**Confirm subscription**リンクをクリック
3. サブスクリプションが**Confirmed**状態になることを確認

### カスタムメトリクスが表示されない

**原因**: メトリクスの送信に失敗している

**解決策**:
1. Lambda関数のCloudWatch Logsでエラーを確認
2. Lambda実行ロールに`cloudwatch:PutMetricData`権限があることを確認
   ```typescript
   lambdaRole.addToPolicy(new iam.PolicyStatement({
     actions: ['cloudwatch:PutMetricData'],
     resources: ['*'],
   }));
   ```

## 参考リンク

- [AWS Lambda Powertools for TypeScript](https://docs.powertools.aws.dev/lambda/typescript/latest/)
- [CloudWatch Logs Insights クエリ構文](https://docs.aws.amazon.com/ja_jp/AmazonCloudWatch/latest/logs/CWL_QuerySyntax.html)
- [AWS X-Ray 開発者ガイド](https://docs.aws.amazon.com/ja_jp/xray/latest/devguide/aws-xray.html)
- [CloudWatch アラームの作成](https://docs.aws.amazon.com/ja_jp/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html)
- [CloudWatch Dashboards](https://docs.aws.amazon.com/ja_jp/AmazonCloudWatch/latest/monitoring/CloudWatch_Dashboards.html)

## まとめ

- **Lambda Powertools**: Logger、Tracer、Metricsで構造化ロギング、X-Rayトレーシング、カスタムメトリクスを実現
- **CloudWatch Logs**: すべてのLambda関数のログを集中管理
- **X-Ray**: 分散トレーシングでリクエストフローを可視化
- **CloudWatchアラーム**: Lambda、DynamoDB、API Gatewayを自動監視
- **CloudWatch Dashboard**: すべてのメトリクスを統合ビューで確認
- **SNS通知**: アラーム発火時にメール通知

これらの監視とロギング機能により、本番環境での問題の早期発見と迅速な対応が可能になります。
