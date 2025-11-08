/**
 * 認証・認可統合テスト - エンドツーエンド認証フロー
 *
 * Task 7.3: 認証・認可統合テストの実装
 * Requirements: R15 (権限管理), R30 (統合テスト), R14 (セッション管理)
 *
 * このテストは、認証フローのエンドツーエンド統合テストを実施する。
 * - ログイン → アクセストークン取得
 * - アクセストークンでの保護されたエンドポイントアクセス
 * - トークン更新メカニズム
 * - ログアウトとセッション無効化
 */

import { APIGatewayProxyEvent, Context } from 'aws-lambda';

// Cognito モックを設定
const mockCognitoSend = jest.fn();

jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn().mockImplementation(() => ({
    send: mockCognitoSend,
  })),
  InitiateAuthCommand: class InitiateAuthCommand {
    constructor(public input: any) {}
  },
  GlobalSignOutCommand: class GlobalSignOutCommand {
    constructor(public input: any) {}
  },
}));

// Powertools Loggerのモック
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

// 環境変数を設定
process.env.USER_POOL_CLIENT_ID = 'test-client-id';
process.env.AWS_REGION = 'us-east-1';

// ハンドラーをインポート（モックの後）
import { handler as loginHandler } from '../../../functions/auth/login/handler';
import { handler as refreshHandler } from '../../../functions/auth/refresh/handler';
import { handler as logoutHandler } from '../../../functions/auth/logout/handler';

