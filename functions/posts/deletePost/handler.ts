/**
 * deletePost Lambda Handler
 *
 * Requirement R5: 記事削除機能
 * - 有効な記事IDでDynamoDBから該当記事を削除する
 * - 削除対象の記事が存在しない → 404 Not Found
 * - 未認証リクエスト → 401 Unauthorized
 * - 記事に画像が関連付けられている場合、S3から関連画像を削除する
 */

import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { S3Client, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { Logger } from '@aws-lambda-powertools/logger';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics';

const logger = new Logger();
const tracer = new Tracer();
const metrics = new Metrics();

const TABLE_NAME = process.env.TABLE_NAME || 'blog-posts-table';
const BUCKET_NAME = process.env.BUCKET_NAME || 'blog-images-bucket';

let dynamoDBClient: DynamoDBDocumentClient | null = null;
let s3Client: S3Client | null = null;

export function getDynamoDBClient(): DynamoDBDocumentClient {
  if (!dynamoDBClient) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clientConfig: any = {};

    if (process.env.DYNAMODB_ENDPOINT) {
      clientConfig.endpoint = process.env.DYNAMODB_ENDPOINT;
      clientConfig.region = process.env.AWS_REGION || 'us-east-1';
      clientConfig.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
      };
    }

    const client = tracer.captureAWSv3Client(new DynamoDBClient(clientConfig));
    dynamoDBClient = DynamoDBDocumentClient.from(client);
  }
  return dynamoDBClient;
}

export function getS3Client(): S3Client {
  if (!s3Client) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

export function resetDynamoDBClient(): void {
  dynamoDBClient = null;
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

/**
 * URLから S3 キーを抽出
 * @param imageUrl - 完全なURL (例: "https://bucket.s3.amazonaws.com/images/photo.jpg")
 * @returns S3キー (例: "images/photo.jpg")
 */
function extractS3KeyFromUrl(imageUrl: string): string {
  try {
    const url = new URL(imageUrl);
    // パス名の先頭の "/" を除去
    return url.pathname.substring(1);
  } catch (error) {
    logger.warn('無効なURLです。そのまま使用します', { imageUrl, error });
    return imageUrl;
  }
}

/**
 * Lambda handler: 記事を削除
 *
 * @param event - API Gateway Proxy Event
 *   - pathParameters.id: 記事ID（必須）
 *   - requestContext.authorizer.claims.sub: ユーザーID（認証必須）
 * @param context - Lambda実行コンテキスト
 * @returns API Gateway Proxy Result
 *
 * @example
 * // 記事を削除（画像なし）
 * DELETE /posts/{id}
 * → 204 No Content
 *
 * @example
 * // 記事と画像を削除
 * DELETE /posts/{id}
 * → 204 No Content (S3からも画像が削除される)
 *
 * @example
 * // 記事が存在しない
 * DELETE /posts/{non-existent-id}
 * → 404 Not Found
 */
export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  logger.addContext(context);

  try {
    // 記事IDの取得とバリデーション
    const postId = event.pathParameters?.id;
    if (!postId || postId.trim() === '') {
      logger.warn('記事IDが指定されていません');
      metrics.addMetric('DeletePostValidationError', MetricUnit.Count, 1);
      return createErrorResponse(400, '記事IDが指定されていません');
    }

    // 認証チェック
    const isAuthenticated = !!event.requestContext?.authorizer?.claims?.sub;
    if (!isAuthenticated) {
      logger.warn('未認証のリクエストです');
      metrics.addMetric('DeletePostUnauthorized', MetricUnit.Count, 1);
      return createErrorResponse(401, '認証が必要です');
    }

    // 既存の記事を取得
    const docClient = getDynamoDBClient();
    logger.info('削除対象の記事を取得中', { postId });

    const getResult = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: postId },
      })
    );

    if (!getResult.Item) {
      logger.warn('記事が見つかりません', { postId });
      metrics.addMetric('DeletePostNotFound', MetricUnit.Count, 1);
      return createErrorResponse(404, '記事が見つかりません');
    }

    const post = getResult.Item;

    // 画像が関連付けられている場合、S3から削除
    if (
      post.imageUrls &&
      Array.isArray(post.imageUrls) &&
      post.imageUrls.length > 0
    ) {
      logger.info('関連画像をS3から削除中', {
        postId,
        imageCount: post.imageUrls.length,
      });

      const s3 = getS3Client();
      const objectsToDelete = post.imageUrls.map((url: string) => ({
        Key: extractS3KeyFromUrl(url),
      }));

      await s3.send(
        new DeleteObjectsCommand({
          Bucket: BUCKET_NAME,
          Delete: {
            Objects: objectsToDelete,
            Quiet: true,
          },
        })
      );

      logger.info('関連画像の削除が完了しました', {
        postId,
        imageCount: post.imageUrls.length,
      });
    }

    // DynamoDBから記事を削除
    await docClient.send(
      new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { id: postId },
      })
    );

    logger.info('記事の削除が完了しました', { postId });
    metrics.addMetric('DeletePostSuccess', MetricUnit.Count, 1);

    return {
      statusCode: 204,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: '',
    };
  } catch (error) {
    logger.error('記事の削除中にエラーが発生しました', { error });
    metrics.addMetric('DeletePostError', MetricUnit.Count, 1);
    return createErrorResponse(500, 'サーバーエラーが発生しました');
  }
};
