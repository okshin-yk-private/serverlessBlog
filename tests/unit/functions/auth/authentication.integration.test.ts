/**
 * 権限検証統合テスト
 *
 * Task 3.3: 権限検証の統合テスト
 * Requirements: R15 (権限管理), R30 (統合テスト)
 *
 * このテストは、保護されたエンドポイントに対する認証・認可の統合テストを実施する。
 * - 有効なトークンでの認証済みアクセス
 * - 未認証アクセスの拒否
 * - 無効なトークンでのアクセス拒否
 * - 期限切れトークンでのアクセス拒否
 */

import type { APIGatewayProxyEvent, Context } from 'aws-lambda';

// DynamoDB モックを直接定義
const mockDynamoDBSend = jest.fn();

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({
      send: mockDynamoDBSend,
    })),
  },
  PutCommand: class PutCommand {
    constructor(public input: any) {}
  },
}));

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));

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

// markdownUtilsのモック（isomorphic-dompurifyの依存関係エラーを回避）
jest.mock('../../../../layers/common/nodejs/utils/markdownUtils', () => ({
  markdownToSafeHtml: jest.fn((markdown: string) => {
    return markdown
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');
  }),
}));

// uuidのモック
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-uuid-12345'),
}));

// Lambda Powertoolsのモック
jest.mock('@aws-lambda-powertools/logger');
jest.mock('@aws-lambda-powertools/tracer');
jest.mock('@aws-lambda-powertools/metrics');

import { handler as createPostHandler, resetDynamoDBClient } from '../../../../functions/posts/createPost/handler';
import { handler as loginHandler, resetCognitoClient } from '../../../../functions/auth/login/handler';

// Context オブジェクトのモック
const mockContext: Context = {
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'test-function',
  functionVersion: '$LATEST',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
  memoryLimitInMB: '128',
  awsRequestId: 'test-request-id',
  logGroupName: '/aws/lambda/test-function',
  logStreamName: '2023/01/01/[$LATEST]test-stream',
  getRemainingTimeInMillis: () => 30000,
  done: () => {},
  fail: () => {},
  succeed: () => {},
};

/**
 * 統合テストヘルパー: POST /posts用のAPIGatewayイベントを生成
 */
function createPostEvent(options: {
  withAuthorizer?: boolean;
  authorizationHeader?: string;
}): APIGatewayProxyEvent {
  const { withAuthorizer = false, authorizationHeader } = options;

  return {
    body: JSON.stringify({
      title: 'Test Post',
      contentMarkdown: '# Hello World',
      category: 'Technology',
      tags: ['test'],
      publishStatus: 'draft',
    }),
    headers: authorizationHeader ? { Authorization: authorizationHeader } : {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '/posts',
    pathParameters: null,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    requestContext: withAuthorizer
      ? {
          authorizer: {
            claims: {
              sub: 'test-user-id',
              email: 'test@example.com',
            },
          },
        } as any
      : ({} as any),
    resource: '',
  };
}

describe('権限検証統合テスト', () => {
  beforeEach(() => {
    resetDynamoDBClient();
    resetCognitoClient();

    // 環境変数設定
    process.env.TABLE_NAME = 'test-blog-posts-table';
    process.env.USER_POOL_ID = 'us-east-1_TestPool';
    process.env.USER_POOL_CLIENT_ID = 'test-client-id';
    process.env.AWS_REGION = 'ap-northeast-1';
    process.env.NODE_ENV = 'test';

    // モックをリセット
    mockDynamoDBSend.mockReset();
    mockCognitoSend.mockReset();

    // DynamoDB PutCommand のモックデフォルト設定
    mockDynamoDBSend.mockResolvedValue({});
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.TABLE_NAME;
    delete process.env.USER_POOL_ID;
    delete process.env.USER_POOL_CLIENT_ID;
    delete process.env.AWS_REGION;
    delete process.env.NODE_ENV;
  });

  describe('認証済みアクセス', () => {
    it('有効なトークンで保護されたエンドポイント（POST /posts）にアクセスできる', async () => {
      // Arrange: 認証済みイベントを生成
      const event = createPostEvent({
        withAuthorizer: true,
        authorizationHeader: 'Bearer mock-valid-access-token',
      });

      // Act: POST /posts を呼び出し
      const response = await createPostHandler(event, mockContext);

      // Assert: 201 Created が返されることを期待
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('title', 'Test Post');
      expect(body).toHaveProperty('publishStatus', 'draft');
    });
  });

  describe('未認証アクセス拒否', () => {
    it('Authorizationヘッダーなしで保護されたエンドポイントにアクセスできない', async () => {
      // Arrange: 未認証イベント（Authorizationヘッダーなし）
      const event = createPostEvent({ withAuthorizer: false });

      // Act: POST /posts を呼び出し
      const response = await createPostHandler(event, mockContext);

      // Assert: 401 Unauthorized が返されることを期待
      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('message');
      expect(body.message).toContain('Unauthorized');
    });

    it('requestContext.authorizerなしで保護されたエンドポイントにアクセスできない', async () => {
      // Arrange: Authorizationヘッダーはあるが、authorizerが存在しない
      const event = createPostEvent({
        withAuthorizer: false,
        authorizationHeader: 'Bearer some-token',
      });

      // Act: POST /posts を呼び出し
      const response = await createPostHandler(event, mockContext);

      // Assert: 401 Unauthorized が返されることを期待
      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('message');
      expect(body.message).toContain('Unauthorized');
    });
  });

  describe('無効なトークンアクセス拒否', () => {
    it('不正なJWTトークンで保護されたエンドポイントにアクセスできない', async () => {
      // Arrange: 不正なトークン
      // Cognito Authorizerは無効なトークンを拒否するため、authorizerは存在しない
      const event = createPostEvent({
        withAuthorizer: false,
        authorizationHeader: 'Bearer invalid.jwt.token',
      });

      // Act: POST /posts を呼び出し
      const response = await createPostHandler(event, mockContext);

      // Assert: 401 Unauthorized が返されることを期待
      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('message');
      expect(body.message).toContain('Unauthorized');
    });
  });

  describe('期限切れトークンアクセス拒否', () => {
    it('期限切れトークンで保護されたエンドポイントにアクセスできない', async () => {
      // Arrange: 期限切れトークンをシミュレート
      // 実際のCognito Authorizerは期限切れトークンを自動的に拒否するため、
      // authorizerが存在しない状態をシミュレートする
      const event = createPostEvent({
        withAuthorizer: false,
        authorizationHeader: 'Bearer expired.jwt.token',
      });

      // Act: POST /posts を呼び出し
      const response = await createPostHandler(event, mockContext);

      // Assert: 401 Unauthorized が返されることを期待
      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('message');
      expect(body.message).toContain('Unauthorized');
    });
  });
});
