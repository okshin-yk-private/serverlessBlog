# 技術設計ドキュメント: Image Upload Enhancement

## 1. 概要

### 目的
管理画面の画像アップロード機能を改善し、S3 URLの隠蔽化（CloudFront URL化）、画像プレビュー機能の維持、および画像削除機能を実装する。

### スコープ
- バックエンド: Lambda関数の環境変数追加、新規deleteImage Lambda関数
- インフラ: CDKスタック間のCloudFrontドメイン受け渡し
- フロントエンド: API関数追加、ImageUploaderコンポーネントの削除機能

### アーキテクチャ図

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Admin Frontend                                 │
│  ┌────────────────┐    ┌────────────────┐    ┌────────────────┐        │
│  │ ImageUploader  │    │   PostEditor   │    │  api/posts.ts  │        │
│  │  (preview+del) │    │   (markdown)   │    │  (deleteImage) │        │
│  └───────┬────────┘    └───────┬────────┘    └───────┬────────┘        │
└──────────┼─────────────────────┼─────────────────────┼──────────────────┘
           │                     │                     │
           │ Upload              │ Preview             │ DELETE
           ▼                     ▼                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         API Gateway                                       │
│   POST /admin/images/upload-url    DELETE /admin/images/{key+}           │
│        (Cognito Auth)                    (Cognito Auth)                  │
└──────────┬─────────────────────────────────────────────┬─────────────────┘
           │                                             │
           ▼                                             ▼
┌────────────────────┐                       ┌────────────────────┐
│  getUploadUrl      │                       │  deleteImage       │
│  Lambda            │                       │  Lambda            │
│  ┌──────────────┐  │                       │  ┌──────────────┐  │
│  │CLOUDFRONT_   │  │                       │  │BUCKET_NAME   │  │
│  │DOMAIN (new)  │  │                       │  │              │  │
│  └──────────────┘  │                       │  └──────────────┘  │
└─────────┬──────────┘                       └─────────┬──────────┘
          │                                            │
          │ Generate                                   │ Delete
          │ Pre-signed URL                             │ Object
          ▼                                            ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              S3 Bucket                                   │
│                        images/{userId}/{uuid}.ext                        │
└────────────────────────────────────────┬────────────────────────────────┘
                                         │
                                         │ OAC
                                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         CloudFront Distribution                          │
│                    https://{domain}/images/{key}                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 2. コンポーネント設計

### 2.1 Infrastructure Layer

#### LambdaFunctionsStackProps 拡張

**ファイル:** `infrastructure/lib/lambda-functions-stack.ts`

```typescript
export interface LambdaFunctionsStackProps extends cdk.StackProps {
  powertoolsLayer: lambda.ILayerVersion;
  commonLayer: lambda.ILayerVersion;
  blogPostsTable: dynamodb.ITable;
  imagesBucket: s3.IBucket;
  restApi: apigateway.IRestApi;
  authorizer: apigateway.IAuthorizer;
  cloudFrontDomainName: string;  // 追加
}
```

#### commonFunctionProps 環境変数追加

```typescript
const commonFunctionProps = {
  // ... 既存設定
  environment: {
    TABLE_NAME: blogPostsTable.tableName,
    BUCKET_NAME: imagesBucket.bucketName,
    CLOUDFRONT_DOMAIN: `https://${cloudFrontDomainName}`,  // 追加
    // ... Powertools設定
  },
};
```

#### deleteImageFunction 新規作成

```typescript
this.deleteImageFunction = new NodejsFunction(this, 'DeleteImageFunction', {
  ...commonFunctionProps,
  functionName: 'blog-delete-image',
  entry: path.join(__dirname, '../../functions/images/deleteImage/handler.ts'),
  handler: 'handler',
  description: 'Delete image from S3',
  bundling: {
    externalModules: [
      '@aws-lambda-powertools/logger',
      '@aws-lambda-powertools/tracer',
      '@aws-lambda-powertools/metrics',
    ],
  },
});

// S3削除権限
imagesBucket.grantDelete(this.deleteImageFunction);
```

#### API Gateway統合

```typescript
// DELETE /admin/images/{key+}
const deleteImageResource = adminImagesResource.addResource('{key+}');
deleteImageResource.addMethod(
  'DELETE',
  new apigateway.LambdaIntegration(this.deleteImageFunction),
  {
    authorizer,
    authorizationType: apigateway.AuthorizationType.COGNITO,
  }
);
```

#### blog-app.ts スタック接続

```typescript
const lambdaFunctionsStack = new LambdaFunctionsStack(
  app,
  'ServerlessBlogLambdaFunctionsStack',
  {
    // ... 既存props
    cloudFrontDomainName: cdnStack.imageDistribution.distributionDomainName,
  }
);
```

### 2.2 Backend Layer

#### deleteImage Lambda Handler

**ファイル:** `functions/images/deleteImage/handler.ts`

```typescript
import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Logger } from '@aws-lambda-powertools/logger';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics';
import { getUserIdFromEvent } from '../../shared/auth-utils';

