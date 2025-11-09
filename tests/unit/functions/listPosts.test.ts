/**
 * listPosts Lambda Handler - Unit Tests
 *
 * Requirement R6: 記事一覧取得機能
 * Requirement R8: カテゴリ別記事一覧機能
 * Requirement R9: タグによる記事検索機能
 * Requirement R18: クエリ最適化
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

// ハンドラーをインポート（モックの後）
import {
  handler,
  resetDynamoDBClient,
} from '../../../functions/posts/listPosts/handler';

describe('listPosts Lambda Handler', () => {
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

  describe('正常系 - 記事一覧取得の成功シナリオ', () => {
    it('公開記事一覧を正常に取得できる（デフォルトパラメータ）', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        queryStringParameters: null,
      });

      const mockPosts = [
        {
          id: 'post-1',
          title: 'Post 1',
          contentMarkdown: 'Content 1',
          contentHtml: '<p>Content 1</p>',
          category: 'Tech',
          tags: ['aws'],
          publishStatus: 'published',
          authorId: 'user-1',
          createdAt: '2025-01-03T00:00:00.000Z',
          updatedAt: '2025-01-03T00:00:00.000Z',
          publishedAt: '2025-01-03T00:00:00.000Z',
        },
        {
          id: 'post-2',
          title: 'Post 2',
          contentMarkdown: 'Content 2',
          contentHtml: '<p>Content 2</p>',
          category: 'Tech',
          tags: ['serverless'],
          publishStatus: 'published',
          authorId: 'user-2',
          createdAt: '2025-01-02T00:00:00.000Z',
          updatedAt: '2025-01-02T00:00:00.000Z',
          publishedAt: '2025-01-02T00:00:00.000Z',
        },
      ];

      mockDynamoDBSend.mockResolvedValueOnce({
        Items: mockPosts,
        Count: 2,
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.items).toHaveLength(2);
      expect(body.count).toBe(2);
      expect(body.nextToken).toBeUndefined();
      // contentMarkdownが除外されていることを確認
      expect(body.items[0].contentMarkdown).toBeUndefined();
      expect(body.items[0].contentHtml).toBeDefined();
    });

    it('limitパラメータを指定して記事一覧を取得できる', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        queryStringParameters: {
          limit: '5',
        },
      });

      mockDynamoDBSend.mockResolvedValueOnce({
        Items: [],
        Count: 0,
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.items).toHaveLength(0);
      expect(mockDynamoDBSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Limit: 5,
          }),
        })
      );
    });

    it('nextTokenを使用してページネーションできる', async () => {
      // Arrange
      const lastEvaluatedKey = {
        id: 'post-10',
        publishStatus: 'published',
        createdAt: '2025-01-01T00:00:00.000Z',
      };
      const nextToken = Buffer.from(JSON.stringify(lastEvaluatedKey)).toString(
        'base64'
      );

      const event = createMockAPIGatewayEvent({
        queryStringParameters: {
          nextToken,
        },
      });

      mockDynamoDBSend.mockResolvedValueOnce({
        Items: [],
        Count: 0,
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      expect(mockDynamoDBSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            ExclusiveStartKey: lastEvaluatedKey,
          }),
        })
      );
    });

    it('LastEvaluatedKeyがある場合、nextTokenを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        queryStringParameters: null,
      });

      const lastEvaluatedKey = {
        id: 'post-20',
        publishStatus: 'published',
        createdAt: '2024-12-01T00:00:00.000Z',
      };

      mockDynamoDBSend.mockResolvedValueOnce({
        Items: [],
        Count: 0,
        LastEvaluatedKey: lastEvaluatedKey,
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.nextToken).toBeDefined();

      // nextTokenをデコードして検証
      const decodedToken = JSON.parse(
        Buffer.from(body.nextToken, 'base64').toString('utf-8')
      );
      expect(decodedToken).toEqual(lastEvaluatedKey);
    });

    it('カテゴリを指定して記事一覧を取得できる', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        queryStringParameters: {
          category: 'Technology',
        },
      });

      const mockPosts = [
        {
          id: 'post-tech-1',
          title: 'Tech Post 1',
          contentHtml: '<p>Tech content</p>',
          category: 'Technology',
          tags: ['tech'],
          publishStatus: 'published',
          authorId: 'user-1',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
          publishedAt: '2025-01-01T00:00:00.000Z',
        },
      ];

      mockDynamoDBSend.mockResolvedValueOnce({
        Items: mockPosts,
        Count: 1,
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.items).toHaveLength(1);
      expect(body.items[0].category).toBe('Technology');

      // CategoryIndexを使用していることを確認
      expect(mockDynamoDBSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            IndexName: 'CategoryIndex',
            KeyConditionExpression: 'category = :category',
          }),
        })
      );
    });

    it('空の結果を返すことができる', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        queryStringParameters: null,
      });

      mockDynamoDBSend.mockResolvedValueOnce({
        Items: [],
        Count: 0,
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.items).toEqual([]);
      expect(body.count).toBe(0);
    });

    it('limitが範囲外の場合デフォルト値を使用する（limit > 100）', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        queryStringParameters: {
          limit: '150',
        },
      });

      mockDynamoDBSend.mockResolvedValueOnce({
        Items: [],
        Count: 0,
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      // デフォルト値（10）が使用されることを確認
      expect(mockDynamoDBSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Limit: 10,
          }),
        })
      );
    });

    it('limitが範囲外の場合デフォルト値を使用する（limit < 1）', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        queryStringParameters: {
          limit: '0',
        },
      });

      mockDynamoDBSend.mockResolvedValueOnce({
        Items: [],
        Count: 0,
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      // デフォルト値（10）が使用されることを確認
      expect(mockDynamoDBSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Limit: 10,
          }),
        })
      );
    });

    it('無効なnextTokenは無視して最初から取得する', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        queryStringParameters: {
          nextToken: 'invalid-token',
        },
      });

      mockDynamoDBSend.mockResolvedValueOnce({
        Items: [],
        Count: 0,
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      // ExclusiveStartKeyが設定されていないことを確認
      expect(mockDynamoDBSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.not.objectContaining({
            ExclusiveStartKey: expect.anything(),
          }),
        })
      );
    });
  });

  describe('異常系 - エラーハンドリング', () => {
    it('DynamoDB Queryエラーの場合は500エラーを返す', async () => {
      // Arrange
      mockDynamoDBSend.mockRejectedValueOnce(new Error('DynamoDB Query Error'));

      const event = createMockAPIGatewayEvent({
        queryStringParameters: null,
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
