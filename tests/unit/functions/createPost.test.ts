/**
 * createPost Lambda Handler - Unit Tests
 *
 * Requirement R1: 記事作成機能
 * Requirement R2: 下書き保存機能
 * Requirement R12: Markdownサポート機能
 * Requirement R39: テスト駆動開発（TDD）実践
 * Requirement R40: Lambda関数のテストカバレッジを100%にする
 *
 * テストカバレッジ目標: 100% (行、分岐、関数、ステートメント)
 */

import { APIGatewayProxyEvent, Context } from 'aws-lambda';

// テストヘルパーからモックとファクトリをインポート
import {
  mockDynamoDBSend,
  setupDynamoDBMocks,
  resetDynamoDBMocks,
  setupLoggerMock,
  setupTracerMock,
  setupMetricsMock,
  createMockAPIGatewayEvent,
  createMockContext,
} from '../../helpers';

// モックを設定（インポートより前に実行）
setupDynamoDBMocks();
setupLoggerMock();
setupTracerMock();
setupMetricsMock();

// markdownUtilsのモック（プロジェクト固有）
// 実際のmarkdownUtilsと同じ動作をシミュレート
jest.mock('../../../layers/common/nodejs/utils/markdownUtils', () => ({
  markdownToSafeHtml: jest.fn((markdown: string) => {
    return markdown
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');
  }),
}));

// uuidのモック - テストで一貫したIDを使用
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-12345'),
}));

// ハンドラーのインポート（全モックの後）
import { handler, resetDynamoDBClient } from '../../../functions/posts/createPost/handler';

describe('createPost Lambda Handler', () => {
  const mockContext = createMockContext();

  beforeEach(() => {
    // 環境変数をセット
    process.env.TABLE_NAME = 'test-blog-posts-table';

    // DynamoDBクライアントをリセット（キャッシュをクリア）
    resetDynamoDBClient();

    // モックをリセット
    resetDynamoDBMocks();
  });

  afterEach(() => {
    delete process.env.TABLE_NAME;
  });

  describe('正常系 - 記事作成の成功シナリオ', () => {
    it('下書き記事を正常に作成できる', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          title: 'Test Post Title',
          contentMarkdown: '# Hello World\n\nThis is **bold** text.',
          category: 'Technology',
          tags: ['aws', 'serverless'],
          publishStatus: 'draft',
          imageUrls: ['https://example.com/image.jpg'],
        }),
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user-123',
            },
          },
        } as any,
      });

      mockDynamoDBSend.mockResolvedValueOnce({});

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.id).toBeDefined();
      expect(body.title).toBe('Test Post Title');
      expect(body.contentMarkdown).toBe('# Hello World\n\nThis is **bold** text.');
      expect(body.contentHtml).toBeDefined();
      expect(body.category).toBe('Technology');
      expect(body.tags).toEqual(['aws', 'serverless']);
      expect(body.publishStatus).toBe('draft');
      expect(body.authorId).toBe('user-123');
      expect(body.createdAt).toBeDefined();
      expect(body.updatedAt).toBeDefined();
      expect(body.publishedAt).toBeUndefined();
      expect(body.imageUrls).toEqual(['https://example.com/image.jpg']);

      // DynamoDBが正しく呼ばれたことを確認
      expect(mockDynamoDBSend).toHaveBeenCalledTimes(1);
    });

    it('公開記事を正常に作成でき、publishedAtが設定される', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          title: 'Published Post',
          contentMarkdown: 'Content for published post',
          category: 'News',
          publishStatus: 'published',
        }),
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user-456',
            },
          },
        } as any,
      });

      mockDynamoDBSend.mockResolvedValueOnce({});

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.publishStatus).toBe('published');
      expect(body.publishedAt).toBeDefined();
      expect(body.authorId).toBe('user-456');
    });

    it('publishStatusが指定されない場合、デフォルトで下書きになる', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          title: 'Default Draft Post',
          contentMarkdown: 'Content',
          category: 'General',
        }),
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user-789',
            },
          },
        } as any,
      });

      mockDynamoDBSend.mockResolvedValueOnce({});

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.publishStatus).toBe('draft');
      expect(body.publishedAt).toBeUndefined();
    });

    it('tagsとimageUrlsが省略された場合、空配列になる', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          title: 'Minimal Post',
          contentMarkdown: 'Minimal content',
          category: 'Test',
        }),
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user-999',
            },
          },
        } as any,
      });

      mockDynamoDBSend.mockResolvedValueOnce({});

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.tags).toEqual([]);
      expect(body.imageUrls).toEqual([]);
    });

    it('Markdownが正しくHTMLに変換される', async () => {
      // Arrange
      const markdown = '# Heading\n\n**Bold** and *italic*';
      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          title: 'Markdown Test',
          contentMarkdown: markdown,
          category: 'Test',
        }),
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user-111',
            },
          },
        } as any,
      });

      mockDynamoDBSend.mockResolvedValueOnce({});

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.contentHtml).toContain('<h1>');
      expect(body.contentHtml).toContain('<strong>');
      expect(body.contentHtml).toContain('<em>');
    });

    it('前後の空白がトリムされる', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          title: '  Trimmed Title  ',
          contentMarkdown: '  Trimmed Content  ',
          category: '  Trimmed Category  ',
        }),
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user-222',
            },
          },
        } as any,
      });

      mockDynamoDBSend.mockResolvedValueOnce({});

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.title).toBe('Trimmed Title');
      expect(body.contentMarkdown).toBe('Trimmed Content');
      expect(body.category).toBe('Trimmed Category');
    });
  });

  describe('異常系 - バリデーションとエラーハンドリング', () => {
    it('タイトルが空の場合はバリデーションエラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          title: '',
          contentMarkdown: 'Content',
          category: 'test',
        }),
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user-123',
            },
          },
        } as any,
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('title');
    });

    it('本文が空の場合はバリデーションエラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          title: 'Test',
          contentMarkdown: '',
          category: 'test',
        }),
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user-123',
            },
          },
        } as any,
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('contentMarkdown');
    });

    it('カテゴリが空の場合はバリデーションエラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          title: 'Test',
          contentMarkdown: 'Content',
          category: '',
        }),
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user-123',
            },
          },
        } as any,
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('category');
    });

    it('bodyがnullの場合はエラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        body: null,
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user-123',
            },
          },
        } as any,
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toBeDefined();
    });

    it('DynamoDBエラーの場合は500エラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          title: 'Test',
          contentMarkdown: 'Content',
          category: 'test',
        }),
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user-123',
            },
          },
        } as any,
      });

      // DynamoDBエラーをシミュレート
      mockDynamoDBSend.mockRejectedValueOnce(new Error('DynamoDB Error'));

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Internal Server Error');
    });

    it('authorIdが存在しない場合は401エラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          title: 'Test',
          contentMarkdown: 'Content',
          category: 'test',
        }),
        requestContext: {
          authorizer: {
            claims: {},
          },
        } as any,
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Unauthorized');
    });

    it('requestContextが存在しない場合は401エラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          title: 'Test',
          contentMarkdown: 'Content',
          category: 'test',
        }),
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Unauthorized');
    });

    it('JSONパースエラーの場合は500エラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        body: 'invalid json',
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user-123',
            },
          },
        } as any,
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Internal Server Error');
    });
  });
});