const logger = new Logger();
const tracer = new Tracer();
const metrics = new Metrics();

let s3Client: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!s3Client) {
    const clientConfig: any = {};
    if (process.env.S3_ENDPOINT) {
      clientConfig.endpoint = process.env.S3_ENDPOINT;
      clientConfig.region = process.env.AWS_REGION || 'us-east-1';
      clientConfig.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
      };
      clientConfig.forcePathStyle = true;
    }
    s3Client = tracer.captureAWSv3Client(new S3Client(clientConfig));
  }
  return s3Client;
}

export function resetS3Client(): void {
  s3Client = null;
}

function createErrorResponse(
  statusCode: number,
  message: string
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({ message }),
  };
}

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  logger.addContext(context);

  try {
    // キーの取得（{key+}プロキシパラメータ）
    const key = event.pathParameters?.key;
    if (!key) {
      logger.warn('画像キーが指定されていません');
      metrics.addMetric('DeleteImageValidationError', MetricUnit.Count, 1);
      return createErrorResponse(400, '画像キーが指定されていません');
    }

    // デコード（URLエンコードされている可能性）
    const decodedKey = decodeURIComponent(key);

    // パストラバーサル防止
    if (decodedKey.includes('..')) {
      logger.warn('不正なキーが指定されました', { key: decodedKey });
      metrics.addMetric('DeleteImageValidationError', MetricUnit.Count, 1);
      return createErrorResponse(400, '不正なキーが指定されました');
    }

    // ユーザーID取得
    const userId = getUserIdFromEvent(event);
    if (!userId) {
      logger.warn('認証情報が取得できません');
      metrics.addMetric('DeleteImageAuthError', MetricUnit.Count, 1);
      return createErrorResponse(401, '認証が必要です');
    }

    // 認可チェック: キーがユーザーIDで始まることを確認
    if (!decodedKey.startsWith(`${userId}/`)) {
      logger.warn('他ユーザーの画像は削除できません', { userId, key: decodedKey });
      metrics.addMetric('DeleteImageForbidden', MetricUnit.Count, 1);
      return createErrorResponse(403, 'この画像を削除する権限がありません');
    }

    const bucketName = process.env.BUCKET_NAME;
    if (!bucketName) {
      logger.error('BUCKET_NAMEが設定されていません');
      metrics.addMetric('DeleteImageConfigError', MetricUnit.Count, 1);
      return createErrorResponse(500, 'サーバー設定エラーが発生しました');
    }

    // S3から削除
    const client = getS3Client();
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: decodedKey,
      })
    );

    logger.info('画像を削除しました', { key: decodedKey });
    metrics.addMetric('DeleteImageSuccess', MetricUnit.Count, 1);

    return {
      statusCode: 204,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: '',
    };
  } catch (error) {
    logger.error('画像削除中にエラーが発生しました', { error });
    metrics.addMetric('DeleteImageError', MetricUnit.Count, 1);
    return createErrorResponse(500, 'サーバーエラーが発生しました');
  }
};
```

### 2.3 Frontend Layer

#### API関数追加

**ファイル:** `frontend/admin/src/api/posts.ts`

```typescript
/**
 * S3から画像を削除
 * @param key 画像キー（userId/uuid.ext形式）
 */
