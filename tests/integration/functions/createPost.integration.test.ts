import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import {
  DynamoDBClient,
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
} from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

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

const TABLE_NAME = 'test-create-posts-table';

// ハンドラーインポート前に環境変数を設定
process.env.TABLE_NAME = TABLE_NAME;

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

// uuidのモック（テスト可能にするため）
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-12345'),
}));

// ハンドラーをインポート（モックの後）
import {
  handler,
  resetDynamoDBClient,
} from '../../../functions/posts/createPost/handler';

describe('createPost Lambda Handler - Integration Tests', () => {
  const mockContext = {} as Context;

  // テーブル作成
  beforeAll(async () => {
    try {
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
      for (let i = 0; i < 10; i++) {
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
        } catch (error) {
          // テーブルがまだ作成中
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
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
    it('有効な記事データで記事を作成できる', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          title: 'テスト記事',
          contentMarkdown: '# Hello\n\nThis is a test.',
          category: 'technology',
          tags: ['test', 'sample'],
          publishStatus: 'draft',
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
      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.id).toBeDefined();
      expect(body.title).toBe('テスト記事');
      expect(body.contentMarkdown).toBe('# Hello\n\nThis is a test.');
      expect(body.contentHtml).toContain('<h1');
      expect(body.category).toBe('technology');
      expect(body.tags).toEqual(['test', 'sample']);
      expect(body.publishStatus).toBe('draft');
      expect(body.authorId).toBe('user-123');
      expect(body.createdAt).toBeDefined();
      expect(body.updatedAt).toBeDefined();

      // DynamoDBに実際に保存されていることを確認
      const getResult = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { id: body.id },
        })
      );

      expect(getResult.Item).toBeDefined();
      expect(getResult.Item?.title).toBe('テスト記事');
    });

    it('タグが指定されない場合は空配列になる', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          title: 'タグなし記事',
          contentMarkdown: 'Content without tags',
          category: 'general',
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
      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.tags).toEqual([]);

      // DynamoDBに実際に保存されていることを確認
      const getResult = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { id: body.id },
        })
      );

      expect(getResult.Item).toBeDefined();
      expect(getResult.Item?.tags).toEqual([]);
    });

    it('publishStatusが指定されない場合はdraftになる', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          title: '公開ステータス未指定',
          contentMarkdown: 'Content',
          category: 'general',
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
      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.publishStatus).toBe('draft');

      // DynamoDBに実際に保存されていることを確認
      const getResult = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { id: body.id },
        })
      );

      expect(getResult.Item).toBeDefined();
      expect(getResult.Item?.publishStatus).toBe('draft');
    });

    it('Markdownが正しくHTMLに変換される', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          title: 'Markdownテスト',
          contentMarkdown:
            '# Heading 1\n\n## Heading 2\n\n**Bold** and *italic*',
          category: 'test',
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
      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.contentHtml).toContain('<h1');
      expect(body.contentHtml).toContain('<h2');
      expect(body.contentHtml).toContain('<strong>');
      expect(body.contentHtml).toContain('<em>');

      // DynamoDBに実際に保存されていることを確認
      const getResult = await docClient.send(
        new GetCommand({
          TableName: TABLE_NAME,
          Key: { id: body.id },
        })
      );

      expect(getResult.Item).toBeDefined();
      expect(getResult.Item?.contentHtml).toContain('<h1');
    });
  });
});
