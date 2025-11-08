/**
 * login Lambda Handler - Unit Tests
 *
 * Requirement R13: 管理者ログイン機能
 * - 有効な認証情報でCognito認証を実行
 * - 認証成功時にJWTトークンを返す
 * - 認証失敗時に401エラーを返す
 * - トークン有効期限は1時間
 *
 * Requirement R39: テスト駆動開発（TDD）実践
 * Requirement R40: Lambda関数のテストカバレッジを100%にする
 *
 * テストカバレッジ目標: 100% (行、分岐、関数、ステートメント)
 */

import { APIGatewayProxyEvent, Context } from 'aws-lambda';

// テストヘルパーからモックとファクトリをインポート
import {
  setupLoggerMock,
  setupTracerMock,
  setupMetricsMock,
  createMockAPIGatewayEvent,
  createMockContext,
} from '../../helpers';

// Cognito モックを直接定義
const mockCognitoSend = jest.fn();

jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn().mockImplementation(() => ({
    send: mockCognitoSend,
  })),
  InitiateAuthCommand: class InitiateAuthCommand {
    constructor(public input: any) {}
  },
}));

// モックを設定
setupLoggerMock();
setupTracerMock();
setupMetricsMock();

// 環境変数を事前に設定（handler.tsのインポート前）
process.env.USER_POOL_CLIENT_ID = 'test-client-id';
process.env.AWS_REGION = 'ap-northeast-1';

// ハンドラーをインポート（モックと環境変数の設定後）
import {
  handler,
  resetCognitoClient,
} from '../../../functions/auth/login/handler';

