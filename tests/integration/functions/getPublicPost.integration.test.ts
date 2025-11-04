import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { DynamoDBClient, CreateTableCommand, DeleteTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
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
import { handler, resetDynamoDBClient } from '../../../functions/posts/getPublicPost/handler';

describe('getPublicPost Lambda Handler - Integration Tests', () => {
  const mockContext = {} as Context;

  // テーブル作成
  beforeAll(async () => {
    try {
      // DynamoDB接続確認
      let connectionReady = false;
      for (let i = 0; i < 15; i++) {
        try {
          await dynamoDBClient.send(new DescribeTableCommand({
            TableName: 'connection-check',
          }));
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
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      if (!connectionReady) {
        throw new Error('DynamoDB connection failed');
      }

      // テーブル作成
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
      for (let i = 0; i < 30; i++) {
        try {
          const result = await dynamoDBClient.send(new DescribeTableCommand({
            TableName: TABLE_NAME,
          }));
          if (result.Table?.TableStatus === 'ACTIVE') {
            tableReady = true;
            break;
          }
        } catch (error: any) {
          // エラーメッセージのみをログ出力（循環参照を避ける）
          console.warn(`Table not ready yet: ${error?.message || 'Unknown error'}`);
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      if (!tableReady) {
        throw new Error('Table creation timed out after 60 seconds');
      }
    } catch (error: any) {
      if (error.name !== 'ResourceInUseException') {
        console.error(`Table creation error: ${error?.message || 'Unknown error'}`);
        throw error;
      }
      // テーブルが既に存在する場合は続行
    }
  }, 90000); // タイムアウトを90秒に延長

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

  describe('正常系 - 公開記事の取得', () => {
    it('公開済み記事を取得できる', async () => {
      // Arrange - 公開済み記事を作成
      const publishedPost = {
        id: 'public-test-1',
        title: '公開済みテスト記事',
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

      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: publishedPost,
      }));

      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          id: 'public-test-1',
        },
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.id).toBe('public-test-1');
      expect(body.title).toBe('公開済みテスト記事');
      expect(body.publishStatus).toBe('published');
      expect(body.publishedAt).toBe('2024-01-02T00:00:00.000Z');
      expect(body.contentHtml).toBe('<h1>Published Content</h1>');
    });

    it('公開記事のレスポンスにcontentMarkdownを含めない', async () => {
      // Arrange - 公開済み記事を作成
      const publishedPost = {
        id: 'public-test-2',
        title: '公開済み記事2',
        contentMarkdown: '# Markdown Content',
        contentHtml: '<h1>HTML Content</h1>',
        category: 'general',
        tags: [],
        publishStatus: 'published',
        authorId: 'user-456',
        createdAt: '2024-01-03T00:00:00.000Z',
        updatedAt: '2024-01-03T00:00:00.000Z',
        publishedAt: '2024-01-03T00:00:00.000Z',
      };

      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: publishedPost,
      }));

      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          id: 'public-test-2',
        },
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.contentMarkdown).toBeUndefined();
      expect(body.contentHtml).toBe('<h1>HTML Content</h1>');
    });
  });

  describe('異常系 - 下書き記事と記事不存在', () => {
    it('下書き記事の場合は404エラーを返す', async () => {
      // Arrange - 下書き記事を作成
      const draftPost = {
        id: 'public-test-3',
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

      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: draftPost,
      }));

      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          id: 'public-test-3',
        },
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('記事が見つかりません');
    });

    it('指定された記事が存在しない場合は404エラーを返す', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          id: 'non-existent-id',
        },
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
