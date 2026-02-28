# パフォーマンス最適化ガイド

> **⚠️ 要更新**: このドキュメントの一部はCDK/Node.js Lambda時代のものです。
> 現在のLambda関数はGoで実装されています（`go-functions/`）。
> インフラはTerraformで管理されています（`terraform/modules/`）。
> `infrastructure/lib/` や `functions/` への参照は古い情報です。

## 概要

このドキュメントでは、Serverless Blog Platformのパフォーマンス最適化手法、ベンチマーク方法、および推奨設定について説明します。

**Task 10.2: パフォーマンス最適化とベンチマーク**に基づき、以下の最適化を実施しています：

- Lambda関数のメモリ最適化
- DynamoDB Global Secondary Index (GSI)によるクエリ最適化
- CloudFrontキャッシング戦略
- コールドスタート時間の最適化
- ページロード時間の最適化（目標: 2秒以内）

## パフォーマンス目標

| メトリクス | 目標値 | 測定方法 |
|-----------|--------|---------|
| ページロード時間 | < 2秒 | Lighthouse、WebPageTest |
| Lambda実行時間（平均） | < 500ms | CloudWatch Metrics |
| Lambda実行時間（P95） | < 1000ms | CloudWatch Insights |
| コールドスタート時間 | < 1秒 | X-Ray トレース |
| DynamoDBクエリレイテンシ | < 50ms | X-Ray サブセグメント |
| CloudFrontキャッシュヒット率 | > 80% | CloudFront Logs |

## Lambda関数の最適化

### 1. メモリサイズの最適化

Lambda関数のメモリサイズはCPUパフォーマンスにも影響します。適切なメモリサイズを選択することで、コスト効率と実行速度のバランスを取ります。

#### 現在の設定

デフォルトでは**128MB**のメモリを割り当てています（`infrastructure/lib/lambda-functions-stack.ts`）。

```typescript
const commonFunctionProps = {
  runtime: lambda.Runtime.NODEJS_22_X,
  layers: [powertoolsLayer, commonLayer],
  timeout: cdk.Duration.seconds(30),
  tracing: lambda.Tracing.ACTIVE,
  // memorySize: 128 (デフォルト)
};
```

#### 推奨メモリサイズ

| Lambda関数 | 推奨メモリ | 理由 |
|-----------|-----------|------|
| **createPost** | 512MB | Markdown→HTML変換、DOMPurifyによるXSS対策処理が重い |
| **updatePost** | 512MB | Markdown→HTML変換、DOMPurifyによるXSS対策処理が重い |
| **getPost** | 256MB | HTML文字列処理、比較的軽量 |
| **listPosts** | 256MB | DynamoDBクエリのみ、計算処理なし |
| **deletePost** | 256MB | DynamoDB削除、S3削除、軽量 |
| **getUploadUrl** | 128MB | Pre-signed URL生成のみ、非常に軽量 |
| **login/logout/refresh** | 128MB | Cognito API呼び出しのみ、非常に軽量 |

#### メモリサイズの設定方法

`infrastructure/lib/lambda-functions-stack.ts`を編集：

```typescript
// 記事作成（Markdown処理が重い）
this.createPostFunction = new lambda.Function(this, 'CreatePostFunction', {
  ...commonFunctionProps,
  memorySize: 512, // ← 追加
  functionName: 'blog-create-post',
  code: lambda.Code.fromAsset(
    path.join(__dirname, '../../functions/posts/createPost')
  ),
  handler: 'index.handler',
});

// 記事取得（軽量）
this.getPostFunction = new lambda.Function(this, 'GetPostFunction', {
  ...commonFunctionProps,
  memorySize: 256, // ← 追加
  functionName: 'blog-get-post',
  code: lambda.Code.fromAsset(
    path.join(__dirname, '../../functions/posts/getPost')
  ),
  handler: 'index.handler',
});

// アップロードURL生成（非常に軽量）
this.getUploadUrlFunction = new lambda.Function(this, 'GetUploadUrlFunction', {
  ...commonFunctionProps,
  memorySize: 128, // ← 追加（デフォルトだが明示的に設定）
  functionName: 'blog-get-upload-url',
  code: lambda.Code.fromAsset(
    path.join(__dirname, '../../functions/images/getUploadUrl')
  ),
  handler: 'index.handler',
});
```