describe('login Lambda Handler', () => {
  const mockContext = createMockContext();

  beforeEach(() => {
    // 環境変数をセット
    process.env.USER_POOL_CLIENT_ID = 'test-client-id';
    process.env.AWS_REGION = 'ap-northeast-1';

    // クライアントをリセット
    resetCognitoClient();

    // モックをリセット
    mockCognitoSend.mockReset();
    mockCognitoSend.mockResolvedValue({});
  });

  afterEach(() => {
    delete process.env.USER_POOL_CLIENT_ID;
    delete process.env.AWS_REGION;
  });

  describe('正常系 - ログイン成功シナリオ', () => {
    it('有効な認証情報でログインに成功し、トークンを返す', async () => {
      // Arrange
      const cognitoResponse = {
        AuthenticationResult: {
          AccessToken: 'mock-access-token',
          RefreshToken: 'mock-refresh-token',
          IdToken: 'mock-id-token',
          ExpiresIn: 3600,
        },
      };

      mockCognitoSend.mockResolvedValueOnce(cognitoResponse); // InitiateAuthCommand

      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          email: 'admin@example.com',
          password: 'SecurePassword123!',
        }),
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.accessToken).toBe('mock-access-token');
      expect(body.refreshToken).toBe('mock-refresh-token');
      expect(body.idToken).toBe('mock-id-token');
      expect(body.expiresIn).toBe(3600);
      expect(mockCognitoSend).toHaveBeenCalledTimes(1);
    });

    it('ログイン成功時にCognitoに正しいパラメータで認証リクエストを送信する', async () => {
      // Arrange
      const cognitoResponse = {
        AuthenticationResult: {
          AccessToken: 'access-token',
          RefreshToken: 'refresh-token',
          IdToken: 'id-token',
          ExpiresIn: 3600,
        },
      };

      mockCognitoSend.mockResolvedValueOnce(cognitoResponse);

      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          email: 'user@example.com',
          password: 'MyPassword456!',
        }),
      });

      // Act
      await handler(event, mockContext);

      // Assert
      expect(mockCognitoSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            AuthFlow: 'USER_PASSWORD_AUTH',
            ClientId: 'test-client-id',
            AuthParameters: {
              USERNAME: 'user@example.com',
              PASSWORD: 'MyPassword456!',
            },
          }),
        })
      );
    });
  });

  describe('異常系 - バリデーション', () => {
    it('リクエストボディが指定されていない場合は400エラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        body: null,
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('リクエストボディが必要です');
    });

    it('リクエストボディが不正なJSON形式の場合は400エラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        body: 'invalid json',
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('リクエストボディが不正です');
    });

    it('emailが指定されていない場合は400エラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          password: 'password123',
        }),
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('メールアドレスが必要です');
    });

    it('passwordが指定されていない場合は400エラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          email: 'admin@example.com',
        }),
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('パスワードが必要です');
    });

    it('emailとpassword両方が指定されていない場合は400エラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({}),
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('メールアドレスが必要です');
    });
  });

  describe('異常系 - 認証エラー', () => {
    it('認証情報が誤っている場合は401エラーを返す（NotAuthorizedException）', async () => {
      // Arrange
      const cognitoError = new Error('Incorrect username or password');
      (cognitoError as any).name = 'NotAuthorizedException';

      mockCognitoSend.mockRejectedValueOnce(cognitoError);

      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          email: 'admin@example.com',
          password: 'wrongpassword',
        }),
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.message).toContain(
        'メールアドレスまたはパスワードが正しくありません'
      );
    });

    it('ユーザーが存在しない場合は401エラーを返す（UserNotFoundException）', async () => {
      // Arrange
      const cognitoError = new Error('User does not exist');
      (cognitoError as any).name = 'UserNotFoundException';

      mockCognitoSend.mockRejectedValueOnce(cognitoError);

      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          email: 'nonexistent@example.com',
          password: 'password123',
        }),
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.message).toContain(
        'メールアドレスまたはパスワードが正しくありません'
      );
    });

    it('ユーザーが確認されていない場合は401エラーを返す（UserNotConfirmedException）', async () => {
      // Arrange
      const cognitoError = new Error('User is not confirmed');
      (cognitoError as any).name = 'UserNotConfirmedException';

      mockCognitoSend.mockRejectedValueOnce(cognitoError);

      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          email: 'unconfirmed@example.com',
          password: 'password123',
        }),
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('ユーザーが確認されていません');
    });
  });

  describe('異常系 - Cognitoエラー', () => {
    it('Cognitoエラー（その他のエラー）の場合は500エラーを返す', async () => {
      // Arrange
      const cognitoError = new Error('Internal Cognito Error');
      (cognitoError as any).name = 'InternalErrorException';

      mockCognitoSend.mockRejectedValueOnce(cognitoError);

      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          email: 'admin@example.com',
          password: 'password123',
        }),
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('サーバーエラーが発生しました');
    });

    it('予期しないエラーの場合は500エラーを返す', async () => {
      // Arrange
      const unexpectedError = new Error('Unexpected error');

      mockCognitoSend.mockRejectedValueOnce(unexpectedError);

      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          email: 'admin@example.com',
          password: 'password123',
        }),
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('サーバーエラーが発生しました');
    });
  });

  describe('異常系 - 認証結果なし', () => {
    it('Cognitoが認証結果を返さない場合は500エラーを返す', async () => {
      // Arrange
      mockCognitoSend.mockResolvedValueOnce({
        // AuthenticationResult がない
      });

      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          email: 'admin@example.com',
          password: 'password123',
        }),
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
    it('COGNITO_ENDPOINT環境変数が設定されている場合、カスタムエンドポイントで初期化する', async () => {
      // Arrange
      process.env.COGNITO_ENDPOINT = 'http://localhost:4566';
      process.env.AWS_ACCESS_KEY_ID = 'test-key';
      process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';

      // クライアントをリセットして再作成させる
      resetCognitoClient();

      const cognitoResponse = {
        AuthenticationResult: {
          AccessToken: 'mock-access-token',
          RefreshToken: 'mock-refresh-token',
          IdToken: 'mock-id-token',
          ExpiresIn: 3600,
        },
      };
      mockCognitoSend.mockResolvedValueOnce(cognitoResponse);

      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          email: 'admin@example.com',
          password: 'password123',
        }),
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);

      // クリーンアップ
      delete process.env.COGNITO_ENDPOINT;
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;
      resetCognitoClient();
    });

    it('COGNITO_ENDPOINTが設定されているが一部の環境変数が未設定の場合、デフォルト値を使用する', async () => {
      // Arrange
      const originalRegion = process.env.AWS_REGION;
      const originalAccessKey = process.env.AWS_ACCESS_KEY_ID;
      const originalSecretKey = process.env.AWS_SECRET_ACCESS_KEY;

      process.env.COGNITO_ENDPOINT = 'http://localhost:4566';
      delete process.env.AWS_REGION;
      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;

      // クライアントをリセットして再作成させる
      resetCognitoClient();

      const cognitoResponse = {
        AuthenticationResult: {
          AccessToken: 'mock-access-token',
          RefreshToken: 'mock-refresh-token',
          IdToken: 'mock-id-token',
          ExpiresIn: 3600,
        },
      };
      mockCognitoSend.mockResolvedValueOnce(cognitoResponse);

      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          email: 'admin@example.com',
          password: 'password123',
        }),
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);

      // クリーンアップ
      delete process.env.COGNITO_ENDPOINT;
      if (originalRegion) process.env.AWS_REGION = originalRegion;
      if (originalAccessKey) process.env.AWS_ACCESS_KEY_ID = originalAccessKey;
      if (originalSecretKey)
        process.env.AWS_SECRET_ACCESS_KEY = originalSecretKey;
      resetCognitoClient();
    });

    it('USER_POOL_CLIENT_IDが未設定の場合、空文字列をデフォルト値として使用する', async () => {
      // Arrange
      const originalClientId = process.env.USER_POOL_CLIENT_ID;
      delete process.env.USER_POOL_CLIENT_ID;

      const cognitoResponse = {
        AuthenticationResult: {
          AccessToken: 'mock-access-token',
          RefreshToken: 'mock-refresh-token',
          IdToken: 'mock-id-token',
          ExpiresIn: 3600,
        },
      };
      mockCognitoSend.mockResolvedValueOnce(cognitoResponse);

      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          email: 'admin@example.com',
          password: 'password123',
        }),
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      expect(mockCognitoSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            ClientId: '',
          }),
        })
      );

      // クリーンアップ
      if (originalClientId) process.env.USER_POOL_CLIENT_ID = originalClientId;
    });
  });
});
