import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
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

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  logger.addContext(context);

  try {
    // 記事IDの取得
    const postId = event.pathParameters?.id;
    if (!postId) {
      logger.warn('記事IDが指定されていません');
      metrics.addMetric('GetPublicPostValidationError', MetricUnit.Count, 1);
      return createErrorResponse(400, '記事IDが指定されていません');
    }

    // 記事を取得
    const docClient = getDynamoDBClient();
    logger.info('公開記事を取得中', { postId });

    const getResult = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { id: postId },
    }));

    if (!getResult.Item) {
      logger.warn('記事が見つかりません', { postId });
      metrics.addMetric('GetPublicPostNotFound', MetricUnit.Count, 1);
      return createErrorResponse(404, '記事が見つかりません');
    }

    // 下書き記事の場合は404を返す
    if (getResult.Item.publishStatus === 'draft') {
      logger.warn('下書き記事へのアクセス試行', { postId });
      metrics.addMetric('GetPublicPostDraftAccess', MetricUnit.Count, 1);
      return createErrorResponse(404, '記事が見つかりません');
    }

    // contentMarkdownを除外したレスポンスを作成
    const { contentMarkdown, ...publicPostData } = getResult.Item;

    logger.info('公開記事の取得が完了しました', { postId });
    metrics.addMetric('GetPublicPostSuccess', MetricUnit.Count, 1);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(publicPostData),
    };
  } catch (error) {
    logger.error('公開記事の取得中にエラーが発生しました', { error });
    metrics.addMetric('GetPublicPostError', MetricUnit.Count, 1);
    return createErrorResponse(500, 'サーバーエラーが発生しました');
  }
};