export const deleteImage = async (key: string): Promise<void> => {
  const token = getAuthToken();
  await axios.delete(`${API_URL}/admin/images/${encodeURIComponent(key)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
};
```

#### ImageUploaderコンポーネント拡張

**ファイル:** `frontend/admin/src/components/ImageUploader.tsx`

Props拡張:
```typescript
interface ImageUploaderProps {
  onUpload: (imageUrl: string) => void;
  onDelete?: (imageUrl: string) => void;  // 追加
  uploadedImages?: string[];  // 追加: 既存アップロード画像のURL一覧
}
```

コンポーネント構造:
```tsx
const ImageUploader: React.FC<ImageUploaderProps> = ({
  onUpload,
  onDelete,
  uploadedImages = [],
}) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const handleDeleteClick = (imageUrl: string) => {
    setDeleteTarget(imageUrl);
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !onDelete) return;

    setIsDeleting(true);
    try {
      await onDelete(deleteTarget);
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <>
      {/* 既存のアップロードUI */}

      {/* アップロード済み画像一覧 */}
      {uploadedImages.length > 0 && (
        <div className="uploaded-images">
          {uploadedImages.map((url) => (
            <div key={url} className="image-item">
              <img src={url} alt="uploaded" />
              <button
                onClick={() => handleDeleteClick(url)}
                className="delete-button"
                aria-label="画像を削除"
              >
                <TrashIcon />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 削除確認ダイアログ */}
      {deleteTarget && (
        <ConfirmDialog
          message="この画像を削除しますか？"
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
          isLoading={isDeleting}
        />
      )}
    </>
  );
};
```

## 3. データフロー

### 3.1 CloudFront URL生成フロー

```
1. ユーザーが画像を選択
2. フロントエンドがPOST /admin/images/upload-urlを呼び出し
3. getUploadUrl Lambdaが:
   a. ファイル情報をバリデーション
   b. ユーザーIDを認証情報から取得
   c. S3 Pre-signed URLを生成
   d. CLOUDFRONT_DOMAIN環境変数からCloudFront URLを構築
   e. {uploadUrl, imageUrl, key}を返却
4. フロントエンドがuploadUrlにファイルをPUT
5. フロントエンドがimageUrl(CloudFront URL)をエディタに挿入
```

### 3.2 画像削除フロー

```
1. ユーザーが削除ボタンをクリック
2. 確認ダイアログを表示
3. ユーザーが確認
4. フロントエンドがimageUrlからkeyを抽出
5. DELETE /admin/images/{key}を呼び出し
6. deleteImage Lambdaが:
   a. パストラバーサルチェック
   b. 認証・認可チェック（keyがuserIdで始まること）
   c. S3からオブジェクトを削除
   d. 204 No Contentを返却
7. フロントエンドがUIから画像を削除
```

## 4. エラーハンドリング

| エラーケース | HTTPステータス | メッセージ |
|-------------|---------------|-----------|
| 認証なし | 401 | 認証が必要です |
| 他ユーザーの画像 | 403 | この画像を削除する権限がありません |
| 不正なキー（パストラバーサル） | 400 | 不正なキーが指定されました |
| キー未指定 | 400 | 画像キーが指定されていません |
| サーバー設定エラー | 500 | サーバー設定エラーが発生しました |
| S3エラー | 500 | サーバーエラーが発生しました |

## 5. セキュリティ考慮事項

### 5.1 認可モデル

- **ユーザーIDプレフィックス検証:** S3キーは `{userId}/{uuid}.{ext}` 形式で保存される。削除時にキーがリクエストユーザーのIDで始まることを検証し、他ユーザーの画像への不正アクセスを防止。

### 5.2 入力バリデーション

- **パストラバーサル防止:** キーに `..` が含まれる場合は拒否
- **URLデコード:** パスパラメータは自動でデコードされるが、明示的にdecodeURIComponentを適用

### 5.3 S3バケット保護

- **OAC（Origin Access Control）:** CloudFront経由のみアクセス許可
- **直接URL非公開:** S3バケットのパブリックアクセスはブロック

## 6. テスト戦略

### 6.1 ユニットテスト

**deleteImage Lambda:**
- 正常系: 有効なキーでの削除成功
- 認証エラー: userIdが取得できない場合
- 認可エラー: キーがuserIdで始まらない場合
- バリデーションエラー: パストラバーサル、キー未指定
- S3エラー: DeleteObjectCommandの失敗

### 6.2 統合テスト

- DELETE /admin/images/{key} エンドポイント
- Cognito認証の検証
- 実S3との連携（LocalStackまたはテストバケット）

### 6.3 フロントエンドテスト

- deleteImage API関数のモック
- ImageUploaderコンポーネントの削除ボタン
- 確認ダイアログの動作

## 7. モニタリング

### CloudWatch Metrics

| メトリクス名 | 説明 |
|-------------|------|
| DeleteImageSuccess | 削除成功数 |
| DeleteImageValidationError | バリデーションエラー数 |
| DeleteImageAuthError | 認証エラー数 |
| DeleteImageForbidden | 認可エラー数 |
| DeleteImageError | サーバーエラー数 |
| DeleteImageConfigError | 設定エラー数 |

### CloudWatch Logs

Lambda Powertools Loggerによる構造化ログ出力。

## 8. 変更ファイル一覧

| ファイル | 変更内容 |
|---------|---------|
| `infrastructure/lib/lambda-functions-stack.ts` | cloudFrontDomainName prop追加、CLOUDFRONT_DOMAIN環境変数追加、deleteImageFunction追加、API Gateway統合 |
| `infrastructure/bin/blog-app.ts` | cloudFrontDomainName渡し追加 |
| `functions/images/deleteImage/handler.ts` | 新規作成 |
| `functions/images/deleteImage/handler.test.ts` | 新規作成 |
| `frontend/admin/src/api/posts.ts` | deleteImage関数追加 |
| `frontend/admin/src/components/ImageUploader.tsx` | onDelete prop、削除ボタン、確認ダイアログ追加 |

## 9. 依存関係

### npm パッケージ
- 新規パッケージ不要（既存のAWS SDK v3、axios、Reactを使用）

### CDKスタック依存関係
```
LayersStack
     ↓
DatabaseStack  StorageStack  AuthStack
     ↓              ↓           ↓
ApiStack       CdnStack
     ↓              ↓
LambdaFunctionsStack ← cloudFrontDomainName
     ↓
MonitoringStack
```

CdnStackはLambdaFunctionsStackより先に作成されるため、循環依存なし。
