/**
 * login Lambda Handler
 *
 * Requirement R13: 管理者ログイン機能
 * - 有効な認証情報でCognito認証を実行
 * - 認証成功時にJWTアクセストークンとリフレッシュトークンを返す
 * - 認証失敗時に401 Unauthorizedエラーを返す
 * - トークン有効期限を1時間に設定
 */

import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  InitiateAuthCommandInput,
} from '@aws-sdk/client-cognito-identity-provider';
import { Logger } from '@aws-lambda-powertools/logger';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics';

const logger = new Logger();
const tracer = new Tracer();
const metrics = new Metrics();

let cognitoClient: CognitoIdentityProviderClient | null = null;

export function getCognitoClient(): CognitoIdentityProviderClient {
  if (!cognitoClient) {
    const clientConfig: any = {};

    if (process.env.COGNITO_ENDPOINT) {
      clientConfig.endpoint = process.env.COGNITO_ENDPOINT;
      clientConfig.region = process.env.AWS_REGION || 'ap-northeast-1';
      clientConfig.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
      };
    }

    cognitoClient = tracer.captureAWSv3Client(
      new CognitoIdentityProviderClient(clientConfig)
    );
  }
  return cognitoClient;
}

export function resetCognitoClient(): void {
  cognitoClient = null;
}

function createErrorResponse(
  statusCode: number,
  message: string
): APIGatewayProxyResult {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({ message }),
  };
}

/**
 * Lambda handler: 管理者ログイン
 *
 * @param event - API Gateway Proxy Event
 *   - body.email: メールアドレス（必須）
 *   - body.password: パスワード（必須）
 * @param context - Lambda実行コンテキスト
 * @returns API Gateway Proxy Result
 *
 * @example
 * // ログイン成功
 * POST /auth/login
 * {
 *   "email": "admin@example.com",
 *   "password": "SecurePassword123!"
 * }
 * → 200 OK
 * {
 *   "accessToken": "...",
 *   "refreshToken": "...",
 *   "idToken": "...",
 *   "expiresIn": 3600
 * }
 *
 * @example
 * // 認証失敗
 * POST /auth/login
 * {
 *   "email": "admin@example.com",
 *   "password": "wrongpassword"
 * }
 * → 401 Unauthorized
 */
export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  logger.addContext(context);

  try {
    // リクエストボディの取得とバリデーション
    if (!event.body) {
      logger.warn('リクエストボディが指定されていません');
      metrics.addMetric('LoginValidationError', MetricUnit.Count, 1);
      return createErrorResponse(400, 'リクエストボディが必要です');
    }

    let requestBody: any;
    try {
      requestBody = JSON.parse(event.body);
    } catch (error) {
      logger.warn('リクエストボディのJSONパースに失敗しました', { error });
      metrics.addMetric('LoginValidationError', MetricUnit.Count, 1);
      return createErrorResponse(400, 'リクエストボディが不正です');
    }

    const { email, password } = requestBody;

    if (!email) {
      logger.warn('メールアドレスが指定されていません');
      metrics.addMetric('LoginValidationError', MetricUnit.Count, 1);
      return createErrorResponse(400, 'メールアドレスが必要です');
    }

    if (!password) {
      logger.warn('パスワードが指定されていません');
      metrics.addMetric('LoginValidationError', MetricUnit.Count, 1);
      return createErrorResponse(400, 'パスワードが必要です');
    }

    // Cognito認証を実行
    const client = getCognitoClient();
    logger.info('Cognito認証を開始', { email });

    const authParams: InitiateAuthCommandInput = {
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: process.env.USER_POOL_CLIENT_ID || '',
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    };

    const authResult = await client.send(new InitiateAuthCommand(authParams));

    if (!authResult.AuthenticationResult) {
      logger.error('認証結果が返されませんでした');
      metrics.addMetric('LoginError', MetricUnit.Count, 1);
      return createErrorResponse(500, 'サーバーエラーが発生しました');
    }

    logger.info('ログインに成功しました', { email });
    metrics.addMetric('LoginSuccess', MetricUnit.Count, 1);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        accessToken: authResult.AuthenticationResult.AccessToken,
        refreshToken: authResult.AuthenticationResult.RefreshToken,
        idToken: authResult.AuthenticationResult.IdToken,
        expiresIn: authResult.AuthenticationResult.ExpiresIn,
      }),
    };
  } catch (error: any) {
    logger.error('ログイン処理中にエラーが発生しました', { error });

    // Cognito特有のエラーハンドリング
    if (
      error.name === 'NotAuthorizedException' ||
      error.name === 'UserNotFoundException'
    ) {
      metrics.addMetric('LoginUnauthorized', MetricUnit.Count, 1);
      return createErrorResponse(
        401,
        'メールアドレスまたはパスワードが正しくありません'
      );
    }

    if (error.name === 'UserNotConfirmedException') {
      metrics.addMetric('LoginUserNotConfirmed', MetricUnit.Count, 1);
      return createErrorResponse(401, 'ユーザーが確認されていません');
    }

    metrics.addMetric('LoginError', MetricUnit.Count, 1);
    return createErrorResponse(500, 'サーバーエラーが発生しました');
  }
};