#### メモリ最適化の検証方法

1. **CloudWatch Logsでメモリ使用量を確認**:

```
REPORT RequestId: abc123 Duration: 456.78 ms Billed Duration: 457 ms Memory Size: 512 MB Max Memory Used: 187 MB
```

- **Max Memory Used**が**Memory Size**の70%以下なら、メモリを削減可能
- **Max Memory Used**が**Memory Size**の90%以上なら、メモリ不足の可能性

2. **AWS Lambda Power Tuning**（推奨）:

```bash
# AWS Lambda Power Tuning ツールをデプロイ
# https://github.com/alexcasalboni/aws-lambda-power-tuning
sam deploy --guided
```

### 2. コールドスタートの最適化

#### 現在の対策

- ✅ **Lambda Layers使用**: 共通ライブラリをLayerに分離（Powertools、共通ユーティリティ）
- ✅ **最小限の依存関係**: 必要最小限のパッケージのみインストール
- ✅ **Node.js 22.x**: 最新のLTSバージョン使用（起動が高速）

#### 追加の最適化手法

1. **Provisioned Concurrency（本番環境推奨）**:

```typescript
// 高トラフィックのLambda関数にProvisioned Concurrencyを設定
const alias = new lambda.Alias(this, 'LiveAlias', {
  aliasName: 'live',
  version: this.listPostsFunction.currentVersion,
  provisionedConcurrentExecutions: 5, // 常時5インスタンス起動
});
```

**コスト**: $0.015/GB-hour（us-east-1）

2. **VPC不使用**:
   - 既に実装済み（VPCを使用していない）
   - VPCを使用するとENI作成でコールドスタートが遅延

3. **依存関係の最小化**:

```json
// functions/posts/createPost/package.json
{
  "dependencies": {
    // 必要最小限のパッケージのみ
    "@aws-sdk/client-dynamodb": "^3.490.0",
    "@aws-sdk/lib-dynamodb": "^3.490.0"
  }
}
```

#### コールドスタート時間の測定

**X-Rayで測定**:

1. AWS Management Consoleで**X-Ray**を開く
2. **Traces**を選択
3. **Cold Start**でフィルタ
4. **Initialization** duration を確認

**または、Lambda関数内で測定**:

```typescript
import { measureExecutionTime } from '../shared/performanceUtils';

export const handler = async (event: APIGatewayProxyEvent) => {
  const isColdStart = !global.isWarm;
  global.isWarm = true;

  if (isColdStart) {
    console.log('Cold start detected');
  }

  const result = await measureExecutionTime(async () => {
    // メイン処理
    return await processRequest(event);
  });

  console.log(`Execution time: ${result.executionTimeMs}ms, Cold start: ${isColdStart}`);

  return result.value;
};

declare global {
  var isWarm: boolean;
}
```

## DynamoDB クエリ最適化

### Global Secondary Index (GSI)

DynamoDBの**Global Secondary Index (GSI)**を使用して、効率的なクエリを実現しています。

#### 実装済みのGSI

**1. PublishStatusIndex**（`publishStatus` + `createdAt`）

- **用途**: 公開記事一覧、下書き記事一覧の取得
- **メリット**: Scan不要、自動的に作成日時でソート

**クエリ例**:

```typescript
// 公開記事一覧を取得（新しい順）
const command = new QueryCommand({
  TableName: process.env.TABLE_NAME,
  IndexName: 'PublishStatusIndex',
  KeyConditionExpression: 'publishStatus = :status',
  ExpressionAttributeValues: {
    ':status': 'published',
  },
  ScanIndexForward: false, // 降順（新しい順）
  Limit: 20,
});
```

**2. CategoryIndex**（`category` + `createdAt`）

- **用途**: カテゴリ別記事一覧の取得
- **メリット**: カテゴリフィルタリングが高速

**クエリ例**:

