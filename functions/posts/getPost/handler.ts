/**
 * getPost Lambda Handler
 *
 * Requirement R7: 記事詳細取得機能
 * - IDによる単一記事取得
 * - 公開記事は全ユーザーがアクセス可能
 * - 下書き記事は認証済みユーザーのみアクセス可能
 * - 存在しない記事IDは404エラー
 * - MarkdownコンテンツをHTML形式で返す
 */

import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { Logger } from '@aws-lambda-powertools/logger';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics';

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
 * Lambda handler: 記事詳細を取得
 *
 * @param event - API Gateway Proxy Event（pathParameters.idに記事IDを含む）
 * @param context - Lambda実行コンテキスト
 * @returns API Gateway Proxy Result
 *
 * @example
 * // 公開記事の取得（認証なし）
 * GET /posts/{id}
 * → 200 OK + 記事データ
 *
 * @example
 * // 下書き記事の取得（認証あり）
 * GET /posts/{id}
 * Authorization: Bearer <token>
 * → 200 OK + 記事データ
 *
 * @example
 * // 下書き記事の取得（認証なし）
 * GET /posts/{id}
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
      metrics.addMetric('GetPostValidationError', MetricUnit.Count, 1);
      return createErrorResponse(400, '記事IDが指定されていません');
    }

    // 認証情報の取得
    const isAuthenticated = !!event.requestContext?.authorizer?.claims?.sub;

    // 記事を取得
    const docClient = getDynamoDBClient();
    logger.info('記事を取得中', { postId, isAuthenticated });

    const getResult = await docClient.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: postId },
      })
    );

    if (!getResult.Item) {
      logger.warn('記事が見つかりません', { postId });
      metrics.addMetric('GetPostNotFound', MetricUnit.Count, 1);
      return createErrorResponse(404, '記事が見つかりません');
    }

    const post = getResult.Item;

    // アクセス制御: 下書き記事は認証済みユーザーのみアクセス可能
    // Requirement R7.2: 下書き記事 + 未認証 → 404エラー
    if (post.publishStatus === 'draft' && !isAuthenticated) {
      logger.warn('未認証ユーザーが下書き記事にアクセスしようとしました', {
        postId,
      });
      metrics.addMetric('GetPostUnauthorizedDraftAccess', MetricUnit.Count, 1);
      return createErrorResponse(404, '記事が見つかりません');
    }

    logger.info('記事の取得が完了しました', {
      postId,
      publishStatus: post.publishStatus,
    });
    metrics.addMetric('GetPostSuccess', MetricUnit.Count, 1);

    // すべてのデータを返す（contentMarkdownを含む）
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(post),
    };
  } catch (error) {
    logger.error('記事の取得中にエラーが発生しました', { error });
    metrics.addMetric('GetPostError', MetricUnit.Count, 1);
    return createErrorResponse(500, 'サーバーエラーが発生しました');
  }
};