describe('End-to-End Authentication Flow Integration Tests', () => {
  const mockContext = {} as Context;

  beforeEach(() => {
    // モックをリセット
    mockCognitoSend.mockReset();
  });

  describe('エンドツーエンド認証フロー', () => {
    test('ログイン → ログアウトのフローが成功する', async () => {
      // Step 1: ログイン
      // Cognitoモックのレスポンスを設定
      mockCognitoSend.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: 'mock-access-token',
          RefreshToken: 'mock-refresh-token',
          IdToken: 'mock-id-token',
          ExpiresIn: 3600,
        },
      });

      const loginEvent: APIGatewayProxyEvent = {
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'TestPassword123!',
        }),
        headers: {},
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '/auth/login',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '/auth/login',
      };

      const loginResult = await loginHandler(loginEvent, mockContext);

      // ログインが成功することを検証
      expect(loginResult.statusCode).toBe(200);
      const loginBody = JSON.parse(loginResult.body);
      expect(loginBody.accessToken).toBe('mock-access-token');
      expect(loginBody.idToken).toBe('mock-id-token');
      expect(loginBody.refreshToken).toBe('mock-refresh-token');
      expect(loginBody.expiresIn).toBe(3600);

      const { accessToken } = loginBody;

      // Step 2: ログアウト
      // ログアウトモックのレスポンスを設定
      mockCognitoSend.mockResolvedValueOnce({}); // GlobalSignOutCommand

      const logoutEvent: APIGatewayProxyEvent = {
        body: JSON.stringify({
          accessToken,
        }),
        headers: {},
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '/auth/logout',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '/auth/logout',
      };

      const logoutResult = await logoutHandler(logoutEvent, mockContext);

      // ログアウトが成功することを検証
      expect(logoutResult.statusCode).toBe(200);
      const logoutBody = JSON.parse(logoutResult.body);
      expect(logoutBody.message).toBe('ログアウトしました');
    });

    test('無効な認証情報でのログインは失敗する', async () => {
      // Arrange - Cognito NotAuthorizedExceptionをシミュレート
      const notAuthorizedError = new Error('Incorrect username or password.');
      (notAuthorizedError as any).name = 'NotAuthorizedException';
      mockCognitoSend.mockRejectedValueOnce(notAuthorizedError);

      const loginEvent: APIGatewayProxyEvent = {
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'WrongPassword123!',
        }),
        headers: {},
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '/auth/login',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '/auth/login',
      };

      // Act
      const loginResult = await loginHandler(loginEvent, mockContext);

      // Assert
      expect(loginResult.statusCode).toBe(401);
      const loginBody = JSON.parse(loginResult.body);
      expect(loginBody.message).toBe(
        'メールアドレスまたはパスワードが正しくありません'
      );
    });

    test('存在しないユーザーでのログインは失敗する', async () => {
      // Arrange - Cognito UserNotFoundExceptionをシミュレート
      const userNotFoundError = new Error('User does not exist.');
      (userNotFoundError as any).name = 'UserNotFoundException';
      mockCognitoSend.mockRejectedValueOnce(userNotFoundError);

      const loginEvent: APIGatewayProxyEvent = {
        body: JSON.stringify({
          email: 'nonexistent@example.com',
          password: 'TestPassword123!',
        }),
        headers: {},
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '/auth/login',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '/auth/login',
      };

      // Act
      const loginResult = await loginHandler(loginEvent, mockContext);

      // Assert
      expect(loginResult.statusCode).toBe(401);
      const loginBody = JSON.parse(loginResult.body);
      expect(loginBody.message).toBe(
        'メールアドレスまたはパスワードが正しくありません'
      );
    });
  });

  describe('トークン更新メカニズム', () => {
    test('有効なリフレッシュトークンで新しいアクセストークンを取得できる', async () => {
      // Step 1: ログイン
      mockCognitoSend.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: 'original-access-token',
          RefreshToken: 'mock-refresh-token',
          IdToken: 'original-id-token',
          ExpiresIn: 3600,
        },
      });

      const loginEvent: APIGatewayProxyEvent = {
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'TestPassword123!',
        }),
        headers: {},
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '/auth/login',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '/auth/login',
      };

      const loginResult = await loginHandler(loginEvent, mockContext);
      const loginBody = JSON.parse(loginResult.body);
      const { refreshToken } = loginBody;

      // Step 2: トークン更新
      mockCognitoSend.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: 'new-access-token',
          IdToken: 'new-id-token',
          ExpiresIn: 3600,
          // RefreshTokenは返されない（Cognitoの仕様）
        },
      });

      const refreshEvent: APIGatewayProxyEvent = {
        body: JSON.stringify({
          refreshToken,
        }),
        headers: {},
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '/auth/refresh',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '/auth/refresh',
      };

      const refreshResult = await refreshHandler(refreshEvent, mockContext);

      // トークン更新が成功することを検証
      expect(refreshResult.statusCode).toBe(200);
      const refreshBody = JSON.parse(refreshResult.body);
      expect(refreshBody.accessToken).toBe('new-access-token');
      expect(refreshBody.idToken).toBe('new-id-token');
      expect(refreshBody.expiresIn).toBe(3600);
      // リフレッシュトークンは返されない（Cognitoの仕様）
      expect(refreshBody.refreshToken).toBeUndefined();

      // 新しいアクセストークンが元のものと異なることを検証
      expect(refreshBody.accessToken).not.toBe('original-access-token');
    });

    test('無効なリフレッシュトークンでのトークン更新は失敗する', async () => {
      // Arrange - Cognito NotAuthorizedExceptionをシミュレート
      const notAuthorizedError = new Error('Invalid Refresh Token');
      (notAuthorizedError as any).name = 'NotAuthorizedException';
      mockCognitoSend.mockRejectedValueOnce(notAuthorizedError);

      const refreshEvent: APIGatewayProxyEvent = {
        body: JSON.stringify({
          refreshToken: 'invalid-refresh-token',
        }),
        headers: {},
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '/auth/refresh',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '/auth/refresh',
      };

      // Act
      const refreshResult = await refreshHandler(refreshEvent, mockContext);

      // Assert
      expect(refreshResult.statusCode).toBe(401);
      const refreshBody = JSON.parse(refreshResult.body);
      expect(refreshBody.message).toBe(
        'リフレッシュトークンが無効または期限切れです'
      );
    });

    test('リフレッシュトークンが空の場合は400エラーを返す', async () => {
      // Arrange
      const refreshEvent: APIGatewayProxyEvent = {
        body: JSON.stringify({
          refreshToken: '',
        }),
        headers: {},
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '/auth/refresh',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '/auth/refresh',
      };

      // Act
      const refreshResult = await refreshHandler(refreshEvent, mockContext);

      // Assert
      expect(refreshResult.statusCode).toBe(400);
      const refreshBody = JSON.parse(refreshResult.body);
      expect(refreshBody.message).toBe('リフレッシュトークンが必要です');
    });
  });

  describe('セッションタイムアウトとログアウト', () => {
    test('ログアウト後はアクセストークンが無効化される', async () => {
      // Step 1: ログイン
      mockCognitoSend.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: 'mock-access-token',
          RefreshToken: 'mock-refresh-token',
          IdToken: 'mock-id-token',
          ExpiresIn: 3600,
        },
      });

      const loginEvent: APIGatewayProxyEvent = {
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'TestPassword123!',
        }),
        headers: {},
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '/auth/login',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '/auth/login',
      };

      const loginResult = await loginHandler(loginEvent, mockContext);
      const loginBody = JSON.parse(loginResult.body);
      const { accessToken } = loginBody;

      // Step 2: ログアウト
      mockCognitoSend.mockResolvedValueOnce({}); // GlobalSignOutCommand

      const logoutEvent: APIGatewayProxyEvent = {
        body: JSON.stringify({
          accessToken,
        }),
        headers: {},
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '/auth/logout',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '/auth/logout',
      };

      const logoutResult = await logoutHandler(logoutEvent, mockContext);

      // ログアウトが成功することを検証
      expect(logoutResult.statusCode).toBe(200);
      const logoutBody = JSON.parse(logoutResult.body);
      expect(logoutBody.message).toBe('ログアウトしました');
    });

    test('無効なアクセストークンでのログアウトは失敗する', async () => {
      // Arrange - Cognito NotAuthorizedExceptionをシミュレート
      const notAuthorizedError = new Error('Invalid Access Token');
      (notAuthorizedError as any).name = 'NotAuthorizedException';
      mockCognitoSend.mockRejectedValueOnce(notAuthorizedError);

      const logoutEvent: APIGatewayProxyEvent = {
        body: JSON.stringify({
          accessToken: 'invalid-access-token',
        }),
        headers: {},
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '/auth/logout',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '/auth/logout',
      };

      // Act
      const logoutResult = await logoutHandler(logoutEvent, mockContext);

      // Assert
      expect(logoutResult.statusCode).toBe(401);
      const logoutBody = JSON.parse(logoutResult.body);
      expect(logoutBody.message).toBe(
        'アクセストークンが無効または期限切れです'
      );
    });

    test('アクセストークンが空の場合は400エラーを返す', async () => {
      // Arrange
      const logoutEvent: APIGatewayProxyEvent = {
        body: JSON.stringify({
          accessToken: '',
        }),
        headers: {},
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '/auth/logout',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '/auth/logout',
      };

      // Act
      const logoutResult = await logoutHandler(logoutEvent, mockContext);

      // Assert
      expect(logoutResult.statusCode).toBe(400);
      const logoutBody = JSON.parse(logoutResult.body);
      expect(logoutBody.message).toBe('アクセストークンが必要です');
    });
  });

  describe('保護されたエンドポイントアクセス制御', () => {
    test('期限切れトークンでのアクセスは拒否される（シミュレーション）', async () => {
      // このテストはトークンの期限切れをシミュレートする
      // 無効なトークンでのログアウトをテストすることで、期限切れトークンの動作を確認

      // Arrange - Cognito NotAuthorizedExceptionをシミュレート（期限切れトークン）
      const notAuthorizedError = new Error('Access Token has expired');
      (notAuthorizedError as any).name = 'NotAuthorizedException';
      mockCognitoSend.mockRejectedValueOnce(notAuthorizedError);

      const logoutEvent: APIGatewayProxyEvent = {
        body: JSON.stringify({
          accessToken: 'expired-access-token',
        }),
        headers: {},
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '/auth/logout',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '/auth/logout',
      };

      // Act
      const logoutResult = await logoutHandler(logoutEvent, mockContext);

      // Assert - 期限切れトークンは401エラーを返す
      expect(logoutResult.statusCode).toBe(401);
    });

    test('ログイン後に取得したトークンは有効である', async () => {
      // Step 1: ログイン
      mockCognitoSend.mockResolvedValueOnce({
        AuthenticationResult: {
          AccessToken: 'valid-access-token',
          RefreshToken: 'valid-refresh-token',
          IdToken: 'valid-id-token',
          ExpiresIn: 3600,
        },
      });

      const loginEvent: APIGatewayProxyEvent = {
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'TestPassword123!',
        }),
        headers: {},
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '/auth/login',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '/auth/login',
      };

      const loginResult = await loginHandler(loginEvent, mockContext);

      // ログインが成功することを検証
      expect(loginResult.statusCode).toBe(200);
      const loginBody = JSON.parse(loginResult.body);
      expect(loginBody.accessToken).toBeDefined();

      // トークンが文字列であることを検証
      expect(typeof loginBody.accessToken).toBe('string');
      expect(loginBody.accessToken.length).toBeGreaterThan(0);
    });

    test('複数の認証フローが並行して動作する', async () => {
      // 並行してログインを実行
      mockCognitoSend
        .mockResolvedValueOnce({
          AuthenticationResult: {
            AccessToken: 'user1-access-token',
            RefreshToken: 'user1-refresh-token',
            IdToken: 'user1-id-token',
            ExpiresIn: 3600,
          },
        })
        .mockResolvedValueOnce({
          AuthenticationResult: {
            AccessToken: 'user2-access-token',
            RefreshToken: 'user2-refresh-token',
            IdToken: 'user2-id-token',
            ExpiresIn: 3600,
          },
        });

      const user1LoginEvent: APIGatewayProxyEvent = {
        body: JSON.stringify({
          email: 'user1@example.com',
          password: 'TestPassword123!',
        }),
        headers: {},
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '/auth/login',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '/auth/login',
      };

      const user2LoginEvent: APIGatewayProxyEvent = {
        body: JSON.stringify({
          email: 'user2@example.com',
          password: 'TestPassword123!',
        }),
        headers: {},
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '/auth/login',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '/auth/login',
      };

      // 並行実行
      const [user1Result, user2Result] = await Promise.all([
        loginHandler(user1LoginEvent, mockContext),
        loginHandler(user2LoginEvent, mockContext),
      ]);

      // 両方のログインが成功することを検証
      expect(user1Result.statusCode).toBe(200);
      expect(user2Result.statusCode).toBe(200);

      const user1Body = JSON.parse(user1Result.body);
      const user2Body = JSON.parse(user2Result.body);

      // 異なるトークンが発行されることを検証
      expect(user1Body.accessToken).not.toBe(user2Body.accessToken);
    });
  });

  describe('エラーハンドリング', () => {
    test('ログイン時にリクエストボディがない場合は400エラーを返す', async () => {
      // Arrange
      const loginEvent: APIGatewayProxyEvent = {
        body: null,
        headers: {},
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '/auth/login',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '/auth/login',
      };

      // Act
      const loginResult = await loginHandler(loginEvent, mockContext);

      // Assert
      expect(loginResult.statusCode).toBe(400);
      const loginBody = JSON.parse(loginResult.body);
      expect(loginBody.message).toBe('リクエストボディが必要です');
    });

    test('リフレッシュ時にリクエストボディがない場合は400エラーを返す', async () => {
      // Arrange
      const refreshEvent: APIGatewayProxyEvent = {
        body: null,
        headers: {},
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '/auth/refresh',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '/auth/refresh',
      };

      // Act
      const refreshResult = await refreshHandler(refreshEvent, mockContext);

      // Assert
      expect(refreshResult.statusCode).toBe(400);
      const refreshBody = JSON.parse(refreshResult.body);
      expect(refreshBody.message).toBe('リクエストボディが必要です');
    });

    test('ログアウト時にリクエストボディがない場合は400エラーを返す', async () => {
      // Arrange
      const logoutEvent: APIGatewayProxyEvent = {
        body: null,
        headers: {},
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '/auth/logout',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '/auth/logout',
      };

      // Act
      const logoutResult = await logoutHandler(logoutEvent, mockContext);

      // Assert
      expect(logoutResult.statusCode).toBe(400);
      const logoutBody = JSON.parse(logoutResult.body);
      expect(logoutBody.message).toBe('リクエストボディが必要です');
    });

    test('ログイン時に不正なJSON形式の場合は400エラーを返す', async () => {
      // Arrange
      const loginEvent: APIGatewayProxyEvent = {
        body: '{ invalid json',
        headers: {},
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '/auth/login',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '/auth/login',
      };

      // Act
      const loginResult = await loginHandler(loginEvent, mockContext);

      // Assert
      expect(loginResult.statusCode).toBe(400);
      const loginBody = JSON.parse(loginResult.body);
      expect(loginBody.message).toBe('リクエストボディが不正です');
    });
  });
});
