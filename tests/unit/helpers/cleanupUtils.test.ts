/**
 * クリーンアップユーティリティのテスト
 *
 * テスト後のデータクリーンアップを管理するヘルパー関数のテスト
 */

import {
  resetAllMocks,
  clearTestData,
  setupCleanAfterEach,
} from '../../helpers/utils/cleanupUtils';
import {
  mockDynamoDBSend,
  mockS3Send,
  mockGetSignedUrl,
} from '../../helpers/mocks/aws-sdk.mock';
import {
  mockLogger,
  mockTracer,
  mockMetrics,
} from '../../helpers/mocks/powertools.mock';

describe('cleanupUtils', () => {
  describe('resetAllMocks', () => {
    it('should reset all AWS SDK mocks', () => {
      // モックを使用してダーティ状態にする
      mockDynamoDBSend.mockResolvedValueOnce({ Item: { id: '123' } });
      mockS3Send.mockResolvedValueOnce({});
      mockGetSignedUrl.mockResolvedValueOnce('https://example.com/signed');

      // クリーンアップ
      resetAllMocks();

      // モックがリセットされていることを確認
      expect(mockDynamoDBSend).not.toHaveBeenCalled();
      expect(mockS3Send).not.toHaveBeenCalled();
      expect(mockGetSignedUrl).not.toHaveBeenCalled();
    });

    it('should reset all Powertools mocks', () => {
      // モックを使用してダーティ状態にする
      mockLogger.info('test');
      mockTracer.addServiceNameAnnotation();
      mockMetrics.addMetric('test', 'Count', 1);

      // クリーンアップ
      resetAllMocks();

      // モックがリセットされていることを確認
      expect(mockLogger.info).not.toHaveBeenCalled();
      expect(mockTracer.addServiceNameAnnotation).not.toHaveBeenCalled();
      expect(mockMetrics.addMetric).not.toHaveBeenCalled();
    });
  });

  describe('clearTestData', () => {
    it('should clear all test environment variables', () => {
      // テスト用環境変数を設定
      process.env.TEST_VAR_1 = 'value1';
      process.env.TEST_VAR_2 = 'value2';

      // クリーンアップ
      clearTestData();

      // 環境変数がクリアされていることを確認
      expect(process.env.TEST_VAR_1).toBeUndefined();
      expect(process.env.TEST_VAR_2).toBeUndefined();
    });

    it('should preserve required environment variables', () => {
      // 必須環境変数を設定
      process.env.AWS_REGION = 'us-east-1';
      process.env.TABLE_NAME = 'test-table';

      // テスト用環境変数を設定
      process.env.TEMP_VAR = 'temp';

      // クリーンアップ
      clearTestData();

      // 必須環境変数は保持されていることを確認
      expect(process.env.AWS_REGION).toBe('us-east-1');
      expect(process.env.TABLE_NAME).toBe('test-table');

      // テスト用環境変数はクリアされていることを確認
      expect(process.env.TEMP_VAR).toBeUndefined();
    });
  });

  describe('setupCleanAfterEach', () => {
    it('should register afterEach hook that resets mocks', () => {
      const afterEachMock = jest.fn();
      const originalAfterEach = global.afterEach;
      (global as any).afterEach = afterEachMock;

      setupCleanAfterEach();

      expect(afterEachMock).toHaveBeenCalledWith(expect.any(Function));

      // 元に戻す
      global.afterEach = originalAfterEach;
    });

    it('should call resetAllMocks in afterEach hook', () => {
      let capturedCallback: any = null;
      const originalAfterEach = global.afterEach;

      (global as any).afterEach = jest.fn((callback: any) => {
        capturedCallback = callback;
      });

      setupCleanAfterEach();

      // モックを使用してダーティ状態にする
      mockDynamoDBSend.mockResolvedValueOnce({ Item: { id: '123' } });

      // afterEachコールバックを実行
      if (capturedCallback) {
        capturedCallback();
      }

      // モックがリセットされていることを確認
      expect(mockDynamoDBSend).not.toHaveBeenCalled();

      // 元に戻す
      global.afterEach = originalAfterEach;
    });
  });
});
