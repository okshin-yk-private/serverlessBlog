/**
 * 権限検証統合テスト
 *
 * Task 3.3: 権限検証の統合テスト
 * Requirements: R15 (権限管理), R30 (統合テスト)
 *
 * このテストは、保護されたエンドポイントに対する認証・認可の統合テストを実施する。
 * - 有効なトークンでの認証済みアクセス
 * - 未認証アクセスの拒否
 */

import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { DynamoDBClient, CreateTableCommand, DeleteTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

// テスト用のDynamoDBクライアント
const dynamoDBClient = new DynamoDBClient({
  endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
  },
});

const docClient = DynamoDBDocumentClient.from(dynamoDBClient);

const TABLE_NAME = 'test-blog-posts-table';

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

// markdownUtilsのモック（統合テストではmarkdown変換は不要）
jest.mock('/opt/nodejs/utils/markdownUtils', () => ({
  markdownToSafeHtml: jest.fn((markdown: string) => {
    return `<p>${markdown}</p>`;
  }),
}));

// ハンドラーをインポート（モックの後）
import { handler as createPostHandler } from '../../../functions/posts/createPost/handler';

describe('Authentication Integration Tests', () => {
  const mockContext = {} as Context;

  // テーブル作成
  beforeAll(async () => {
    try {
      await dynamoDBClient.send(new CreateTableCommand({
        TableName: TABLE_NAME,
        KeySchema: [
          { AttributeName: 'id', KeyType: 'HASH' },
        ],
        AttributeDefinitions: [
          { AttributeName: 'id', AttributeType: 'S' },
        ],
        BillingMode: 'PAY_PER_REQUEST',
      }));

      // テーブルが作成されるまで待機
      let tableReady = false;
      for (let i = 0; i < 10; i++) {
        try {
          const result = await dynamoDBClient.send(new DescribeTableCommand({
            TableName: TABLE_NAME,
          }));
          if (result.Table?.TableStatus === 'ACTIVE') {
            tableReady = true;
            break;
          }
        } catch (error) {
          // テーブルがまだ作成中
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      if (!tableReady) {
        throw new Error('Table creation timed out');
      }
    } catch (error: any) {
      if (error.name !== 'ResourceInUseException') {
        throw error;
      }
      // テーブルが既に存在する場合は続行
    }
  });

  // テーブル削除
  afterAll(async () => {
    try {
      await dynamoDBClient.send(new DeleteTableCommand({
        TableName: TABLE_NAME,
      }));
    } catch (error) {
      // テーブルが存在しない場合は無視
    }
  });

  describe('保護されたエンドポイントへのアクセス', () => {
    test('有効な認証情報を持つリクエストは成功する', async () => {
      // Arrange
      const event: APIGatewayProxyEvent = {
        body: JSON.stringify({
          title: 'Test Post',
          contentMarkdown: '# Hello World',
          category: 'Technology',
          publishStatus: 'draft',
        }),
        headers: {},
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '/posts',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {
          accountId: '123456789012',
          apiId: 'test-api-id',
          authorizer: {
            claims: {
              sub: 'user-123',
              email: 'test@example.com',
            },
          },
          protocol: 'HTTP/1.1',
          httpMethod: 'POST',
          path: '/posts',
          stage: 'test',
          requestId: 'test-request-id',
          requestTimeEpoch: Date.now(),
          resourceId: 'test-resource-id',
          resourcePath: '/posts',
          identity: {
            accessKey: null,
            accountId: null,
            apiKey: null,
            apiKeyId: null,
            caller: null,
            clientCert: null,
            cognitoAuthenticationProvider: null,
            cognitoAuthenticationType: null,
            cognitoIdentityId: null,
            cognitoIdentityPoolId: null,
            principalOrgId: null,
            sourceIp: '127.0.0.1',
            user: null,
            userAgent: 'test-agent',
            userArn: null,
            vpcId: null,
            vpceId: null,
          },
        },
        resource: '/posts',
      };

      // Act
      const result = await createPostHandler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.title).toBe('Test Post');
      expect(body.authorId).toBe('user-123');
    });

    test('認証情報がないリクエストは401エラーを返す', async () => {
      // Arrange
      const event: APIGatewayProxyEvent = {
        body: JSON.stringify({
          title: 'Test Post',
          contentMarkdown: '# Hello World',
          category: 'Technology',
          publishStatus: 'draft',
        }),
        headers: {},
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '/posts',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {
          accountId: '123456789012',
          apiId: 'test-api-id',
          authorizer: undefined, // 認証情報なし
          protocol: 'HTTP/1.1',
          httpMethod: 'POST',
          path: '/posts',
          stage: 'test',
          requestId: 'test-request-id',
          requestTimeEpoch: Date.now(),
          resourceId: 'test-resource-id',
          resourcePath: '/posts',
          identity: {
            accessKey: null,
            accountId: null,
            apiKey: null,
            apiKeyId: null,
            caller: null,
            clientCert: null,
            cognitoAuthenticationProvider: null,
            cognitoAuthenticationType: null,
            cognitoIdentityId: null,
            cognitoIdentityPoolId: null,
            principalOrgId: null,
            sourceIp: '127.0.0.1',
            user: null,
            userAgent: 'test-agent',
            userArn: null,
            vpcId: null,
            vpceId: null,
          },
        },
        resource: '/posts',
      };

      // Act
      const result = await createPostHandler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Unauthorized');
    });

    test('requestContextがないリクエストは401エラーを返す', async () => {
      // Arrange
      const event: any = {
        body: JSON.stringify({
          title: 'Test Post',
          contentMarkdown: '# Hello World',
          category: 'Technology',
          publishStatus: 'draft',
        }),
        headers: {},
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '/posts',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: null, // requestContextがnull
        resource: '/posts',
      };

      // Act
      const result = await createPostHandler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Unauthorized');
    });

    test('authorizerはあるがclaimsがないリクエストは401エラーを返す', async () => {
      // Arrange
      const event: APIGatewayProxyEvent = {
        body: JSON.stringify({
          title: 'Test Post',
          contentMarkdown: '# Hello World',
          category: 'Technology',
          publishStatus: 'draft',
        }),
        headers: {},
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '/posts',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {
          accountId: '123456789012',
          apiId: 'test-api-id',
          authorizer: {}, // claimsがない
          protocol: 'HTTP/1.1',
          httpMethod: 'POST',
          path: '/posts',
          stage: 'test',
          requestId: 'test-request-id',
          requestTimeEpoch: Date.now(),
          resourceId: 'test-resource-id',
          resourcePath: '/posts',
          identity: {
            accessKey: null,
            accountId: null,
            apiKey: null,
            apiKeyId: null,
            caller: null,
            clientCert: null,
            cognitoAuthenticationProvider: null,
            cognitoAuthenticationType: null,
            cognitoIdentityId: null,
            cognitoIdentityPoolId: null,
            principalOrgId: null,
            sourceIp: '127.0.0.1',
            user: null,
            userAgent: 'test-agent',
            userArn: null,
            vpcId: null,
            vpceId: null,
          },
        },
        resource: '/posts',
      };

      // Act
      const result = await createPostHandler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Unauthorized');
    });

    test('claims.subがないリクエストは401エラーを返す', async () => {
      // Arrange
      const event: APIGatewayProxyEvent = {
        body: JSON.stringify({
          title: 'Test Post',
          contentMarkdown: '# Hello World',
          category: 'Technology',
          publishStatus: 'draft',
        }),
        headers: {},
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '/posts',
        pathParameters: null,
        queryStringParameters: null,
        multiValueQueryStringParameters: null,
        stageVariables: null,
        requestContext: {
          accountId: '123456789012',
          apiId: 'test-api-id',
          authorizer: {
            claims: {}, // subがない
          },
          protocol: 'HTTP/1.1',
          httpMethod: 'POST',
          path: '/posts',
          stage: 'test',
          requestId: 'test-request-id',
          requestTimeEpoch: Date.now(),
          resourceId: 'test-resource-id',
          resourcePath: '/posts',
          identity: {
            accessKey: null,
            accountId: null,
            apiKey: null,
            apiKeyId: null,
            caller: null,
            clientCert: null,
            cognitoAuthenticationProvider: null,
            cognitoAuthenticationType: null,
            cognitoIdentityId: null,
            cognitoIdentityPoolId: null,
            principalOrgId: null,
            sourceIp: '127.0.0.1',
            user: null,
            userAgent: 'test-agent',
            userArn: null,
            vpcId: null,
            vpceId: null,
          },
        },
        resource: '/posts',
      };

      // Act
      const result = await createPostHandler(event, mockContext);

      // Assert
      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.message).toBe('Unauthorized');
    });
  });
});
