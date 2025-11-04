/**
 * API Gatewayレスポンスの検証用アサーションヘルパー
 *
 * テストコードの可読性を向上させ、一貫したレスポンス検証を提供します。
 */

interface APIGatewayResponse {
  statusCode: number;
  body: string;
  headers?: Record<string, string>;
}

/**
 * 成功レスポンスを検証
 *
 * @param response - API Gatewayレスポンス
 * @param expectedStatusCode - 期待されるステータスコード (デフォルト: 200)
 * @param expectedBody - 期待されるボディ構造 (オプション)
 */
export function expectSuccessResponse(
  response: APIGatewayResponse,
  expectedStatusCode: number = 200,
  expectedBody?: any
): void {
  if (response.statusCode !== expectedStatusCode) {
    throw new Error(
      `Expected status code ${expectedStatusCode}, but got ${response.statusCode}`
    );
  }

  if (expectedBody) {
    const actualBody = JSON.parse(response.body);
    expect(actualBody).toMatchObject(expectedBody);
  }
}

/**
 * エラーレスポンスを検証
 *
 * @param response - API Gatewayレスポンス
 * @param expectedStatusCode - 期待されるエラーステータスコード
 * @param expectedMessage - 期待されるエラーメッセージ (オプション)
 */
export function expectErrorResponse(
  response: APIGatewayResponse,
  expectedStatusCode: number,
  expectedMessage?: string
): void {
  if (response.statusCode !== expectedStatusCode) {
    throw new Error(
      `Expected error status code ${expectedStatusCode}, but got ${response.statusCode}`
    );
  }

  if (expectedMessage) {
    const body = JSON.parse(response.body);
    if (!body.message || !body.message.includes(expectedMessage)) {
      throw new Error(
        `Expected error message to contain "${expectedMessage}", but got "${body.message}"`
      );
    }
  }
}

/**
 * バリデーションエラー (400) を検証
 *
 * @param response - API Gatewayレスポンス
 * @param expectedMessage - 期待されるエラーメッセージ (オプション)
 */
export function expectValidationError(
  response: APIGatewayResponse,
  expectedMessage?: string
): void {
  expectErrorResponse(response, 400, expectedMessage);
}

/**
 * Not Found エラー (404) を検証
 *
 * @param response - API Gatewayレスポンス
 * @param expectedMessage - 期待されるエラーメッセージ (オプション)
 */
export function expectNotFoundError(
  response: APIGatewayResponse,
  expectedMessage?: string
): void {
  expectErrorResponse(response, 404, expectedMessage);
}

/**
 * Unauthorized エラー (401) を検証
 *
 * @param response - API Gatewayレスポンス
 * @param expectedMessage - 期待されるエラーメッセージ (オプション)
 */
export function expectUnauthorizedError(
  response: APIGatewayResponse,
  expectedMessage?: string
): void {
  expectErrorResponse(response, 401, expectedMessage);
}