```typescript
// 特定カテゴリの記事一覧を取得
const command = new QueryCommand({
  TableName: process.env.TABLE_NAME,
  IndexName: 'CategoryIndex',
  KeyConditionExpression: 'category = :category',
  ExpressionAttributeValues: {
    ':category': 'technology',
  },
  ScanIndexForward: false, // 降順（新しい順）
  Limit: 20,
});
```

### GSIパフォーマンステスト

GSIのパフォーマンスは既に統合テストで検証済みです：

- `tests/integration/database/dynamodb-gsi-queries.integration.test.ts`
- 16テストケース（CategoryIndex 7、PublishStatusIndex 4、Combined Queries 3、Query Optimization 2）

### クエリ最適化のベストプラクティス

1. **Scanを避ける**: 常にQuery（GSI使用）を使用
2. **ProjectionExpressionで必要な属性のみ取得**:

```typescript
const command = new QueryCommand({
  TableName: process.env.TABLE_NAME,
  IndexName: 'PublishStatusIndex',
  KeyConditionExpression: 'publishStatus = :status',
  ExpressionAttributeValues: {
    ':status': 'published',
  },
  ProjectionExpression: 'id, title, category, createdAt, imageUrls', // contentMarkdownを除外
  ScanIndexForward: false,
  Limit: 20,
});
```

3. **Limit設定**: 大量データのフルスキャンを避ける
4. **Paginated Queries**: LastEvaluatedKeyを使用してページネーション

## CloudFront キャッシング最適化

### 現在の設定

**CloudFront Distribution**（`infrastructure/lib/cdn-stack.ts`）:

```typescript
cachePolicy: new cloudfront.CachePolicy(this, 'ImageCachePolicy', {
  cachePolicyName: 'BlogImageCachePolicy',
  defaultTtl: cdk.Duration.hours(24),  // 24時間
  minTtl: cdk.Duration.hours(1),       // 最小1時間
  maxTtl: cdk.Duration.days(365),      // 最大1年
  enableAcceptEncodingGzip: true,      // Gzip圧縮
  enableAcceptEncodingBrotli: true,    // Brotli圧縮
  headerBehavior: cloudfront.CacheHeaderBehavior.none(),
  queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
  cookieBehavior: cloudfront.CacheCookieBehavior.none(),
}),
```

### キャッシング戦略

| コンテンツタイプ | TTL | キャッシュ対象 |
|----------------|-----|--------------|
| **画像** | 24時間 | すべての画像（S3 Images Bucket） |
| **静的アセット（JS、CSS）** | 1年 | フロントエンドビルド成果物 |
| **HTML** | 1時間 | index.html（短いTTLで更新を反映） |
| **APIレスポンス** | キャッシュなし | 動的コンテンツ |

### キャッシュヒット率の向上

1. **Cache-Controlヘッダーの設定**:

```typescript
// S3バケットにアップロード時
const putCommand = new PutObjectCommand({
  Bucket: bucketName,
  Key: key,
  Body: buffer,
  ContentType: contentType,
  CacheControl: 'public, max-age=86400', // 24時間
});
```

2. **クエリストリング・Cookieの最小化**:
   - 不要なクエリパラメータを除外
   - キャッシュキーに含めない

3. **Gzip/Brotli圧縮の有効化**（既に実装済み）:
   - 転送量削減
   - ページロード時間短縮

### キャッシュヒット率の測定

**CloudFront Logsを有効化**:

```typescript
// infrastructure/lib/cdn-stack.ts
this.imageDistribution = new cloudfront.Distribution(
  this,
  'ImageDistribution',
  {
    // ... 既存の設定
    enableLogging: true, // ← 変更
    logBucket: logBucket, // ← S3バケット指定
    logFilePrefix: 'cloudfront-logs/',
  }
);
```

**CloudWatch Metricsで確認**:

- `CacheHitRate`: キャッシュヒット率（目標: > 80%）
- `BytesDownloaded`: ダウンロード量
- `Requests`: リクエスト数

## ページロード時間の最適化

### 目標: 2秒以内

**Requirements R33**: 公開サイトのページロード時間を2秒以内にする

### 現在の最適化

