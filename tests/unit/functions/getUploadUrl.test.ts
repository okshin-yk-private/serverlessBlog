import { APIGatewayProxyEvent, Context } from 'aws-lambda';

// テストヘルパーからモックとファクトリをインポート
import {
  mockGetSignedUrl,
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
import { handler } from '../../../functions/images/getUploadUrl/handler';

describe('getUploadUrl Lambda Handler - Unit Tests', () => {
  const mockContext = createMockContext();

  beforeEach(() => {
    resetS3Mocks();
    process.env.BUCKET_NAME = 'test-bucket';
    process.env.CLOUDFRONT_DOMAIN = 'https://d123456.cloudfront.net';
  });

  describe('正常系 - Pre-signed URL生成成功シナリオ', () => {
    it('有効なファイル拡張子（jpg）でPre-signed URLを生成できる', async () => {
      // Arrange
      mockGetSignedUrl.mockResolvedValueOnce('https://test-bucket.s3.amazonaws.com/images/user-123/123_test.jpg?X-Amz-Signature=xxx');

      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          fileName: 'test-image.jpg',
          contentType: 'image/jpeg',
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
      expect(body.uploadUrl).toContain('https://test-bucket.s3.amazonaws.com');
      expect(body.imageUrl).toBeDefined();
      expect(body.key).toBeDefined();
      expect(body.expiresIn).toBe(900); // 15分 = 900秒
    });

    it('すべての許可拡張子でPre-signed URLを生成できる', async () => {
      // Arrange
      const testCases = [
        { fileName: 'test.jpg', contentType: 'image/jpeg' },
        { fileName: 'test.jpeg', contentType: 'image/jpeg' },
        { fileName: 'test.png', contentType: 'image/png' },
        { fileName: 'test.gif', contentType: 'image/gif' },
        { fileName: 'test.webp', contentType: 'image/webp' },
      ];

      for (const testCase of testCases) {
        mockGetSignedUrl.mockResolvedValueOnce(`https://test-bucket.s3.amazonaws.com/images/user-123/${testCase.fileName}?X-Amz-Signature=xxx`);

        const event = createMockAPIGatewayEvent({
          body: JSON.stringify(testCase),
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
        expect(body.uploadUrl).toBeDefined();
      }
    });

    it('生成されたURLに正しいパラメータが含まれる（15分有効期限、Content-Type）', async () => {
      // Arrange
      mockGetSignedUrl.mockResolvedValueOnce('https://test-bucket.s3.amazonaws.com/images/user-123/123_test.jpg?X-Amz-Signature=xxx');

      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          fileName: 'test-image.jpg',
          contentType: 'image/jpeg',
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
      await handler(event, mockContext);

      // Assert
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(), // S3Client
        expect.objectContaining({
          input: expect.objectContaining({
            Bucket: 'test-bucket',
            ContentType: 'image/jpeg',
          }),
        }),
        { expiresIn: 900 } // 15分 = 900秒
      );
    });
  });

  describe('異常系 - バリデーション', () => {
    it('リクエストボディが指定されていない場合は400エラーを返す', async () => {
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
      expect(body.message).toContain('リクエストボディが必要です');
    });

    it('リクエストボディが不正なJSON形式の場合は500エラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        body: 'invalid-json{',
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
      expect(body.message).toContain('サーバーエラーが発生しました'); // JSON.parseエラーはcatchされる
    });

    it('ファイル名が指定されていない場合は400エラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          contentType: 'image/jpeg',
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
      expect(body.message).toContain('ファイル名');
    });

    it('contentTypeが指定されていない場合は400エラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          fileName: 'test.jpg',
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
      expect(body.message).toContain('Content-Type');
    });

    it('許可されていないファイル拡張子の場合は400エラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          fileName: 'test.txt',
          contentType: 'text/plain',
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
      expect(body.message).toContain('許可されていない');
    });

    it('許可されていないContent-Typeの場合は400エラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          fileName: 'test.jpg',
          contentType: 'application/pdf',
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
      expect(body.message).toContain('許可されていない');
    });

    it('fileSizeが5MBを超える場合は400エラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          fileName: 'test.jpg',
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
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('5MB');
    });
  });

  describe('異常系 - 認証エラー', () => {
    it('未認証（認証情報なし）の場合は401エラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          fileName: 'test-image.jpg',
          contentType: 'image/jpeg',
        }),
        requestContext: {
          // authorizer なし
        } as any,
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('認証が必要です');
    });

    it('認証情報が無効（subなし）の場合は401エラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          fileName: 'test-image.jpg',
          contentType: 'image/jpeg',
        }),
        requestContext: {
          authorizer: {
            claims: {
              // sub なし
            },
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

    it('requestContextがnullの場合は401エラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          fileName: 'test-image.jpg',
          contentType: 'image/jpeg',
        }),
        requestContext: null as any, // 明示的にnullを設定
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('認証が必要です');
    });

    it('requestContextがundefinedの場合は401エラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          fileName: 'test-image.jpg',
          contentType: 'image/jpeg',
        }),
        requestContext: undefined as any, // 明示的にundefinedを設定
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('認証が必要です');
    });
  });

  describe('異常系 - S3エラー', () => {
    it('Pre-signed URL生成エラーの場合は500エラーを返す', async () => {
      // Arrange
      mockGetSignedUrl.mockRejectedValueOnce(new Error('S3 Error'));

      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          fileName: 'test.jpg',
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
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('サーバーエラーが発生しました');
    });

    it('BUCKET_NAMEが未設定の場合は500エラーを返す', async () => {
      // Arrange
      const originalBucketName = process.env.BUCKET_NAME;
      delete process.env.BUCKET_NAME;

      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          fileName: 'test.jpg',
          contentType: 'image/jpeg',
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
      expect(body.message).toContain('サーバー設定エラーが発生しました');

      // クリーンアップ
      if (originalBucketName) process.env.BUCKET_NAME = originalBucketName;
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

      // クライアントをリセットして再作成させる（handler.tsからインポートが必要）
      const { resetS3Client } = await import('../../../functions/images/getUploadUrl/handler');
      resetS3Client();

      mockGetSignedUrl.mockResolvedValueOnce('https://localhost:4566/test-bucket/image.jpg?X-Amz-Signature=xxx');

      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          fileName: 'test-image.jpg',
          contentType: 'image/jpeg',
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

    it('AWS_ACCESS_KEY_IDとAWS_SECRET_ACCESS_KEYが未設定の場合、デフォルト値"test"が使用される', async () => {
      // Arrange
      const originalEndpoint = process.env.S3_ENDPOINT;
      const originalAccessKey = process.env.AWS_ACCESS_KEY_ID;
      const originalSecretKey = process.env.AWS_SECRET_ACCESS_KEY;

      // 環境変数を削除してフォールバックを発生させる
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;
      process.env.S3_ENDPOINT = 'http://localhost:4566'; // カスタムエンドポイント有効化

      const { resetS3Client } = await import('../../../functions/images/getUploadUrl/handler');
      resetS3Client();

      mockGetSignedUrl.mockResolvedValueOnce('https://localhost:4566/test-bucket/image.jpg?X-Amz-Signature=xxx');

      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          fileName: 'test-image.jpg',
          contentType: 'image/jpeg',
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

    it('CLOUDFRONT_DOMAINが未設定の場合、S3の直接URLをimageUrlとして返す', async () => {
      // Arrange
      const originalCloudFront = process.env.CLOUDFRONT_DOMAIN;
      delete process.env.CLOUDFRONT_DOMAIN; // CloudFrontドメインを削除

      mockGetSignedUrl.mockResolvedValueOnce('https://test-bucket.s3.amazonaws.com/images/user-123/123_test.jpg?X-Amz-Signature=xxx');

      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          fileName: 'test-image.jpg',
          contentType: 'image/jpeg',
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

      // S3の直接URLが使用されることを確認
      expect(body.imageUrl).toMatch(/^https:\/\/test-bucket\.s3\.amazonaws\.com\/images\//);
      expect(body.imageUrl).not.toContain('cloudfront.net');

      // クリーンアップ
      if (originalCloudFront) {
        process.env.CLOUDFRONT_DOMAIN = originalCloudFront;
      } else {
        delete process.env.CLOUDFRONT_DOMAIN;
      }
    });
  });
});
