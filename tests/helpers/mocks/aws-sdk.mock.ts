/**
 * AWS SDK v3 のモック設定
 *
 * DynamoDB と S3 の操作をモック化するヘルパー関数を提供します。
 * 各テストファイルの beforeEach/afterEach でこれらの関数を呼び出してください。
 */

// グローバルスコープでmockSendを定義（テスト間で共有）
export const mockDynamoDBSend = jest.fn();
export const mockS3Send = jest.fn();
export const mockGetSignedUrl = jest.fn();
export const mockCognitoSend = jest.fn();

/**
 * DynamoDB Client のモック設定
 * テストファイルの先頭（importより前）で呼び出す必要があります
 */
export function setupDynamoDBMocks() {
  jest.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: jest.fn().mockImplementation(() => ({})),
  }));

  jest.mock('@aws-sdk/lib-dynamodb', () => ({
    DynamoDBDocumentClient: {
      from: jest.fn(() => ({
        send: mockDynamoDBSend,
      })),
    },
    PutCommand: class PutCommand {
      constructor(public input: any) {}
    },
    GetCommand: class GetCommand {
      constructor(public input: any) {}
    },
    UpdateCommand: class UpdateCommand {
      constructor(public input: any) {}
    },
    DeleteCommand: class DeleteCommand {
      constructor(public input: any) {}
    },
    QueryCommand: class QueryCommand {
      constructor(public input: any) {}
    },
    ScanCommand: class ScanCommand {
      constructor(public input: any) {}
    },
  }));
}

/**
 * S3 Client のモック設定
 * テストファイルの先頭（importより前）で呼び出す必要があります
 */
export function setupS3Mocks() {
  jest.mock('@aws-sdk/client-s3', () => ({
    S3Client: jest.fn().mockImplementation(() => ({
      send: mockS3Send,
    })),
    PutObjectCommand: class PutObjectCommand {
      constructor(public input: any) {}
    },
    GetObjectCommand: class GetObjectCommand {
      constructor(public input: any) {}
    },
    DeleteObjectCommand: class DeleteObjectCommand {
      constructor(public input: any) {}
    },
    DeleteObjectsCommand: class DeleteObjectsCommand {
      constructor(public input: any) {}
    },
  }));

  jest.mock('@aws-sdk/s3-request-presigner', () => ({
    getSignedUrl: (...args: any[]) => mockGetSignedUrl(...args),
  }));
}

/**
 * DynamoDB モックをリセット
 * 各テストの beforeEach で呼び出してください
 */
export function resetDynamoDBMocks() {
  mockDynamoDBSend.mockReset();
  mockDynamoDBSend.mockResolvedValue({});
}

/**
 * S3 モックをリセット
 * 各テストの beforeEach で呼び出してください
 */
export function resetS3Mocks() {
  mockS3Send.mockReset();
  mockS3Send.mockResolvedValue({});
  mockGetSignedUrl.mockReset();
  mockGetSignedUrl.mockResolvedValue('https://example.com/presigned-url');
}

/**
 * DynamoDB の成功レスポンスをモック
 */
export function mockDynamoDBSuccess(response: any = {}) {
  mockDynamoDBSend.mockResolvedValueOnce(response);
}

/**
 * DynamoDB のエラーレスポンスをモック
 */
export function mockDynamoDBError(error: Error) {
  mockDynamoDBSend.mockRejectedValueOnce(error);
}

/**
 * S3 の成功レスポンスをモック
 */
export function mockS3Success(response: any = {}) {
  mockS3Send.mockResolvedValueOnce(response);
}

/**
 * S3 のエラーレスポンスをモック
 */
export function mockS3Error(error: Error) {
  mockS3Send.mockRejectedValueOnce(error);
}

/**
 * Cognito Client のモック設定
 * テストファイルの先頭（importより前）で呼び出す必要があります
 */
export function setupCognitoMocks() {
  jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
    CognitoIdentityProviderClient: jest.fn().mockImplementation(() => ({
      send: mockCognitoSend,
    })),
    InitiateAuthCommand: class InitiateAuthCommand {
      constructor(public input: any) {}
    },
    RespondToAuthChallengeCommand: class RespondToAuthChallengeCommand {
      constructor(public input: any) {}
    },
    GlobalSignOutCommand: class GlobalSignOutCommand {
      constructor(public input: any) {}
    },
  }));
}

/**
 * Cognito モックをリセット
 * 各テストの beforeEach で呼び出してください
 */
export function resetCognitoMocks() {
  mockCognitoSend.mockReset();
  mockCognitoSend.mockResolvedValue({});
}

/**
 * Cognito の成功レスポンスをモック
 */
export function mockCognitoSuccess(response: any = {}) {
  mockCognitoSend.mockResolvedValueOnce(response);
}

/**
 * Cognito のエラーレスポンスをモック
 */
export function mockCognitoError(error: Error) {
  mockCognitoSend.mockRejectedValueOnce(error);
}
