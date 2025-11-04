/**
 * logout Lambda Handler Tests
 * Requirement R14: セッション管理機能 - ログアウトとセッション無効化
 * Requirement R39: TDD実践
 * Requirement R40: Lambda関数テストカバレッジ100%
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
  GlobalSignOutCommand: class GlobalSignOutCommand {
    constructor(public input: any) {}
  },
}));

// モックを設定
setupLoggerMock();
setupTracerMock();
setupMetricsMock();

// 環境変数を事前に設定（handler.tsのインポート前）
process.env.AWS_REGION = 'ap-northeast-1';

// ハンドラーをインポート（モックと環境変数の設定後）
import { handler, resetCognitoClient } from '../../../functions/auth/logout/handler';

describe('logout Lambda Handler', () => {
  const mockContext = createMockContext();

  beforeEach(() => {
    process.env.AWS_REGION = 'ap-northeast-1';
    resetCognitoClient();
    mockCognitoSend.mockReset();
    mockCognitoSend.mockResolvedValue({});
  });

  describe('正常系 - ログアウト成功シナリオ', () => {
    it('有効なアクセストークンでログアウトできる', async () => {
      // Arrange
      mockCognitoSend.mockResolvedValueOnce({});

      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          accessToken: 'valid-access-token',
        }),
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('ログアウトしました');
    });

    it('ログアウト成功時にCognitoに正しいパラメータでリクエストを送信する', async () => {
      // Arrange
      mockCognitoSend.mockResolvedValueOnce({});

      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          accessToken: 'valid-access-token',
        }),
      });

      // Act
      await handler(event, mockContext);

      // Assert
      expect(mockCognitoSend).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            AccessToken: 'valid-access-token',
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
        body: 'invalid-json{',
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('リクエストボディが不正です');
    });

    it('accessTokenが指定されていない場合は400エラーを返す', async () => {
      // Arrange
      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({}),
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('アクセストークンが必要です');
    });
  });

  describe('異常系 - 認証エラー', () => {
    it('アクセストークンが無効な場合は401エラーを返す（NotAuthorizedException）', async () => {
      // Arrange
      const cognitoError = new Error('Invalid Access Token');
      (cognitoError as any).name = 'NotAuthorizedException';

      mockCognitoSend.mockRejectedValueOnce(cognitoError);

      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          accessToken: 'invalid-access-token',
        }),
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('アクセストークンが無効または期限切れです');
    });

    it('アクセストークンの有効期限が切れている場合は401エラーを返す', async () => {
      // Arrange
      const cognitoError = new Error('Access Token has expired');
      (cognitoError as any).name = 'NotAuthorizedException';

      mockCognitoSend.mockRejectedValueOnce(cognitoError);

      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          accessToken: 'expired-access-token',
        }),
      });

      // Act
      const result = await handler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('アクセストークンが無効または期限切れです');
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
          accessToken: 'valid-access-token',
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
          accessToken: 'valid-access-token',
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

      mockCognitoSend.mockResolvedValueOnce({});

      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          accessToken: 'valid-access-token',
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

      mockCognitoSend.mockResolvedValueOnce({});

      const event = createMockAPIGatewayEvent({
        body: JSON.stringify({
          accessToken: 'valid-access-token',
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
      if (originalSecretKey) process.env.AWS_SECRET_ACCESS_KEY = originalSecretKey;
      resetCognitoClient();
    });
  });
});