1. ✅ **CloudFront CDN**: 世界中のエッジロケーションから配信
2. ✅ **Gzip/Brotli圧縮**: 転送量削減
3. ✅ **S3静的ホスティング**: 高速な静的コンテンツ配信
4. ✅ **Lambda Powertools**: 構造化ロギングによるオーバーヘッド最小化

### 追加の最適化手法

#### フロントエンド最適化

1. **コード分割（Code Splitting）**:

```typescript
// frontend/public/src/App.tsx
import { lazy, Suspense } from 'react';

const PostDetailPage = lazy(() => import('./pages/PostDetailPage'));
const PostListPage = lazy(() => import('./pages/PostListPage'));

function App() {
  return (
    <Router>
      <Suspense fallback={<div>Loading...</div>}>
        <Routes>
          <Route path="/" element={<PostListPage />} />
          <Route path="/posts/:id" element={<PostDetailPage />} />
        </Routes>
      </Suspense>
    </Router>
  );
}
```

2. **画像最適化**:
   - WebP形式の使用
   - 適切なサイズへのリサイズ
   - LazyLoading実装

```typescript
// frontend/public/src/components/PostImage.tsx
function PostImage({ src, alt }: { src: string; alt: string }) {
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      width="800"
      height="600"
    />
  );
}
```

3. **Viteビルド最適化**:

```typescript
// frontend/public/vite.config.ts
export default defineConfig({
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // console.log削除
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          router: ['react-router-dom'],
        },
      },
    },
  },
});
```

#### バックエンド最適化

1. **DynamoDBレスポンスの軽量化**:

```typescript
// contentMarkdownを一覧APIから除外
const command = new QueryCommand({
  ProjectionExpression: 'id, title, category, createdAt, imageUrls',
  // contentMarkdownとcontentHTMLを除外（サイズ削減）
});
```

2. **API Gatewayレスポンス圧縮**:
   - API Gatewayは自動的にGzip圧縮を適用（> 1KB）

### ページロード時間の測定

#### 1. Lighthouse（Chrome DevTools）

```bash
# インストール
npm install -g lighthouse

# 実行
lighthouse https://your-cloudfront-domain.com --view
```

**主要メトリクス**:
- **First Contentful Paint (FCP)**: < 1.8秒
- **Speed Index**: < 3.4秒
- **Largest Contentful Paint (LCP)**: < 2.5秒
- **Time to Interactive (TTI)**: < 3.8秒
- **Total Blocking Time (TBT)**: < 200ms
- **Cumulative Layout Shift (CLS)**: < 0.1

#### 2. WebPageTest

```
https://www.webpagetest.org/
```

- 複数の地域からテスト
- 詳細なウォーターフォールチャート
- フィルムストリップビュー

#### 3. Playwright E2Eテスト

既存のE2Eテストでページロード時間を測定：

```typescript
// tests/e2e/specs/performance.spec.ts
import { test, expect } from '@playwright/test';

test('ホームページのロード時間が2秒以内であること', async ({ page }) => {
  const startTime = Date.now();

  await page.goto('/');

  await page.waitForLoadState('networkidle');

  const loadTime = Date.now() - startTime;

  console.log(`Page load time: ${loadTime}ms`);
  expect(loadTime).toBeLessThan(2000); // 2秒以内
});
```

## パフォーマンスユーティリティの使用方法

### measureExecutionTime

Lambda関数の実行時間を測定：

```typescript
import { measureExecutionTime } from '../shared/performanceUtils';

export const handler = async (event: APIGatewayProxyEvent) => {
  const result = await measureExecutionTime(async () => {
    // DynamoDBクエリ
    const posts = await queryPosts();
    return posts;
  });

  console.log(`Query execution time: ${result.executionTimeMs}ms`);

  return {
    statusCode: 200,
    body: JSON.stringify(result.value),
  };
};
```

### measureMemoryUsage

メモリ使用量を測定：

```typescript
import { measureMemoryUsage } from '../shared/performanceUtils';

export const handler = async (event: APIGatewayProxyEvent) => {
  const beforeMemory = measureMemoryUsage();

  // 大量データ処理
  const largeArray = await processLargeData();

  const afterMemory = measureMemoryUsage();

  console.log(`Memory used: ${afterMemory.heapUsedMB - beforeMemory.heapUsedMB} MB`);

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true }),
  };
};
```

