/**
 * getPost Lambda Handler - Unit Tests
 *
 * Requirement R7: 記事詳細取得機能
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
jest.mock('../../../layers/common/nodejs/utils/markdownUtils', () => ({
  markdownToSafeHtml: jest.fn((markdown: string) => {
    return markdown
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');
  }),
}));

// ハンドラーをインポート（モックの後）
import { handler, resetDynamoDBClient } from '../../../functions/posts/getPost/handler';

describe('getPost Lambda Handler', () => {
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

  describe('正常系 - 記事取得の成功シナリオ', () => {
    it('公開記事を正常に取得できる（認証なし）', async () => {
      // Arrange
      const postId = 'test-post-123';
      const event = createMockAPIGatewayEvent({
        pathParameters: {
          id: postId,
        },
      });

      const mockPost = {
        id: postId,
        title: 'Test Published Post',
        contentMarkdown: '# Hello World\n\nThis is **published** content.',
        contentHtml: '<h1>Hello World</h1>\n\n<p>This is <strong>published</strong> content.</p>',
        category: 'Technology',
        tags: ['aws', 'serverless'],
        publishStatus: 'published',
        authorId: 'user-123',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        publishedAt: '2025-01-01T00:00:00.000Z',
        imageUrls: [],
      };

      mockDynamoDBSend.mockResolvedValueOnce({
        Item: mockPost,
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.id).toBe(postId);
      expect(body.title).toBe('Test Published Post');
      expect(body.contentMarkdown).toBe('# Hello World\n\nThis is **published** content.');
      expect(body.contentHtml).toBeDefined();
      expect(body.publishStatus).toBe('published');
      expect(body.publishedAt).toBeDefined();

      // DynamoDBが正しく呼ばれたことを確認
      expect(mockDynamoDBSend).toHaveBeenCalledTimes(1);
    });

    it('下書き記事を管理者（認証済み）が取得できる', async () => {
      // Arrange
      const postId = 'test-draft-456';
      const event = createMockAPIGatewayEvent({
        pathParameters: {
          id: postId,
        },
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user-456',
            },
          },
        } as any,
      });

      const mockPost = {
        id: postId,
        title: 'Test Draft Post',
        contentMarkdown: 'Draft content',
        contentHtml: '<p>Draft content</p>',
        category: 'General',
        tags: [],
        publishStatus: 'draft',
        authorId: 'user-456',
        createdAt: '2025-01-02T00:00:00.000Z',
        updatedAt: '2025-01-02T00:00:00.000Z',
        imageUrls: [],
      };

      mockDynamoDBSend.mockResolvedValueOnce({
        Item: mockPost,
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.id).toBe(postId);
      expect(body.publishStatus).toBe('draft');
      expect(body.publishedAt).toBeUndefined();
    });

    it('MarkdownコンテンツがHTML形式に変換されて返される', async () => {
      // Arrange
      const postId = 'test-markdown-789';
      const event = createMockAPIGatewayEvent({
        pathParameters: {
          id: postId,
        },
      });

      const mockPost = {
        id: postId,
        title: 'Markdown Test',
        contentMarkdown: '# Heading\n\n**Bold** and *italic*',
        contentHtml: '<h1>Heading</h1>\n\n<p><strong>Bold</strong> and <em>italic</em></p>',
        category: 'Test',
        tags: [],
        publishStatus: 'published',
        authorId: 'user-789',
        createdAt: '2025-01-03T00:00:00.000Z',
        updatedAt: '2025-01-03T00:00:00.000Z',
        publishedAt: '2025-01-03T00:00:00.000Z',
        imageUrls: [],
      };

      mockDynamoDBSend.mockResolvedValueOnce({
        Item: mockPost,
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.contentHtml).toContain('<h1>');
      expect(body.contentHtml).toContain('<strong>');
      expect(body.contentHtml).toContain('<em>');
    });

    it('画像URLが含まれる記事を取得できる', async () => {
      // Arrange
      const postId = 'test-images-999';
      const event = createMockAPIGatewayEvent({
        pathParameters: {
          id: postId,
        },
      });

      const mockPost = {
        id: postId,
        title: 'Post with Images',
        contentMarkdown: 'Content',
        contentHtml: '<p>Content</p>',
        category: 'Photography',
        tags: ['images'],
        publishStatus: 'published',
        authorId: 'user-999',
        createdAt: '2025-01-04T00:00:00.000Z',
        updatedAt: '2025-01-04T00:00:00.000Z',
        publishedAt: '2025-01-04T00:00:00.000Z',
        imageUrls: ['https://example.com/image1.jpg', 'https://example.com/image2.jpg'],
      };

      mockDynamoDBSend.mockResolvedValueOnce({
        Item: mockPost,
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.imageUrls).toHaveLength(2);
      expect(body.imageUrls).toContain('https://example.com/image1.jpg');
    });
  });

  describe('異常系 - エラーハンドリングとアクセス制御', () => {
    it('存在しない記事IDの場合は404エラーを返す', async () => {
      // Arrange
      const postId = 'non-existent-id';
      const event = createMockAPIGatewayEvent({
        pathParameters: {
          id: postId,
        },
      });

      mockDynamoDBSend.mockResolvedValueOnce({
        Item: undefined,
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('記事が見つかりません');
    });

    it('下書き記事を未認証ユーザーが取得しようとすると404エラーを返す', async () => {
      // Arrange
      const postId = 'test-draft-secret';
      const event = createMockAPIGatewayEvent({
        pathParameters: {
          id: postId,
        },
      });

      const mockPost = {
        id: postId,
        title: 'Secret Draft',
        contentMarkdown: 'Secret content',
        contentHtml: '<p>Secret content</p>',
        category: 'Secret',
        tags: [],
        publishStatus: 'draft',
        authorId: 'user-secret',
        createdAt: '2025-01-05T00:00:00.000Z',
        updatedAt: '2025-01-05T00:00:00.000Z',
        imageUrls: [],
      };

      mockDynamoDBSend.mockResolvedValueOnce({
        Item: mockPost,
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('記事が見つかりません');
    });

    it('記事IDが指定されていない場合は400エラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        pathParameters: null,
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
      expect(body.message).toContain('記事IDが指定されていません');
    });

    it('記事IDが空文字列の場合は400エラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        pathParameters: {
          id: '',
        },
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('記事IDが指定されていません');
    });

    it('DynamoDBエラーの場合は500エラーを返す', async () => {
      // Arrange
      const postId = 'test-error-123';
      const event = createMockAPIGatewayEvent({
        pathParameters: {
          id: postId,
        },
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user-123',
            },
          },
        } as any,
      });

      // DynamoDBエラーをシミュレート
      mockDynamoDBSend.mockRejectedValueOnce(new Error('DynamoDB GetItem Error'));

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('サーバーエラーが発生しました');
    });

    it('pathParametersが存在しない場合は400エラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        pathParameters: undefined,
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('記事IDが指定されていません');
    });

    it('認証情報があるが記事が存在しない場合は404エラーを返す', async () => {
      // Arrange
      const postId = 'non-existent-auth';
      const event = createMockAPIGatewayEvent({
        pathParameters: {
          id: postId,
        },
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user-auth',
            },
          },
        } as any,
      });

      mockDynamoDBSend.mockResolvedValueOnce({
        Item: undefined,
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('記事が見つかりません');
    });
  });
});
