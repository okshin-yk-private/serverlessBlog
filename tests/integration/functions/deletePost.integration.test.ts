import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { DynamoDBClient, CreateTableCommand, DeleteTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';

// テスト用のDynamoDBクライアント
const dynamoDBClient = new DynamoDBClient({
  endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
  },
});

const docClient = DynamoDBDocumentClient.from(dynamoDBClient);

const TABLE_NAME = 'test-delete-posts-table';

// ハンドラーインポート前に環境変数を設定
process.env.TABLE_NAME = TABLE_NAME;

// Powertools Loggerのモック（ログ出力を抑制）
jest.mock('@aws-lambda-powertools/logger', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    addContext: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

// Powertools Tracerのモック
jest.mock('@aws-lambda-powertools/tracer', () => ({
  Tracer: jest.fn().mockImplementation(() => ({
    captureAWSv3Client: jest.fn((client) => client),
  })),
}));

// Powertools Metricsのモック
jest.mock('@aws-lambda-powertools/metrics', () => ({
  Metrics: jest.fn().mockImplementation(() => ({
    addMetadata: jest.fn(),
    addMetric: jest.fn(),
  })),
  MetricUnit: {
    Count: 'Count',
  },
}));

// ハンドラーをインポート（モックの後）
import { handler, resetDynamoDBClient } from '../../../functions/posts/deletePost/handler';

describe('deletePost Lambda Handler - Integration Tests', () => {
  const mockContext = {} as Context;

  // テーブル作成
  beforeAll(async () => {
    try {
      await dynamoDBClient.send(new CreateTableCommand({
        TableName: TABLE_NAME,
        KeySchema: [
          { AttributeName: 'id', KeyType: 'HASH' },
        ],
        AttributeDefinitions: [
          { AttributeName: 'id', AttributeType: 'S' },
        ],
        BillingMode: 'PAY_PER_REQUEST',
      }));

      // テーブルが作成されるまで待機
      let tableReady = false;
      for (let i = 0; i < 10; i++) {
        try {
          const result = await dynamoDBClient.send(new DescribeTableCommand({
            TableName: TABLE_NAME,
          }));
          if (result.Table?.TableStatus === 'ACTIVE') {
            tableReady = true;
            break;
          }
        } catch (error) {
          // テーブルがまだ作成中
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      if (!tableReady) {
        throw new Error('Table creation timed out');
      }
    } catch (error: any) {
      if (error.name !== 'ResourceInUseException') {
        throw error;
      }
      // テーブルが既に存在する場合は続行
    }
  });

  // テーブル削除
  afterAll(async () => {
    try {
      await dynamoDBClient.send(new DeleteTableCommand({
        TableName: TABLE_NAME,
      }));
    } catch (error) {
      // テーブルが存在しない場合は無視
    }
  });

  beforeEach(() => {
    // DynamoDBクライアントをリセット
    resetDynamoDBClient();
  });

  describe('正常系 - DynamoDB操作', () => {
    it('有効な記事IDで記事を削除できる', async () => {
      // Arrange - 既存記事を作成
      const existingPost = {
        id: 'delete-test-1',
        title: '削除テスト記事',
        contentMarkdown: '# Content',
        contentHtml: '<h1>Content</h1>',
        category: 'test',
        tags: ['test'],
        publishStatus: 'draft',
        authorId: 'user-123',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: existingPost,
      }));

      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          id: 'delete-test-1',
        },
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user-123',
            },
          },
        } as any,
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(204);
      expect(result.body).toBe('');

      // DynamoDBから実際に削除されていることを確認
      const getResult = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: 'delete-test-1' },
      }));

      expect(getResult.Item).toBeUndefined();
    });

    it('削除後に同じ記事を取得しようとすると404エラーになる', async () => {
      // Arrange - 既存記事を作成
      const existingPost = {
        id: 'delete-test-2',
        title: '削除テスト記事2',
        contentMarkdown: '# Content',
        contentHtml: '<h1>Content</h1>',
        category: 'test',
        tags: ['test'],
        publishStatus: 'draft',
        authorId: 'user-123',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: existingPost,
      }));

      // 削除
      const deleteEvent: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          id: 'delete-test-2',
        },
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user-123',
            },
          },
        } as any,
      };

      const deleteResult = await handler(deleteEvent as APIGatewayProxyEvent, mockContext);
      expect(deleteResult.statusCode).toBe(204);

      // 削除後に再度削除を試みる
      const retryEvent: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          id: 'delete-test-2',
        },
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user-123',
            },
          },
        } as any,
      };

      // Act
      const result = await handler(retryEvent as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('記事が見つかりません');
    });
  });

  describe('異常系 - 記事不存在', () => {
    it('指定された記事が存在しない場合は404エラーを返す', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          id: 'non-existent-id',
        },
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user-123',
            },
          },
        } as any,
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('記事が見つかりません');
    });
  });
});
