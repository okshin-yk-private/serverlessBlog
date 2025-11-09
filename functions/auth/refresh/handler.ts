/**
 * refresh Lambda Handler
 * Requirement R14: セッション管理機能 - リフレッシュトークンによるアクセストークン更新
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

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  logger.addContext(context);

  try {
    // Validate request body
    if (!event.body) {
      logger.warn('リクエストボディが指定されていません');
      metrics.addMetric('RefreshValidationError', MetricUnit.Count, 1);
      return createErrorResponse(400, 'リクエストボディが必要です');
    }

    let requestBody: any;
    try {
      requestBody = JSON.parse(event.body);
    } catch (error) {
      logger.warn('リクエストボディのJSONパースに失敗しました', { error });
      metrics.addMetric('RefreshValidationError', MetricUnit.Count, 1);
      return createErrorResponse(400, 'リクエストボディが不正です');
    }

    const { refreshToken } = requestBody;

    if (!refreshToken) {
      logger.warn('リフレッシュトークンが指定されていません');
      metrics.addMetric('RefreshValidationError', MetricUnit.Count, 1);
      return createErrorResponse(400, 'リフレッシュトークンが必要です');
    }

    // Execute token refresh with Cognito
    const client = getCognitoClient();
    logger.info('リフレッシュトークンによるトークン更新を開始');

    const authParams: InitiateAuthCommandInput = {
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: process.env.USER_POOL_CLIENT_ID || '',
      AuthParameters: {
        REFRESH_TOKEN: refreshToken,
      },
    };

    const authResult = await client.send(new InitiateAuthCommand(authParams));

    if (!authResult.AuthenticationResult) {
      logger.error('認証結果が返されませんでした');
      metrics.addMetric('RefreshError', MetricUnit.Count, 1);
      return createErrorResponse(500, 'サーバーエラーが発生しました');
    }

    logger.info('トークン更新に成功しました');
    metrics.addMetric('RefreshSuccess', MetricUnit.Count, 1);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        accessToken: authResult.AuthenticationResult.AccessToken,
        idToken: authResult.AuthenticationResult.IdToken,
        expiresIn: authResult.AuthenticationResult.ExpiresIn,
      }),
    };
  } catch (error: any) {
    logger.error('トークン更新処理中にエラーが発生しました', { error });

    // Cognito-specific error handling
    if (error.name === 'NotAuthorizedException') {
      metrics.addMetric('RefreshUnauthorized', MetricUnit.Count, 1);
      return createErrorResponse(
        401,
        'リフレッシュトークンが無効または期限切れです'
      );
    }

    metrics.addMetric('RefreshError', MetricUnit.Count, 1);
    return createErrorResponse(500, 'サーバーエラーが発生しました');
  }
};
