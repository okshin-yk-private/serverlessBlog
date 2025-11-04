import { APIGatewayProxyEvent, Context } from 'aws-lambda';

const BUCKET_NAME = 'test-image-bucket';

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
import { handler, resetS3Client } from '../../../functions/images/getUploadUrl/handler';

describe('getUploadUrl Lambda Handler - Integration Tests', () => {
  const mockContext = {} as Context;

  beforeEach(() => {
    // S3クライアントをリセット
    resetS3Client();
    process.env.BUCKET_NAME = BUCKET_NAME;
    process.env.CLOUDFRONT_DOMAIN = 'https://d123456.cloudfront.net';
  });

  describe('正常系 - Pre-signed URL生成', () => {
    it('有効なJPEG画像のPre-signed URLを生成できる', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          fileName: 'test-image.jpg',
          contentType: 'image/jpeg',
          fileSize: 1024,
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
      expect(body.uploadUrl).toBeDefined();
      expect(body.uploadUrl).toContain(BUCKET_NAME);
      expect(body.uploadUrl).toContain('images/user-123');
      expect(body.imageUrl).toBeDefined();
      expect(body.imageUrl).toContain('https://d123456.cloudfront.net');
      expect(body.key).toMatch(/^images\/user-123\/\d+_test-image\.jpg$/);
      expect(body.expiresIn).toBe(900); // 15分
    });

    it('有効なPNG画像のPre-signed URLを生成できる', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          fileName: 'screenshot.png',
          contentType: 'image/png',
          fileSize: 2048,
        }),
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
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.uploadUrl).toBeDefined();
      expect(body.key).toMatch(/^images\/user-456\/\d+_screenshot\.png$/);
      expect(body.expiresIn).toBe(900);
    });

    it('有効なGIF画像のPre-signed URLを生成できる', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          fileName: 'animation.gif',
          contentType: 'image/gif',
          fileSize: 512,
        }),
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user-789',
            },
          },
        } as any,
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.uploadUrl).toBeDefined();
      expect(body.key).toMatch(/^images\/user-789\/\d+_animation\.gif$/);
    });

    it('有効なWebP画像のPre-signed URLを生成できる', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          fileName: 'modern-image.webp',
          contentType: 'image/webp',
          fileSize: 768,
        }),
        requestContext: {
          authorizer: {
            claims: {
              sub: 'user-abc',
            },
          },
        } as any,
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.uploadUrl).toBeDefined();
      expect(body.key).toMatch(/^images\/user-abc\/\d+_modern-image\.webp$/);
    });
  });

  describe('異常系 - バリデーションエラー', () => {
    it('許可されていない拡張子（.bmp）の場合は400エラーを返す', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          fileName: 'test.bmp',
          contentType: 'image/bmp',
          fileSize: 1024,
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
      expect(body.message).toContain('許可されていない');
    });

    it('5MBを超えるファイルの場合は400エラーを返す', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          fileName: 'large-image.jpg',
          contentType: 'image/jpeg',
          fileSize: 6 * 1024 * 1024, // 6MB
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
      expect(body.message).toContain('5MB');
    });
  });

  describe('異常系 - 認証エラー', () => {
    it('認証情報がない場合は401エラーを返す', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        body: JSON.stringify({
          fileName: 'test.jpg',
          contentType: 'image/jpeg',
          fileSize: 1024,
        }),
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
    });
  });
});
