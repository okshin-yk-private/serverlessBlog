/**
 * テストクリーンアップユーティリティ
 *
 * テスト実行後のモックリセットとデータクリーンアップを管理します。
 */

import { resetDynamoDBMocks, resetS3Mocks } from '../mocks/aws-sdk.mock';
import {
  resetLoggerMock,
  resetTracerMock,
  resetMetricsMock,
} from '../mocks/powertools.mock';

/**
 * 必須環境変数のリスト
 * これらの環境変数はテスト間で保持されます
 */
const REQUIRED_ENV_VARS = [
  'AWS_REGION',
  'TABLE_NAME',
  'BUCKET_NAME',
  'USER_POOL_ID',
  'CLOUDFRONT_DOMAIN',
  'NODE_ENV',
];

/**
 * すべてのモックをリセット
 *
 * AWS SDKモックとPowertools モックをリセットして、
 * テスト間の状態汚染を防ぎます。
 */
export function resetAllMocks(): void {
  // AWS SDKモックをリセット
  resetDynamoDBMocks();
  resetS3Mocks();

  // Powertools モックをリセット
  resetLoggerMock();
  resetTracerMock();
  resetMetricsMock();
}

/**
 * テストデータをクリア
 *
 * テスト用の環境変数をクリアしますが、
 * 必須環境変数は保持します。
 */
export function clearTestData(): void {
  // 環境変数をバックアップ
  const preservedVars: Record<string, string | undefined> = {};
  for (const varName of REQUIRED_ENV_VARS) {
    preservedVars[varName] = process.env[varName];
  }

  // テスト用環境変数をクリア
  for (const key of Object.keys(process.env)) {
    if (!REQUIRED_ENV_VARS.includes(key)) {
      delete process.env[key];
    }
  }

  // 必須環境変数を復元
  for (const [key, value] of Object.entries(preservedVars)) {
    if (value !== undefined) {
      process.env[key] = value;
    }
  }
}

/**
 * afterEach フックでクリーンアップを設定
 *
 * テストスイートの各テスト後に自動的にモックをリセットします。
 *
 * @example
 * ```typescript
 * describe('My Test Suite', () => {
 *   setupCleanAfterEach();
 *
 *   it('test 1', () => {
 *     // テストコード
 *   });
 *
 *   it('test 2', () => {
 *     // 前のテストの影響を受けない
 *   });
 * });
 * ```
 */
export function setupCleanAfterEach(): void {
  afterEach(() => {
    resetAllMocks();
  });
}
