/**
 * updatePost Lambda Handler
 *
 * Requirement R3: 記事公開機能
 * - publishStatusを"published"に更新
 * - publishedAtフィールドに現在のタイムスタンプを記録
 * - publishStatusを"draft"に変更
 *
 * Requirement R4: 記事更新機能
 * - 有効な記事IDで更新 → DynamoDB更新
 * - updatedAtを現在のタイムスタンプに更新
 * - 記事が存在しない → 404 Not Found
 * - 未認証リクエスト → 401 Unauthorized
 * - 指定されたフィールドのみ更新
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
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { Logger } from '@aws-lambda-powertools/logger';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics';
import { markdownToSafeHtml } from '../../../layers/common/nodejs/utils/markdownUtils';

const logger = new Logger();
const tracer = new Tracer();
const metrics = new Metrics();

const TABLE_NAME = process.env.TABLE_NAME || 'blog-posts-table';

let dynamoDBClient: DynamoDBDocumentClient | null = null;

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

export function resetDynamoDBClient(): void {
  dynamoDBClient = null;
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
 * Lambda handler: 記事を更新
 *
 * @param event - API Gateway Proxy Event
 *   - pathParameters.id: 記事ID（必須）
 *   - body: 更新するフィールド（JSON）
 *   - requestContext.authorizer.claims.sub: ユーザーID（認証必須）
 * @param context - Lambda実行コンテキスト
 * @returns API Gateway Proxy Result
 *
 * @example
 * // タイトル更新
 * PUT /posts/{id}
 * Body: { "title": "New Title" }
 * → 200 OK + 更新された記事データ
 *
 * @example
 * // 下書きを公開
 * PUT /posts/{id}
 * Body: { "publishStatus": "published" }
 * → 200 OK + publishedAtが設定される
 *
 * @example
 * // 複数フィールド更新
 * PUT /posts/{id}
 * Body: { "title": "New", "contentMarkdown": "# Content", "category": "Tech" }
 * → 200 OK + contentHtmlも自動更新
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
      metrics.addMetric('UpdatePostValidationError', MetricUnit.Count, 1);
      return createErrorResponse(400, '記事IDが指定されていません');
    }

    // リクエストボディの取得とバリデーション
    if (!event.body) {
      logger.warn('リクエストボディが必要です');
      metrics.addMetric('UpdatePostValidationError', MetricUnit.Count, 1);
      return createErrorResponse(400, 'リクエストボディが必要です');
    }

    // JSONパース
    let updateData: unknown;
    try {
      updateData = JSON.parse(event.body);
    } catch (error) {
      logger.warn('無効なJSON形式です', { error });
      metrics.addMetric('UpdatePostValidationError', MetricUnit.Count, 1);
      return createErrorResponse(400, '無効なJSON形式です');
    }

    // 認証チェック
    const isAuthenticated = !!event.requestContext?.authorizer?.claims?.sub;
    if (!isAuthenticated) {
      logger.warn('未認証のリクエストです');
      metrics.addMetric('UpdatePostUnauthorized', MetricUnit.Count, 1);
      return createErrorResponse(401, '認証が必要です');
    }

    // 既存の記事を取得
    const docClient = getDynamoDBClient();
    logger.info('既存の記事を取得中', { postId });

    const getResult = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: postId },
      })
    );

    if (!getResult.Item) {
      logger.warn('記事が見つかりません', { postId });
      metrics.addMetric('UpdatePostNotFound', MetricUnit.Count, 1);
      return createErrorResponse(404, '記事が見つかりません');
    }

    const existingPost = getResult.Item;

    // 更新データのバリデーション
    if (updateData.title !== undefined) {
      if (
        typeof updateData.title !== 'string' ||
        updateData.title.trim() === ''
      ) {
        logger.warn('タイトルが空です');
        metrics.addMetric('UpdatePostValidationError', MetricUnit.Count, 1);
        return createErrorResponse(400, 'タイトルは必須です');
      }
    }

    if (updateData.contentMarkdown !== undefined) {
      if (
        typeof updateData.contentMarkdown !== 'string' ||
        updateData.contentMarkdown.trim() === ''
      ) {
        logger.warn('本文が空です');
        metrics.addMetric('UpdatePostValidationError', MetricUnit.Count, 1);
        return createErrorResponse(400, '本文は必須です');
      }
    }

    if (updateData.publishStatus !== undefined) {
      if (!['draft', 'published'].includes(updateData.publishStatus)) {
        logger.warn('不正なpublishStatusです', {
          publishStatus: updateData.publishStatus,
        });
        metrics.addMetric('UpdatePostValidationError', MetricUnit.Count, 1);
        return createErrorResponse(
          400,
          'publishStatusは"draft"または"published"である必要があります'
        );
      }
    }

    // 更新データのマージ
    const updatedPost = {
      ...existingPost,
      ...updateData,
      id: postId, // IDは変更不可
      authorId: existingPost.authorId, // authorIdは変更不可
      createdAt: existingPost.createdAt, // createdAtは変更不可
      updatedAt: new Date().toISOString(), // updatedAtは常に更新
    };

    // contentMarkdownが更新された場合、contentHtmlも更新
    if (updateData.contentMarkdown) {
      updatedPost.contentHtml = markdownToSafeHtml(updateData.contentMarkdown);
    }

    // publishStatusがdraft→publishedに変更された場合、publishedAtを設定
    if (
      updateData.publishStatus === 'published' &&
      existingPost.publishStatus === 'draft' &&
      !existingPost.publishedAt
    ) {
      updatedPost.publishedAt = new Date().toISOString();
    }

    // DynamoDBに保存
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: updatedPost,
      })
    );

    logger.info('記事の更新が完了しました', { postId });
    metrics.addMetric('UpdatePostSuccess', MetricUnit.Count, 1);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(updatedPost),
    };
  } catch (error) {
    logger.error('記事の更新中にエラーが発生しました', { error });
    metrics.addMetric('UpdatePostError', MetricUnit.Count, 1);
    return createErrorResponse(500, 'サーバーエラーが発生しました');
  }
};
