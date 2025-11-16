/**
 * listPosts Lambda Handler
 *
 * Requirement R6: 記事一覧取得機能
 * - 公開記事のリストを返す
 * - createdAtの降順（新しい順）でソート
 * - ページネーション（limit、nextToken）
 * - PublishStatusIndexを使用したクエリ最適化
 *
 * Requirement R8: カテゴリ別記事一覧機能
 * - CategoryIndexを使用したクエリ
 * - 指定されたカテゴリの公開記事のみを返す
 *
 * Requirement R18: クエリ最適化
 * - GSI（PublishStatusIndex、CategoryIndex）を活用
 */

import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { Logger } from '@aws-lambda-powertools/logger';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics';

const logger = new Logger();
const tracer = new Tracer();
const metrics = new Metrics();

const TABLE_NAME = process.env.TABLE_NAME || 'blog-posts-table';
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const MIN_LIMIT = 1;

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
 * Lambda handler: 公開記事一覧を取得
 *
 * @param event - API Gateway Proxy Event
 *   - queryStringParameters.limit: 取得件数（1〜100、デフォルト: 10）
 *   - queryStringParameters.nextToken: ページネーショントークン（Base64エンコード）
 *   - queryStringParameters.category: カテゴリフィルタ（オプション）
 * @param context - Lambda実行コンテキスト
 * @returns API Gateway Proxy Result
 *
 * @example
 * // 基本的な記事一覧取得
 * GET /posts
 * → { items: [...], count: 10, nextToken: "..." }
 *
 * @example
 * // ページネーション
 * GET /posts?limit=20&nextToken=...
 * → { items: [...], count: 20, nextToken: "..." }
 *
 * @example
 * // カテゴリフィルタ
 * GET /posts?category=Technology
 * → { items: [...], count: 5 }
 */
export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  logger.addContext(context);

  try {
    // クエリパラメータの取得
    const queryParams = event.queryStringParameters || {};
    const limitParam = queryParams.limit;
    const nextToken = queryParams.nextToken;
    const category = queryParams.category;

    // limitのバリデーション
    let limit = DEFAULT_LIMIT;
    if (limitParam) {
      const parsedLimit = parseInt(limitParam, 10);
      if (parsedLimit >= MIN_LIMIT && parsedLimit <= MAX_LIMIT) {
        limit = parsedLimit;
      } else {
        logger.warn('limitが範囲外です。デフォルト値を使用します', {
          requestedLimit: parsedLimit,
          defaultLimit: DEFAULT_LIMIT,
        });
      }
    }

    logger.info('公開記事一覧を取得中', {
      limit,
      hasNextToken: !!nextToken,
      category,
    });

    // DynamoDB Queryパラメータ
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const queryCommandInput: any = {
      TableName: TABLE_NAME,
      Limit: limit,
      ScanIndexForward: false, // createdAtの降順（新しい記事を先に）
    };

    // カテゴリフィルタがある場合はCategoryIndexを使用
    if (category) {
      queryCommandInput.IndexName = 'CategoryIndex';
      queryCommandInput.KeyConditionExpression = 'category = :category';
      queryCommandInput.ExpressionAttributeValues = {
        ':category': category,
      };
      // 公開記事のみを取得するためのFilterExpression
      queryCommandInput.FilterExpression = 'publishStatus = :publishStatus';
      queryCommandInput.ExpressionAttributeValues[':publishStatus'] =
        'published';
    } else {
      // カテゴリフィルタがない場合はPublishStatusIndexを使用
      queryCommandInput.IndexName = 'PublishStatusIndex';
      queryCommandInput.KeyConditionExpression =
        'publishStatus = :publishStatus';
      queryCommandInput.ExpressionAttributeValues = {
        ':publishStatus': 'published',
      };
    }

    // ページネーション
    if (nextToken) {
      try {
        queryCommandInput.ExclusiveStartKey = JSON.parse(
          Buffer.from(nextToken, 'base64').toString('utf-8')
        );
      } catch (error) {
        logger.warn('nextTokenのデコードに失敗しました', { error });
        // nextTokenが無効な場合は無視して最初から取得
      }
    }

    // DynamoDB Query実行
    const docClient = getDynamoDBClient();
    const result = await docClient.send(new QueryCommand(queryCommandInput));

    // レスポンスの作成
    const items = (result.Items || []).map((item) => {
      // contentMarkdownを除外
      const { contentMarkdown: _contentMarkdown, ...publicItem } = item;
      return publicItem;
    });

    // 次のページのトークン生成
    let responseNextToken: string | undefined;
    if (result.LastEvaluatedKey) {
      responseNextToken = Buffer.from(
        JSON.stringify(result.LastEvaluatedKey)
      ).toString('base64');
    }

    logger.info('公開記事一覧の取得が完了しました', {
      count: items.length,
      hasMore: !!responseNextToken,
    });
    metrics.addMetric('ListPostsSuccess', MetricUnit.Count, 1);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        items,
        count: items.length,
        nextToken: responseNextToken,
      }),
    };
  } catch (error) {
    logger.error('公開記事一覧の取得中にエラーが発生しました', { error });
    metrics.addMetric('ListPostsError', MetricUnit.Count, 1);
    return createErrorResponse(500, 'サーバーエラーが発生しました');
  }
};
