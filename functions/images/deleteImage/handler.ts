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
      logger.warn('他ユーザーの画像は削除できません', {
        userId,
        key: decodedKey,
      });
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
