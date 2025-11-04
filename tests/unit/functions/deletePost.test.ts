/**
 * deletePost Lambda Handler - Unit Tests
 *
 * Requirement R5: 記事削除機能
 * - 有効な記事IDでDynamoDBから記事を削除
 * - 記事が存在しない場合は404エラー
 * - 未認証の場合は401エラー
 * - 記事に画像が関連付けられている場合、S3から画像を削除
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
  mockS3Send,
  setupDynamoDBMocks,
  setupS3Mocks,
  resetDynamoDBMocks,
  resetS3Mocks,
  setupLoggerMock,
  setupTracerMock,
  setupMetricsMock,
  createMockAPIGatewayEvent,
  createMockContext,
} from '../../helpers';

// モックを設定（インポートより前に実行）
setupDynamoDBMocks();
setupS3Mocks();
setupLoggerMock();
setupTracerMock();
setupMetricsMock();

// ハンドラーをインポート（モックの後）
import { handler, resetDynamoDBClient, resetS3Client } from '../../../functions/posts/deletePost/handler';

describe('deletePost Lambda Handler', () => {
  const mockContext = createMockContext();

  beforeEach(() => {
    // 環境変数をセット
    process.env.TABLE_NAME = 'test-blog-posts-table';
    process.env.BUCKET_NAME = 'test-blog-images-bucket';

    // クライアントをリセット
    resetDynamoDBClient();
    resetS3Client();

    // モックをリセット
    resetDynamoDBMocks();
    resetS3Mocks();
  });

  afterEach(() => {
    delete process.env.TABLE_NAME;
    delete process.env.BUCKET_NAME;
  });

  describe('正常系 - 記事削除の成功シナリオ', () => {
    it('記事を正常に削除できる（画像なし）', async () => {
      // Arrange
      const existingPost = {
        id: 'post-1',
        title: 'Test Post',
        contentMarkdown: '# Content',
        contentHtml: '<h1>Content</h1>',
        category: 'Tech',
        tags: ['test'],
        publishStatus: 'published',
        authorId: 'user-123',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      mockDynamoDBSend.mockResolvedValueOnce({ Item: existingPost }); // GetCommand
      mockDynamoDBSend.mockResolvedValueOnce({}); // DeleteCommand

      const event = createMockAPIGatewayEvent({
        pathParameters: {
          id: 'post-1',
        },
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
      expect(result.statusCode).toBe(204);
      expect(result.body).toBe('');
      expect(mockDynamoDBSend).toHaveBeenCalledTimes(2); // GetCommand + DeleteCommand
      expect(mockS3Send).not.toHaveBeenCalled(); // 画像がないのでS3は呼ばれない
    });

    it('記事と関連画像を削除できる（imageUrls: 1個）', async () => {
      // Arrange
      const existingPost = {
        id: 'post-2',
        title: 'Post with Image',
        contentMarkdown: '# Content',
        contentHtml: '<h1>Content</h1>',
        category: 'Tech',
        tags: [],
        imageUrls: ['https://example.com/images/photo1.jpg'],
        publishStatus: 'published',
        authorId: 'user-123',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      mockDynamoDBSend.mockResolvedValueOnce({ Item: existingPost }); // GetCommand
      mockS3Send.mockResolvedValueOnce({}); // DeleteObjectsCommand
      mockDynamoDBSend.mockResolvedValueOnce({}); // DeleteCommand

      const event = createMockAPIGatewayEvent({
        pathParameters: {
          id: 'post-2',
        },
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
      expect(result.statusCode).toBe(204);
      expect(result.body).toBe('');
      expect(mockS3Send).toHaveBeenCalledTimes(1); // DeleteObjectsCommand
      expect(mockDynamoDBSend).toHaveBeenCalledTimes(2); // GetCommand + DeleteCommand
    });

    it('記事と複数の関連画像を削除できる（imageUrls: 複数個）', async () => {
      // Arrange
      const existingPost = {
        id: 'post-3',
        title: 'Post with Multiple Images',
        contentMarkdown: '# Content',
        contentHtml: '<h1>Content</h1>',
        category: 'Tech',
        tags: [],
        imageUrls: [
          'https://example.com/images/photo1.jpg',
          'https://example.com/images/photo2.png',
          'https://example.com/images/photo3.gif',
        ],
        publishStatus: 'published',
        authorId: 'user-123',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      mockDynamoDBSend.mockResolvedValueOnce({ Item: existingPost }); // GetCommand
      mockS3Send.mockResolvedValueOnce({}); // DeleteObjectsCommand
      mockDynamoDBSend.mockResolvedValueOnce({}); // DeleteCommand

      const event = createMockAPIGatewayEvent({
        pathParameters: {
          id: 'post-3',
        },
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
      expect(result.statusCode).toBe(204);
      expect(result.body).toBe('');
      expect(mockS3Send).toHaveBeenCalledTimes(1); // DeleteObjectsCommand (バッチ削除)
      expect(mockDynamoDBSend).toHaveBeenCalledTimes(2); // GetCommand + DeleteCommand
    });

    it('空のimageUrls配列の場合、S3削除は呼ばれない', async () => {
      // Arrange
      const existingPost = {
        id: 'post-4',
        title: 'Post with Empty Images Array',
        contentMarkdown: '# Content',
        contentHtml: '<h1>Content</h1>',
        category: 'Tech',
        tags: [],
        imageUrls: [],
        publishStatus: 'published',
        authorId: 'user-123',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      mockDynamoDBSend.mockResolvedValueOnce({ Item: existingPost }); // GetCommand
      mockDynamoDBSend.mockResolvedValueOnce({}); // DeleteCommand

      const event = createMockAPIGatewayEvent({
        pathParameters: {
          id: 'post-4',
        },
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
      expect(result.statusCode).toBe(204);
      expect(result.body).toBe('');
      expect(mockS3Send).not.toHaveBeenCalled();
      expect(mockDynamoDBSend).toHaveBeenCalledTimes(2);
    });
  });

  describe('異常系 - バリデーション', () => {
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

    it('記事IDが空文字の場合は400エラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        pathParameters: {
          id: '',
        },
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
  });

  describe('異常系 - 認証エラー', () => {
    it('認証情報がない場合は401エラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        pathParameters: {
          id: 'test-id',
        },
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
      mockDynamoDBSend.mockResolvedValueOnce({ Item: undefined }); // GetCommand

      const event = createMockAPIGatewayEvent({
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

    it('DynamoDB DeleteItemエラーの場合は500エラーを返す', async () => {
      // Arrange
      const existingPost = {
        id: 'test-id',
        title: 'Test',
        contentMarkdown: '# Content',
        contentHtml: '<h1>Content</h1>',
        category: 'test',
        tags: [],
        publishStatus: 'draft',
        authorId: 'user-123',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      mockDynamoDBSend.mockResolvedValueOnce({ Item: existingPost }); // GetCommand
      mockDynamoDBSend.mockRejectedValueOnce(new Error('DynamoDB DeleteItem Error')); // DeleteCommand

      const event = createMockAPIGatewayEvent({
        pathParameters: {
          id: 'test-id',
        },
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

  describe('異常系 - S3エラー', () => {
    it('S3 DeleteObjectsエラーの場合は500エラーを返す', async () => {
      // Arrange
      const existingPost = {
        id: 'test-id',
        title: 'Test',
        contentMarkdown: '# Content',
        contentHtml: '<h1>Content</h1>',
        category: 'test',
        tags: [],
        imageUrls: ['https://example.com/images/photo.jpg'],
        publishStatus: 'draft',
        authorId: 'user-123',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      mockDynamoDBSend.mockResolvedValueOnce({ Item: existingPost }); // GetCommand
      mockS3Send.mockRejectedValueOnce(new Error('S3 DeleteObjects Error')); // DeleteObjectsCommand

      const event = createMockAPIGatewayEvent({
        pathParameters: {
          id: 'test-id',
        },
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
