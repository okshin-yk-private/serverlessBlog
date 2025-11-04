/**
 * 共通定数定義
 */

/**
 * 環境変数キー
 */
export const ENV_VARS = {
  TABLE_NAME: 'TABLE_NAME',
  BUCKET_NAME: 'BUCKET_NAME',
  API_ENDPOINT: 'API_ENDPOINT',
} as const;

/**
 * HTTPステータスコード
 */
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
} as const;

/**
 * レスポンスヘッダー
 */
export const CORS_HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
} as const;

/**
 * 公開ステータス
 */
export const PUBLISH_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
} as const;
