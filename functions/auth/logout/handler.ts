/**
 * logout Lambda Handler
 * Requirement R14: セッション管理機能 - ログアウトとセッション無効化
 */
import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  GlobalSignOutCommand,
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
      metrics.addMetric('LogoutValidationError', MetricUnit.Count, 1);
      return createErrorResponse(400, 'リクエストボディが必要です');
    }

    let requestBody: any;
    try {
      requestBody = JSON.parse(event.body);
    } catch (error) {
      logger.warn('リクエストボディのJSONパースに失敗しました', { error });
      metrics.addMetric('LogoutValidationError', MetricUnit.Count, 1);
      return createErrorResponse(400, 'リクエストボディが不正です');
    }

    const { accessToken } = requestBody;

    if (!accessToken) {
      logger.warn('アクセストークンが指定されていません');
      metrics.addMetric('LogoutValidationError', MetricUnit.Count, 1);
      return createErrorResponse(400, 'アクセストークンが必要です');
    }

    // Execute global sign out with Cognito
    const client = getCognitoClient();
    logger.info('グローバルサインアウトを開始');

    await client.send(
      new GlobalSignOutCommand({
        AccessToken: accessToken,
      })
    );

    logger.info('ログアウトに成功しました');
    metrics.addMetric('LogoutSuccess', MetricUnit.Count, 1);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        message: 'ログアウトしました',
      }),
    };
  } catch (error: any) {
    logger.error('ログアウト処理中にエラーが発生しました', { error });

    // Cognito-specific error handling
    if (error.name === 'NotAuthorizedException') {
      metrics.addMetric('LogoutUnauthorized', MetricUnit.Count, 1);
      return createErrorResponse(
        401,
        'アクセストークンが無効または期限切れです'
      );
    }

    metrics.addMetric('LogoutError', MetricUnit.Count, 1);
    return createErrorResponse(500, 'サーバーエラーが発生しました');
  }
};
