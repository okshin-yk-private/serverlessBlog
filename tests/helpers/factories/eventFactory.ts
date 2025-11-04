import { APIGatewayProxyEvent, Context } from 'aws-lambda';

/**
 * API Gateway ProxyEvent を生成するファクトリ関数
 *
 * @param overrides - オーバーライドするプロパティ
 * @returns モックAPI Gatewayイベント
 *
 * @example
 * // GETリクエスト
 * const event = createMockAPIGatewayEvent({ httpMethod: 'GET' });
 *
 * // POSTリクエスト with body
 * const event = createMockAPIGatewayEvent({
 *   httpMethod: 'POST',
 *   body: JSON.stringify({ title: 'Test' })
 * });
 */
export function createMockAPIGatewayEvent(
  overrides: Partial<APIGatewayProxyEvent> = {}
): APIGatewayProxyEvent {
  const defaultEvent: APIGatewayProxyEvent = {
    httpMethod: 'GET',
    path: '/posts',
    headers: {
      'Content-Type': 'application/json',
    },
    multiValueHeaders: {},
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    pathParameters: null,
    stageVariables: null,
    body: null,
    isBase64Encoded: false,
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api-id',
      protocol: 'HTTP/1.1',
      httpMethod: overrides.httpMethod || 'GET',
      path: overrides.path || '/posts',
      stage: 'test',
      requestId: `test-request-${Date.now()}`,
      requestTimeEpoch: Date.now(),
      resourceId: 'test-resource-id',
      resourcePath: overrides.path || '/posts',
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
      authorizer: null,
    },
    resource: '',
  };

  return {
    ...defaultEvent,
    ...overrides,
    headers: {
      ...defaultEvent.headers,
      ...overrides.headers,
    },
    requestContext: {
      ...defaultEvent.requestContext,
      ...overrides.requestContext,
    },
  };
}

/**
 * Lambda Context を生成するファクトリ関数
 *
 * @param overrides - オーバーライドするプロパティ
 * @returns モックLambda Context
 *
 * @example
 * const context = createMockContext();
 * const context = createMockContext({ functionName: 'MyFunction' });
 */
export function createMockContext(overrides: Partial<Context> = {}): Context {
  const defaultContext: Context = {
    callbackWaitsForEmptyEventLoop: false,
    functionName: 'test-function',
    functionVersion: '$LATEST',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
    memoryLimitInMB: '256',
    awsRequestId: `test-aws-request-${Date.now()}`,
    logGroupName: '/aws/lambda/test-function',
    logStreamName: `2024/01/01/[$LATEST]${Date.now()}`,
    getRemainingTimeInMillis: () => 30000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  };

  return {
    ...defaultContext,
    ...overrides,
  };
}
