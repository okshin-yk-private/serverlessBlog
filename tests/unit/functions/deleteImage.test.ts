import { APIGatewayProxyEvent, Context } from 'aws-lambda';

// テストヘルパーからモックとファクトリをインポート
import {
  mockS3Send,
  setupS3Mocks,
  resetS3Mocks,
  setupLoggerMock,
  setupTracerMock,
  setupMetricsMock,
  createMockAPIGatewayEvent,
  createMockContext,
} from '../../helpers';

// モックを設定（インポートより前に実行）
setupS3Mocks();
setupLoggerMock();
setupTracerMock();
setupMetricsMock();

// ハンドラーをインポート（モックの後）
import {
  handler,
  resetS3Client,
} from '../../../functions/images/deleteImage/handler';

describe('deleteImage Lambda Handler - Unit Tests', () => {
  const mockContext = createMockContext();

  beforeEach(() => {
    resetS3Mocks();
    resetS3Client();
    process.env.BUCKET_NAME = 'test-bucket';
  });

  afterEach(() => {
    delete process.env.BUCKET_NAME;
  });

  describe('正常系 - 画像削除成功シナリオ', () => {
    it('有効なキーで画像を削除すると204 No Contentを返す', async () => {
      // Arrange
      mockS3Send.mockResolvedValueOnce({});

      const event = createMockAPIGatewayEvent({
        pathParameters: {
          key: 'user-123/abc-def-123.jpg',
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
    });

    it('S3 DeleteObjectCommandが正しいパラメータで呼び出される', async () => {
      // Arrange
      mockS3Send.mockResolvedValueOnce({});

      const event = createMockAPIGatewayEvent({
        pathParameters: {
          key: 'user-123/abc-def-123.jpg',
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
      await handler(event, mockContext);

      // Assert
      expect(mockS3Send).toHaveBeenCalledTimes(1);
      expect(mockS3Send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            Bucket: 'test-bucket',
            Key: 'user-123/abc-def-123.jpg',
          },
        })
      );
    });

    it('URLエンコードされたキーを正しくデコードして削除する', async () => {
      // Arrange
      mockS3Send.mockResolvedValueOnce({});

      const event = createMockAPIGatewayEvent({
        pathParameters: {
          key: 'user-123%2Fabc-def-123.jpg', // URLエンコードされたスラッシュ
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
      expect(mockS3Send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            Bucket: 'test-bucket',
            Key: 'user-123/abc-def-123.jpg',
          },
        })
      );
    });
  });

  describe('異常系 - バリデーションエラー', () => {
    it('キーが指定されていない場合は400エラーを返す', async () => {
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
      expect(body.message).toContain('画像キーが指定されていません');
    });

    it('キーが空文字の場合は400エラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        pathParameters: {
          key: '',
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
      expect(body.message).toContain('画像キーが指定されていません');
    });

    it('パストラバーサル（..）が含まれる場合は400エラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        pathParameters: {
          key: 'user-123/../other-user/image.jpg',
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
      expect(body.message).toContain('不正なキーが指定されました');
    });
  });

  describe('異常系 - 認証エラー', () => {
    it('認証情報がない場合は401エラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        pathParameters: {
          key: 'user-123/abc-def-123.jpg',
        },
        requestContext: {} as any,
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('認証が必要です');
    });

    it('authorizerがない場合は401エラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        pathParameters: {
          key: 'user-123/abc-def-123.jpg',
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

    it('claimsがない場合は401エラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        pathParameters: {
          key: 'user-123/abc-def-123.jpg',
        },
        requestContext: {
          authorizer: {},
        } as any,
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('認証が必要です');
    });

    it('subがない場合は401エラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        pathParameters: {
          key: 'user-123/abc-def-123.jpg',
        },
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
      expect(body.message).toContain('認証が必要です');
    });
  });

  describe('異常系 - 認可エラー', () => {
    it('他ユーザーの画像キーの場合は403エラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        pathParameters: {
          key: 'other-user-456/abc-def-123.jpg',
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
      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('この画像を削除する権限がありません');
    });

    it('キーがユーザーIDで始まらない場合は403エラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        pathParameters: {
          key: 'images/abc-def-123.jpg', // ユーザーIDプレフィックスなし
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
      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('この画像を削除する権限がありません');
    });
  });

  describe('異常系 - サーバー設定エラー', () => {
    it('BUCKET_NAMEが未設定の場合は500エラーを返す', async () => {
      // Arrange
      delete process.env.BUCKET_NAME;

      const event = createMockAPIGatewayEvent({
        pathParameters: {
          key: 'user-123/abc-def-123.jpg',
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
      expect(body.message).toContain('サーバー設定エラーが発生しました');
    });
  });

  describe('異常系 - S3エラー', () => {
    it('S3削除エラーの場合は500エラーを返す', async () => {
      // Arrange
      mockS3Send.mockRejectedValueOnce(new Error('S3 DeleteObject Error'));

      const event = createMockAPIGatewayEvent({
        pathParameters: {
          key: 'user-123/abc-def-123.jpg',
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

  describe('環境設定 - LocalStack/テスト環境', () => {
    it('S3_ENDPOINT環境変数が設定されている場合、カスタムエンドポイントで初期化する', async () => {
      // Arrange
      const originalEndpoint = process.env.S3_ENDPOINT;
      const originalAccessKey = process.env.AWS_ACCESS_KEY_ID;
      const originalSecretKey = process.env.AWS_SECRET_ACCESS_KEY;

      process.env.S3_ENDPOINT = 'http://localhost:4566';
      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';

      resetS3Client();
      mockS3Send.mockResolvedValueOnce({});

      const event = createMockAPIGatewayEvent({
        pathParameters: {
          key: 'user-123/abc-def-123.jpg',
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

      // クリーンアップ
      if (originalEndpoint) {
        process.env.S3_ENDPOINT = originalEndpoint;
      } else {
        delete process.env.S3_ENDPOINT;
      }
      if (originalAccessKey) {
        process.env.AWS_ACCESS_KEY_ID = originalAccessKey;
      } else {
        delete process.env.AWS_ACCESS_KEY_ID;
      }
      if (originalSecretKey) {
        process.env.AWS_SECRET_ACCESS_KEY = originalSecretKey;
      } else {
        delete process.env.AWS_SECRET_ACCESS_KEY;
      }
      resetS3Client();
    });
  });

  describe('レスポンスヘッダー', () => {
    it('成功時にCORSヘッダーが含まれる', async () => {
      // Arrange
      mockS3Send.mockResolvedValueOnce({});

      const event = createMockAPIGatewayEvent({
        pathParameters: {
          key: 'user-123/abc-def-123.jpg',
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
      expect(result.headers).toBeDefined();
      expect(result.headers!['Access-Control-Allow-Origin']).toBe('*');
      expect(result.headers!['Content-Type']).toBe('application/json');
    });

    it('エラー時にCORSヘッダーが含まれる', async () => {
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
      expect(result.headers).toBeDefined();
      expect(result.headers!['Access-Control-Allow-Origin']).toBe('*');
      expect(result.headers!['Content-Type']).toBe('application/json');
    });
  });
});
