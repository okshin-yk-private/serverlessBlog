/**
 * 認証関連のユーティリティ関数
 */
import { APIGatewayProxyEvent } from 'aws-lambda';

/**
 * API Gateway イベントからユーザーIDを取得する
 *
 * @param event - API Gateway プロキシイベント
 * @returns ユーザーID（Cognito sub）、取得できない場合はundefined
 */
export function getUserIdFromEvent(event: APIGatewayProxyEvent): string | undefined {
  // requestContextが存在しない場合
  if (!event.requestContext) {
    return undefined;
  }

  // authorizerが存在しない場合
  const authorizer = event.requestContext.authorizer;
  if (!authorizer) {
    return undefined;
  }

  // claimsが存在しない場合
  const claims = authorizer.claims;
  if (!claims) {
    return undefined;
  }

  // subを返す
  return claims.sub;
}
