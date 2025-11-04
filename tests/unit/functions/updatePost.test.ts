/**
 * updatePost Lambda Handler - Unit Tests
 *
 * Requirement R3: 記事公開機能
 * - publishStatusの切り替え (draft ↔ published)
 * - publishedAtの設定
 *
 * Requirement R4: 記事更新機能
 * - 記事コンテンツの更新
 * - updatedAtの自動更新
 * - 認証チェック
 * - 存在しない記事は404エラー
 * - 未認証は401エラー
 *
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
jest.mock('/opt/nodejs/utils/markdownUtils', () => ({
  markdownToSafeHtml: jest.fn((markdown: string) => {
    return markdown
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');
  }),
}));

// ハンドラーをインポート（モックの後）
import { handler, resetDynamoDBClient } from '../../../functions/posts/updatePost/handler';

describe('updatePost Lambda Handler', () => {
  const mockContext = createMockContext();

  beforeEach(() => {
    // 環境変数をセット
    process.env.TABLE_NAME = 'test-blog-posts-table';

    // DynamoDBクライアントをリセット
    resetDynamoDBClient();

    // モックをリセット
    resetDynamoDBMocks();
  });

  afterEach(() => {
    delete process.env.TABLE_NAME;
  });

  describe('正常系 - 記事更新の成功シナリオ', () => {
    it('タイトルのみを更新できる', async () => {
      // Arrange
      const existingPost = {
        id: 'post-1',
        title: 'Old Title',
        contentMarkdown: '# Old Content',
        contentHtml: '<h1>Old Content</h1>',
        category: 'Tech',
        tags: ['aws'],
        publishStatus: 'draft',
        authorId: 'user-123',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      mockDynamoDBSend.mockResolvedValueOnce({ Item: existingPost });
      mockDynamoDBSend.mockResolvedValueOnce({});

      const event = createMockAPIGatewayEvent({
        pathParameters: {
          id: 'post-1',
        },
        body: JSON.stringify({
          title: 'New Title',
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
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.title).toBe('New Title');
      expect(body.contentMarkdown).toBe('# Old Content'); // 変更されていない
      expect(body.updatedAt).not.toBe('2024-01-01T00:00:00.000Z'); // updatedAtが更新されている
    });

    it('Markdownコンテンツを更新するとHTMLも自動変換される', async () => {
      // Arrange
      const existingPost = {
        id: 'post-2',
        title: 'Title',
        contentMarkdown: '# Old Content',
        contentHtml: '<h1>Old Content</h1>',
        category: 'Tech',
        tags: [],
        publishStatus: 'draft',
        authorId: 'user-123',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      mockDynamoDBSend.mockResolvedValueOnce({ Item: existingPost });
      mockDynamoDBSend.mockResolvedValueOnce({});

      const event = createMockAPIGatewayEvent({
        pathParameters: {
          id: 'post-2',
        },
        body: JSON.stringify({
          contentMarkdown: '# New Content\n## Subtitle',
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
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.contentMarkdown).toBe('# New Content\n## Subtitle');
      expect(body.contentHtml).toContain('<h1>New Content</h1>');
      expect(body.contentHtml).toContain('<h2>Subtitle</h2>');
    });

    it('カテゴリとタグを更新できる', async () => {
      // Arrange
      const existingPost = {
        id: 'post-3',
        title: 'Title',
        contentMarkdown: '# Content',
        contentHtml: '<h1>Content</h1>',
        category: 'Tech',
        tags: ['aws'],
        publishStatus: 'draft',
        authorId: 'user-123',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      mockDynamoDBSend.mockResolvedValueOnce({ Item: existingPost });
      mockDynamoDBSend.mockResolvedValueOnce({});

      const event = createMockAPIGatewayEvent({
        pathParameters: {
          id: 'post-3',
        },
        body: JSON.stringify({
          category: 'DevOps',
          tags: ['docker', 'kubernetes'],
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
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.category).toBe('DevOps');
      expect(body.tags).toEqual(['docker', 'kubernetes']);
    });

    it('下書きを公開状態に更新できる（publishedAtを設定）', async () => {
      // Arrange
      const existingPost = {
        id: 'post-4',
        title: 'Title',
        contentMarkdown: '# Content',
        contentHtml: '<h1>Content</h1>',
        category: 'Tech',
        tags: [],
        publishStatus: 'draft',
        authorId: 'user-123',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      mockDynamoDBSend.mockResolvedValueOnce({ Item: existingPost });
      mockDynamoDBSend.mockResolvedValueOnce({});

      const event = createMockAPIGatewayEvent({
        pathParameters: {
          id: 'post-4',
        },
        body: JSON.stringify({
          publishStatus: 'published',
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
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.publishStatus).toBe('published');
      expect(body.publishedAt).toBeDefined();
      expect(new Date(body.publishedAt).getTime()).toBeGreaterThan(0);
    });

    it('公開記事を下書きに戻せる', async () => {
      // Arrange
      const existingPost = {
        id: 'post-5',
        title: 'Title',
        contentMarkdown: '# Content',
        contentHtml: '<h1>Content</h1>',
        category: 'Tech',
        tags: [],
        publishStatus: 'published',
        publishedAt: '2024-01-15T00:00:00.000Z',
        authorId: 'user-123',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      mockDynamoDBSend.mockResolvedValueOnce({ Item: existingPost });
      mockDynamoDBSend.mockResolvedValueOnce({});

      const event = createMockAPIGatewayEvent({
        pathParameters: {
          id: 'post-5',
        },
        body: JSON.stringify({
          publishStatus: 'draft',
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
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.publishStatus).toBe('draft');
      // publishedAtは保持される（削除されない）
      expect(body.publishedAt).toBe('2024-01-15T00:00:00.000Z');
    });

    it('複数フィールドを同時に更新できる', async () => {
      // Arrange
      const existingPost = {
        id: 'post-6',
        title: 'Old Title',
        contentMarkdown: '# Old Content',
        contentHtml: '<h1>Old Content</h1>',
        category: 'OldCategory',
        tags: ['old'],
        publishStatus: 'draft',
        authorId: 'user-123',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      mockDynamoDBSend.mockResolvedValueOnce({ Item: existingPost });
      mockDynamoDBSend.mockResolvedValueOnce({});

      const event = createMockAPIGatewayEvent({
        pathParameters: {
          id: 'post-6',
        },
        body: JSON.stringify({
          title: 'New Title',
          contentMarkdown: '# New Content',
          category: 'NewCategory',
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
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.title).toBe('New Title');
      expect(body.contentMarkdown).toBe('# New Content');
      expect(body.contentHtml).toContain('<h1>New Content</h1>');
      expect(body.category).toBe('NewCategory');
      expect(body.tags).toEqual(['new', 'updated']);
      expect(body.publishStatus).toBe('published');
      expect(body.publishedAt).toBeDefined();
    });

    it('画像URLを更新できる', async () => {
      // Arrange
      const existingPost = {
        id: 'post-7',
        title: 'Title',
        contentMarkdown: '# Content',
        contentHtml: '<h1>Content</h1>',
        category: 'Tech',
        tags: [],
        imageUrls: ['https://example.com/old.jpg'],
        publishStatus: 'draft',
        authorId: 'user-123',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      mockDynamoDBSend.mockResolvedValueOnce({ Item: existingPost });
      mockDynamoDBSend.mockResolvedValueOnce({});

      const event = createMockAPIGatewayEvent({
        pathParameters: {
          id: 'post-7',
        },
        body: JSON.stringify({
          imageUrls: ['https://example.com/new1.jpg', 'https://example.com/new2.jpg'],
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
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.imageUrls).toEqual(['https://example.com/new1.jpg', 'https://example.com/new2.jpg']);
    });
  });

  describe('異常系 - バリデーション', () => {
    it('記事IDが指定されていない場合は400エラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        pathParameters: null,
        body: JSON.stringify({
          title: 'Test',
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
      expect(body.message).toContain('記事IDが指定されていません');
    });

    it('記事IDが空文字の場合は400エラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        pathParameters: {
          id: '',
        },
        body: JSON.stringify({
          title: 'Test',
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
      expect(body.message).toContain('記事IDが指定されていません');
    });

    it('リクエストボディがない場合は400エラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        pathParameters: {
          id: 'test-id',
        },
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
      expect(body.message).toContain('リクエストボディが必要です');
    });

    it('JSONパースエラーの場合は400エラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        pathParameters: {
          id: 'test-id',
        },
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
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('無効なJSON形式です');
    });
  });

  describe('異常系 - 認証エラー', () => {
    it('認証情報がない場合は401エラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        pathParameters: {
          id: 'test-id',
        },
        body: JSON.stringify({
          title: 'Test',
        }),
        requestContext: {
          authorizer: null,
        } as any,
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('認証が必要です');
    });
  });

  describe('異常系 - 記事が存在しない', () => {
    it('記事が存在しない場合は404エラーを返す', async () => {
      // Arrange
      mockDynamoDBSend.mockResolvedValueOnce({ Item: undefined });

      const event = createMockAPIGatewayEvent({
        pathParameters: {
          id: 'non-existent-id',
        },
        body: JSON.stringify({
          title: 'Test',
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
      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('記事が見つかりません');
    });
  });

  describe('異常系 - DynamoDBエラー', () => {
    it('DynamoDB GetItemエラーの場合は500エラーを返す', async () => {
      // Arrange
      mockDynamoDBSend.mockRejectedValueOnce(new Error('DynamoDB GetItem Error'));

      const event = createMockAPIGatewayEvent({
        pathParameters: {
          id: 'test-id',
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
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('サーバーエラーが発生しました');
    });

    it('DynamoDB PutItemエラーの場合は500エラーを返す', async () => {
      // Arrange
      const existingPost = {
        id: 'test-id',
        title: 'Existing',
        contentMarkdown: '# Content',
        contentHtml: '<h1>Content</h1>',
        category: 'tech',
        tags: [],
        publishStatus: 'draft',
        authorId: 'user-123',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      mockDynamoDBSend.mockResolvedValueOnce({ Item: existingPost });
      mockDynamoDBSend.mockRejectedValueOnce(new Error('DynamoDB PutItem Error'));

      const event = createMockAPIGatewayEvent({
        pathParameters: {
          id: 'test-id',
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
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('サーバーエラーが発生しました');
    });
  });
});
