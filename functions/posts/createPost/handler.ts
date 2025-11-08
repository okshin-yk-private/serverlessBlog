import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { Logger } from '@aws-lambda-powertools/logger';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics';
import { v4 as uuidv4 } from 'uuid';
import { markdownToSafeHtml } from '../../../layers/common/nodejs/utils/markdownUtils';
import { BlogPost, CreatePostRequest, ErrorResponse } from '../../shared/types';
import {
  HTTP_STATUS,
  CORS_HEADERS,
  PUBLISH_STATUS,
} from '../../shared/constants';

// Lambda Powertools初期化
const logger = new Logger({ serviceName: 'createPost' });
const tracer = new Tracer({ serviceName: 'createPost' });
const metrics = new Metrics({
  serviceName: 'createPost',
  namespace: 'BlogPlatform',
});

// 環境変数
const TABLE_NAME = process.env.TABLE_NAME!;

// DynamoDB クライアント（遅延初期化）
let dynamoDBClient: ReturnType<typeof DynamoDBDocumentClient.from> | null =
  null;

export function getDynamoDBClient() {
  if (!dynamoDBClient) {
    const clientConfig: any = {};

    // 統合テスト用: DynamoDB Localエンドポイントが設定されている場合
    if (process.env.DYNAMODB_ENDPOINT) {
      clientConfig.endpoint = process.env.DYNAMODB_ENDPOINT;
      clientConfig.region = process.env.AWS_REGION || 'us-east-1';
      clientConfig.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
      };
    }

    const client = new DynamoDBClient(clientConfig);
    // テスト環境以外でTracerを適用
    const tracedClient =
      process.env.NODE_ENV === 'test'
        ? client
        : tracer.captureAWSv3Client(client);
    dynamoDBClient = DynamoDBDocumentClient.from(tracedClient);
  }
  return dynamoDBClient;
}

// テスト用: DynamoDBクライアントをリセット
export function resetDynamoDBClient() {
  dynamoDBClient = null;
}

/**
 * リクエストのバリデーション
 */
function validateRequest(request: CreatePostRequest): string | null {
  if (!request.title || request.title.trim() === '') {
    return 'title is required and cannot be empty';
  }

  if (!request.contentMarkdown || request.contentMarkdown.trim() === '') {
    return 'contentMarkdown is required and cannot be empty';
  }

  if (!request.category || request.category.trim() === '') {
    return 'category is required and cannot be empty';
  }

  return null;
}

/**
 * エラーレスポンスを生成
 */
function createErrorResponse(
  statusCode: number,
  message: string
): APIGatewayProxyResult {
  const response: ErrorResponse = { message };
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(response),
  };
}

/**
 * 記事作成Lambda関数ハンドラー
 */
export async function handler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  // Lambda Powertools設定
  logger.addContext(context);
  metrics.addMetadata('requestId', context.awsRequestId);

  try {
    // リクエストボディのパース
    if (!event.body) {
      logger.error('Request body is null or undefined');
      return createErrorResponse(
        HTTP_STATUS.BAD_REQUEST,
        'Request body is required'
      );
    }

    const request: CreatePostRequest = JSON.parse(event.body);
    logger.info('Received create post request', { request });

    // バリデーション
    const validationError = validateRequest(request);
    if (validationError) {
      logger.warn('Validation failed', { error: validationError });
      metrics.addMetric('ValidationError', MetricUnit.Count, 1);
      return createErrorResponse(HTTP_STATUS.BAD_REQUEST, validationError);
    }

    // authorIdを取得（Cognitoから）
    const authorId = event.requestContext?.authorizer?.claims?.sub;
    if (!authorId) {
      logger.error('Author ID not found in request context');
      return createErrorResponse(HTTP_STATUS.UNAUTHORIZED, 'Unauthorized');
    }

    // 記事データの準備
    const now = new Date().toISOString();
    const postId = uuidv4();

    // Markdownを安全なHTMLに変換
    const contentHtml = markdownToSafeHtml(request.contentMarkdown);
    logger.info('Converted markdown to HTML', { postId });

    const blogPost: BlogPost = {
      id: postId,
      title: request.title.trim(),
      contentMarkdown: request.contentMarkdown.trim(),
      contentHtml,
      category: request.category.trim(),
      tags: request.tags || [],
      publishStatus: request.publishStatus || PUBLISH_STATUS.DRAFT,
      authorId,
      createdAt: now,
      updatedAt: now,
      imageUrls: request.imageUrls || [],
    };

    // publishedの場合はpublishedAtを設定
    if (blogPost.publishStatus === PUBLISH_STATUS.PUBLISHED) {
      blogPost.publishedAt = now;
    }

    logger.info('Saving post to DynamoDB', { postId, blogPost });

    // DynamoDBに保存
    const putCommand = new PutCommand({
      TableName: TABLE_NAME,
      Item: blogPost,
    });

    await getDynamoDBClient().send(putCommand);

    logger.info('Post created successfully', { postId });
    metrics.addMetric('PostCreated', MetricUnit.Count, 1);

    // 成功レスポンス
    return {
      statusCode: HTTP_STATUS.CREATED,
      headers: CORS_HEADERS,
      body: JSON.stringify(blogPost),
    };
  } catch (error) {
    logger.error('Error creating post', { error });
    metrics.addMetric('PostCreationError', MetricUnit.Count, 1);

    return createErrorResponse(
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      'Internal Server Error'
    );
  }
}
