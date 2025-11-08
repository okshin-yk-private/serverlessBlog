import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import {
  DynamoDBClient,
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
} from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

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

const TABLE_NAME = 'test-blog-posts-table';

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
import {
  handler,
  resetDynamoDBClient,
} from '../../../functions/posts/getPost/handler';

describe('getPost Lambda Handler - Integration Tests', () => {
  const mockContext = {} as Context;

  // テーブル作成
  beforeAll(async () => {
    try {
      // DynamoDB接続確認
      let connectionReady = false;
      for (let i = 0; i < 15; i++) {
        try {
          await dynamoDBClient.send(
            new DescribeTableCommand({
              TableName: 'connection-check',
            })
          );
          connectionReady = true;
          break;
        } catch (error: any) {
          if (error.name === 'ResourceNotFoundException') {
            // テーブルは存在しないが、DynamoDBには接続できている
            connectionReady = true;
            break;
          }
          // その他のエラーの場合はリトライ
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      if (!connectionReady) {
        throw new Error('DynamoDB connection failed');
      }

      // テーブル作成
      await dynamoDBClient.send(
        new CreateTableCommand({
          TableName: TABLE_NAME,
          KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
          AttributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }],
          BillingMode: 'PAY_PER_REQUEST',
        })
      );

      // テーブルが作成されるまで待機
      let tableReady = false;
      for (let i = 0; i < 30; i++) {
        try {
          const result = await dynamoDBClient.send(
            new DescribeTableCommand({
              TableName: TABLE_NAME,
            })
          );
          if (result.Table?.TableStatus === 'ACTIVE') {
            tableReady = true;
            break;
          }
        } catch (error: any) {
          // エラーメッセージのみをログ出力（循環参照を避ける）
          console.warn(
            `Table not ready yet: ${error?.message || 'Unknown error'}`
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      if (!tableReady) {
        throw new Error('Table creation timed out after 60 seconds');
      }
    } catch (error: any) {
      if (error.name !== 'ResourceInUseException') {
        console.error(
          `Table creation error: ${error?.message || 'Unknown error'}`
        );
        throw error;
      }
      // テーブルが既に存在する場合は続行
    }
  }, 90000); // タイムアウトを90秒に延長

  // テーブル削除
  afterAll(async () => {
    try {
      await dynamoDBClient.send(
        new DeleteTableCommand({
          TableName: TABLE_NAME,
        })
      );
    } catch (error) {
      // テーブルが存在しない場合は無視
    }
  });

  beforeEach(() => {
    // DynamoDBクライアントをリセット
    resetDynamoDBClient();
  });

  describe('正常系 - DynamoDB操作', () => {
    it('有効な記事IDで記事を取得できる', async () => {
      // Arrange - 既存記事を作成
      const existingPost = {
        id: 'get-test-1',
        title: '取得テスト記事',
        contentMarkdown: '# Test Content\n\nThis is a test.',
        contentHtml: '<h1>Test Content</h1>\n\n<p>This is a test.</p>',
        category: 'test',
        tags: ['test', 'sample'],
        publishStatus: 'draft',
        authorId: 'user-123',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: existingPost,
        })
      );

      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          id: 'get-test-1',
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
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.id).toBe('get-test-1');
      expect(body.title).toBe('取得テスト記事');
      expect(body.contentMarkdown).toBe('# Test Content\n\nThis is a test.');
      expect(body.contentHtml).toBe(
        '<h1>Test Content</h1>\n\n<p>This is a test.</p>'
      );
      expect(body.category).toBe('test');
      expect(body.tags).toEqual(['test', 'sample']);
      expect(body.publishStatus).toBe('draft');
      expect(body.authorId).toBe('user-123');
      expect(body.createdAt).toBe('2024-01-01T00:00:00.000Z');
      expect(body.updatedAt).toBe('2024-01-01T00:00:00.000Z');
    });

    it('公開済み記事を取得できる', async () => {
      // Arrange - 公開済み記事を作成
      const publishedPost = {
        id: 'get-test-2',
        title: '公開済み記事',
        contentMarkdown: '# Published Content',
        contentHtml: '<h1>Published Content</h1>',
        category: 'tech',
        tags: ['published'],
        publishStatus: 'published',
        authorId: 'user-123',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
        publishedAt: '2024-01-02T00:00:00.000Z',
      };

      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: publishedPost,
        })
      );

      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          id: 'get-test-2',
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
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.id).toBe('get-test-2');
      expect(body.publishStatus).toBe('published');
      expect(body.publishedAt).toBe('2024-01-02T00:00:00.000Z');
      // 管理用なのでcontentMarkdownも含まれる
      expect(body.contentMarkdown).toBe('# Published Content');
    });

    it('下書き記事も取得できる（管理用）', async () => {
      // Arrange - 下書き記事を作成
      const draftPost = {
        id: 'get-test-3',
        title: '下書き記事',
        contentMarkdown: '# Draft Content',
        contentHtml: '<h1>Draft Content</h1>',
        category: 'general',
        tags: [],
        publishStatus: 'draft',
        authorId: 'user-123',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: draftPost,
        })
      );

      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          id: 'get-test-3',
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
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.id).toBe('get-test-3');
      expect(body.publishStatus).toBe('draft');
      // 管理用なので下書きも取得できる
      expect(body.contentMarkdown).toBeDefined();
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
