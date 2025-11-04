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

const TABLE_NAME = 'test-blog-posts-table';

// markdownUtilsのモック（統合テストでもMarkdown変換はモック）
jest.mock('/opt/nodejs/utils/markdownUtils', () => ({
  markdownToSafeHtml: jest.fn((markdown: string) => {
    return markdown
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');
  }),
}));

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
import { handler, resetDynamoDBClient } from '../../../functions/posts/updatePost/handler';

describe('updatePost Lambda Handler - Integration Tests', () => {
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

  describe('正常系 - DynamoDB操作', () => {
    it('有効な記事IDとデータで記事を更新できる', async () => {
      // Arrange - 既存記事を作成
      const existingPost = {
        id: 'update-test-1',
        title: '既存記事',
        contentMarkdown: '# Old Content',
        contentHtml: '<h1>Old Content</h1>',
        category: 'old-category',
        tags: ['old'],
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
          id: 'update-test-1',
        },
        body: JSON.stringify({
          title: '更新された記事',
          contentMarkdown: '# Updated Content',
          category: 'new-category',
          tags: ['new', 'updated'],
          publishStatus: 'published',
        }),
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
      expect(body.id).toBe('update-test-1');
      expect(body.title).toBe('更新された記事');
      expect(body.contentMarkdown).toBe('# Updated Content');
      expect(body.contentHtml).toContain('<h1>Updated Content</h1>');
      expect(body.category).toBe('new-category');
      expect(body.tags).toEqual(['new', 'updated']);
      expect(body.publishStatus).toBe('published');
      expect(body.updatedAt).not.toBe(existingPost.updatedAt);
      expect(body.createdAt).toBe(existingPost.createdAt);
      expect(body.publishedAt).toBeDefined();

      // DynamoDBに実際に保存されていることを確認
      const getResult = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: 'update-test-1' },
      }));

      expect(getResult.Item).toBeDefined();
      expect(getResult.Item?.title).toBe('更新された記事');
      expect(getResult.Item?.publishStatus).toBe('published');
    });

    it('一部のフィールドのみを更新できる', async () => {
      // Arrange - 既存記事を作成
      const existingPost = {
        id: 'update-test-2',
        title: '既存タイトル',
        contentMarkdown: '# Content',
        contentHtml: '<h1>Content</h1>',
        category: 'tech',
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
          id: 'update-test-2',
        },
        body: JSON.stringify({
          title: '新しいタイトルのみ更新',
        }),
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
      expect(body.title).toBe('新しいタイトルのみ更新');
      expect(body.contentMarkdown).toBe('# Content'); // 既存のまま
      expect(body.category).toBe('tech'); // 既存のまま

      // DynamoDBに実際に保存されていることを確認
      const getResult = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: 'update-test-2' },
      }));

      expect(getResult.Item).toBeDefined();
      expect(getResult.Item?.title).toBe('新しいタイトルのみ更新');
      expect(getResult.Item?.contentMarkdown).toBe('# Content');
    });

    it('Markdownが更新された場合はHTMLも更新される', async () => {
      // Arrange - 既存記事を作成
      const existingPost = {
        id: 'update-test-3',
        title: 'Markdownテスト',
        contentMarkdown: '# Old Heading',
        contentHtml: '<h1>Old Heading</h1>',
        category: 'test',
        tags: [],
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
          id: 'update-test-3',
        },
        body: JSON.stringify({
          contentMarkdown: '# New Heading\n\n## Subheading\n\n**Bold** and *italic*',
        }),
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
      expect(body.contentHtml).toContain('<h1>');
      expect(body.contentHtml).toContain('<h2>');
      expect(body.contentHtml).toContain('<strong>');
      expect(body.contentHtml).toContain('<em>');
    });
  });

  describe('異常系 - バリデーション', () => {
    it('タイトルが空文字列の場合は400エラーを返す', async () => {
      // Arrange - 既存記事を作成
      const existingPost = {
        id: 'update-test-4',
        title: '既存タイトル',
        contentMarkdown: '# Content',
        contentHtml: '<h1>Content</h1>',
        category: 'tech',
        tags: [],
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
          id: 'update-test-4',
        },
        body: JSON.stringify({
          title: '',
        }),
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
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('タイトル');
    });

    it('contentMarkdownが空文字列の場合は400エラーを返す', async () => {
      // Arrange - 既存記事を作成
      const existingPost = {
        id: 'update-test-5',
        title: '既存タイトル',
        contentMarkdown: '# Content',
        contentHtml: '<h1>Content</h1>',
        category: 'tech',
        tags: [],
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
          id: 'update-test-5',
        },
        body: JSON.stringify({
          contentMarkdown: '',
        }),
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
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('本文');
    });

    it('publishStatusが不正な値の場合は400エラーを返す', async () => {
      // Arrange - 既存記事を作成
      const existingPost = {
        id: 'update-test-6',
        title: '既存タイトル',
        contentMarkdown: '# Content',
        contentHtml: '<h1>Content</h1>',
        category: 'tech',
        tags: [],
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
          id: 'update-test-6',
        },
        body: JSON.stringify({
          publishStatus: 'invalid-status',
        }),
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
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('publishStatus');
    });
  });

  describe('異常系 - 記事不存在', () => {
    it('指定された記事が存在しない場合は404エラーを返す', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          id: 'non-existent-id',
        },
        body: JSON.stringify({
          title: '更新',
        }),
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
