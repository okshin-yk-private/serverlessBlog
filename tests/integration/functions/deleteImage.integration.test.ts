import { Context } from 'aws-lambda';

const BUCKET_NAME = 'test-image-bucket';

// Mock S3 send function
const mockS3Send = jest.fn();

// Mock S3Client
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: mockS3Send,
  })),
  DeleteObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
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

// Type alias to avoid version mismatch with @types/aws-lambda
type APIGatewayProxyEvent = Parameters<
  typeof import('../../../functions/images/deleteImage/handler').handler
>[0];

// ハンドラーをインポート（モックの後）
import {
  handler,
  resetS3Client,
} from '../../../functions/images/deleteImage/handler';

describe('deleteImage Lambda Handler - Integration Tests', () => {
  const mockContext = {} as Context;

  beforeEach(() => {
    // S3クライアントをリセット
    resetS3Client();
    mockS3Send.mockReset();
    process.env.BUCKET_NAME = BUCKET_NAME;
  });

  afterEach(() => {
    delete process.env.BUCKET_NAME;
  });

  describe('正常系 - 画像削除成功', () => {
    it('認証済みユーザーが自分の画像を削除できる', async () => {
      // Arrange
      mockS3Send.mockResolvedValueOnce({});

      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          key: 'user-123/test-image.jpg',
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
      expect(result.statusCode).toBe(204);
      expect(result.body).toBe('');

      // S3 DeleteObjectCommandが呼ばれたことを確認
      expect(mockS3Send).toHaveBeenCalledTimes(1);
      expect(mockS3Send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            Bucket: BUCKET_NAME,
            Key: 'user-123/test-image.jpg',
          },
        })
      );
    });

    it('URLエンコードされたキーを正しくデコードして削除できる', async () => {
      // Arrange
      mockS3Send.mockResolvedValueOnce({});

      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          key: 'user-123%2Fimage%20with%20spaces.jpg',
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
      expect(result.statusCode).toBe(204);
      expect(mockS3Send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Key: 'user-123/image with spaces.jpg',
          }),
        })
      );
    });

    it('サブディレクトリ内の画像を削除できる', async () => {
      // Arrange
      mockS3Send.mockResolvedValueOnce({});

      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          key: 'user-456/2024/01/photo.png',
        },
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user-456',
            },
          },
        } as any,
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(204);
      expect(mockS3Send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            Key: 'user-456/2024/01/photo.png',
          }),
        })
      );
    });
  });

  describe('異常系 - 認証エラー', () => {
    it('認証情報がない場合は401エラーを返す', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          key: 'user-123/test-image.jpg',
        },
        requestContext: {
          authorizer: {
            claims: {},
          },
        } as any,
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('認証');

      // S3は呼ばれないことを確認
      expect(mockS3Send).not.toHaveBeenCalled();
    });

    it('authorizerがない場合は401エラーを返す', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          key: 'user-123/test-image.jpg',
        },
        requestContext: {} as any,
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(401);
    });
  });

  describe('異常系 - 認可エラー', () => {
    it('他ユーザーの画像を削除しようとすると403エラーを返す', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          key: 'other-user-999/stolen-image.jpg',
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
      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('権限');

      // S3は呼ばれないことを確認
      expect(mockS3Send).not.toHaveBeenCalled();
    });

    it('ユーザーIDプレフィックスがないキーは403エラーを返す', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          key: 'public/shared-image.jpg',
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
      expect(result.statusCode).toBe(403);
    });
  });

  describe('異常系 - バリデーションエラー', () => {
    it('キーが指定されていない場合は400エラーを返す', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: null,
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
      expect(body.message).toContain('キー');
    });

    it('パストラバーサル攻撃を検出して400エラーを返す', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          key: 'user-123/../admin-user/secret.jpg',
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
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('不正');

      // S3は呼ばれないことを確認
      expect(mockS3Send).not.toHaveBeenCalled();
    });
  });

  describe('異常系 - サーバーエラー', () => {
    it('S3削除エラーの場合は500エラーを返す', async () => {
      // Arrange
      mockS3Send.mockRejectedValueOnce(new Error('S3 Service Error'));

      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          key: 'user-123/test-image.jpg',
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
      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('サーバーエラー');
    });

    it('BUCKET_NAMEが未設定の場合は500エラーを返す', async () => {
      // Arrange
      delete process.env.BUCKET_NAME;

      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          key: 'user-123/test-image.jpg',
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
      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('サーバー設定');
    });
  });

  describe('レスポンスヘッダー', () => {
    it('成功時にCORSヘッダーが含まれる', async () => {
      // Arrange
      mockS3Send.mockResolvedValueOnce({});

      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: {
          key: 'user-123/test-image.jpg',
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
      expect(result.headers).toBeDefined();
      expect(result.headers!['Access-Control-Allow-Origin']).toBe('*');
      expect(result.headers!['Content-Type']).toBe('application/json');
    });

    it('エラー時にCORSヘッダーが含まれる', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        pathParameters: null,
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
      expect(result.headers!['Access-Control-Allow-Origin']).toBe('*');
    });
  });
});
