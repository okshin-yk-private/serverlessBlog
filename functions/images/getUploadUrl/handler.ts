import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Logger } from '@aws-lambda-powertools/logger';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics';
import { getUserIdFromEvent } from '../../shared/auth-utils';

const logger = new Logger();
const tracer = new Tracer();
const metrics = new Metrics();

const PRESIGNED_URL_EXPIRATION = 900; // 15分（秒単位）
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// 許可されたファイル拡張子
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

// 許可されたContent-Type
const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
];

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

function createErrorResponse(statusCode: number, message: string): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({ message }),
  };
}

function validateFileName(fileName: string): boolean {
  const extension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
  return ALLOWED_EXTENSIONS.includes(extension);
}

function validateContentType(contentType: string): boolean {
  return ALLOWED_CONTENT_TYPES.includes(contentType.toLowerCase());
}

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  logger.addContext(context);

  try {
    // リクエストボディのパース
    if (!event.body) {
      logger.warn('リクエストボディが空です');
      metrics.addMetric('GetUploadUrlValidationError', MetricUnit.Count, 1);
      return createErrorResponse(400, 'リクエストボディが必要です');
    }

    const body = JSON.parse(event.body);
    const { fileName, contentType, fileSize } = body;

    // バリデーション: ファイル名
    if (!fileName || typeof fileName !== 'string') {
      logger.warn('ファイル名が指定されていません', { fileName });
      metrics.addMetric('GetUploadUrlValidationError', MetricUnit.Count, 1);
      return createErrorResponse(400, 'ファイル名が指定されていません');
    }

    // バリデーション: Content-Type
    if (!contentType || typeof contentType !== 'string') {
      logger.warn('Content-Typeが指定されていません', { contentType });
      metrics.addMetric('GetUploadUrlValidationError', MetricUnit.Count, 1);
      return createErrorResponse(400, 'Content-Typeが指定されていません');
    }

    // バリデーション: ファイル拡張子
    if (!validateFileName(fileName)) {
      logger.warn('許可されていないファイル拡張子です', { fileName });
      metrics.addMetric('GetUploadUrlValidationError', MetricUnit.Count, 1);
      return createErrorResponse(
        400,
        `許可されていないファイル拡張子です。対応形式: ${ALLOWED_EXTENSIONS.join(', ')}`
      );
    }

    // バリデーション: Content-Type
    if (!validateContentType(contentType)) {
      logger.warn('許可されていないContent-Typeです', { contentType });
      metrics.addMetric('GetUploadUrlValidationError', MetricUnit.Count, 1);
      return createErrorResponse(
        400,
        `許可されていないContent-Typeです。対応形式: ${ALLOWED_CONTENT_TYPES.join(', ')}`
      );
    }

    // バリデーション: ファイルサイズ
    if (fileSize && fileSize > MAX_FILE_SIZE) {
      logger.warn('ファイルサイズが上限を超えています', { fileSize });
      metrics.addMetric('GetUploadUrlValidationError', MetricUnit.Count, 1);
      return createErrorResponse(400, `ファイルサイズは5MB以下にしてください`);
    }

    // ユーザーIDを取得
    const userId = getUserIdFromEvent(event);

    if (!userId) {
      logger.warn('認証情報が取得できません');
      metrics.addMetric('GetUploadUrlAuthError', MetricUnit.Count, 1);
      return createErrorResponse(401, '認証が必要です');
    }

    // 環境変数の取得
    const bucketName = process.env.BUCKET_NAME;
    const cloudFrontDomain = process.env.CLOUDFRONT_DOMAIN;

    if (!bucketName) {
      logger.error('BUCKET_NAMEが設定されていません');
      metrics.addMetric('GetUploadUrlConfigError', MetricUnit.Count, 1);
      return createErrorResponse(500, 'サーバー設定エラーが発生しました');
    }

    // S3キーの生成（ユーザーID + タイムスタンプ + ファイル名）
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `images/${userId}/${timestamp}_${sanitizedFileName}`;

    logger.info('Pre-signed URL生成中', { key, contentType });

    // Pre-signed URLの生成
    const client = getS3Client();
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(client, command, {
      expiresIn: PRESIGNED_URL_EXPIRATION,
    });

    // CloudFront URL（アップロード後にアクセスするURL）
    const imageUrl = cloudFrontDomain ? `${cloudFrontDomain}/${key}` : `https://${bucketName}.s3.amazonaws.com/${key}`;

    logger.info('Pre-signed URL生成が完了しました', { key, imageUrl });
    metrics.addMetric('GetUploadUrlSuccess', MetricUnit.Count, 1);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        uploadUrl,
        imageUrl,
        key,
        expiresIn: PRESIGNED_URL_EXPIRATION,
      }),
    };
  } catch (error) {
    logger.error('Pre-signed URL生成中にエラーが発生しました', { error });
    metrics.addMetric('GetUploadUrlError', MetricUnit.Count, 1);
    return createErrorResponse(500, 'サーバーエラーが発生しました');
  }
};