### calculateStatistics

複数回の実行結果から統計を計算：

```typescript
import { measureExecutionTime, calculateStatistics } from '../shared/performanceUtils';

async function benchmark() {
  const executionTimes: number[] = [];

  // 100回実行
  for (let i = 0; i < 100; i++) {
    const result = await measureExecutionTime(async () => {
      return await queryPosts();
    });
    executionTimes.push(result.executionTimeMs);
  }

  const stats = calculateStatistics(executionTimes);

  console.log(`Min: ${stats.min}ms`);
  console.log(`Max: ${stats.max}ms`);
  console.log(`Mean: ${stats.mean}ms`);
  console.log(`Median: ${stats.median}ms`);
  console.log(`P95: ${stats.p95}ms`);
  console.log(`P99: ${stats.p99}ms`);
}
```

## パフォーマンス監視

### CloudWatch Metrics

**Lambda関数メトリクス**:
- `Duration`: 実行時間（ミリ秒）
- `Invocations`: 実行回数
- `Errors`: エラー数
- `Throttles`: スロットル数
- `ConcurrentExecutions`: 同時実行数

**DynamoDBメトリクス**:
- `ConsumedReadCapacityUnits`: 読み取りキャパシティ消費
- `ConsumedWriteCapacityUnits`: 書き込みキャパシティ消費
- `SuccessfulRequestLatency`: リクエストレイテンシ

**CloudFrontメトリクス**:
- `CacheHitRate`: キャッシュヒット率
- `Requests`: リクエスト数
- `BytesDownloaded`: ダウンロード量

### CloudWatch Logsでクエリ

```sql
# Lambda実行時間の統計
fields @timestamp, @duration
| filter @type = "REPORT"
| stats avg(@duration), max(@duration), pct(@duration, 95) by bin(5m)

# エラー率の計算
fields @timestamp, @message
| filter @type = "REPORT"
| stats sum(@message like /Error/) / count(*) as error_rate by bin(5m)
```

### X-Rayトレース分析

1. **サービスマップ**: API Gateway → Lambda → DynamoDB の呼び出しフローを可視化
2. **トレース詳細**: 各セグメントの実行時間を確認
3. **アノテーション**: カスタムメタデータでフィルタリング

## トラブルシューティング

### ページロード時間が遅い

**原因1**: CloudFrontキャッシュヒット率が低い

**解決策**:
- Cache-Controlヘッダーを確認
- クエリストリング・Cookieを最小化
- TTLを適切に設定

**原因2**: Lambda実行時間が長い

**解決策**:
- メモリサイズを増やす（CPU性能も向上）
- コード最適化（不要な処理削除）
- DynamoDBクエリを最適化（GSI使用）

**原因3**: フロントエンドバンドルサイズが大きい

**解決策**:
- コード分割（Code Splitting）
- Tree Shaking（未使用コード削除）
- 依存関係の見直し

### Lambda関数のタイムアウト

**原因**: 処理時間が30秒を超える

**解決策**:
- タイムアウト時間を延長（最大15分）
- 処理を非同期化（SQS、EventBridge使用）
- バッチ処理の分割

### DynamoDBスロットル

**原因**: リクエスト数がキャパシティを超える

**解決策**:
- オンデマンドモード使用（既に実装済み）
- バッチ処理でリクエスト数削減
- DynamoDB Accelerator (DAX)導入

## まとめ

- **Lambda関数**: メモリサイズを適切に設定（128MB〜512MB）
- **DynamoDB**: GSIを使用してScanを避ける
- **CloudFront**: 24時間TTL、Gzip/Brotli圧縮でキャッシュヒット率向上
- **ページロード時間**: コード分割、画像最適化で2秒以内を実現
- **コールドスタート**: Lambda Layers、VPC不使用、Provisioned Concurrencyで最適化
- **監視**: CloudWatch Metrics、X-Ray、Lighthouseで継続的にパフォーマンスを測定

パフォーマンス最適化は継続的なプロセスです。定期的にベンチマークを実施し、ボトルネックを特定して改善していきましょう。
