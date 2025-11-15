/**
 * パフォーマンスユーティリティのユニットテスト
 *
 * Task 10.2: パフォーマンス最適化とベンチマーク
 * Requirements: R33 (公開サイト - 2秒以内), R36 (スケーラビリティ)
 *
 * このテストは以下を検証します：
 * 1. 実行時間測定ユーティリティ
 * 2. メモリ使用量測定ユーティリティ
 * 3. パフォーマンス統計計算
 */

import {
  measureExecutionTime,
  measureMemoryUsage,
  calculateStatistics,
  PerformanceMetrics,
  Statistics,
} from '../../../functions/shared/performanceUtils';

describe('performanceUtils', () => {
  describe('measureExecutionTime', () => {
    test('非同期関数の実行時間を測定できること', async () => {
      // Arrange
      const asyncFunction = async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return 'result';
      };

      // Act
      const result = await measureExecutionTime(asyncFunction);

      // Assert
      expect(result.value).toBe('result');
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(100);
      expect(result.executionTimeMs).toBeLessThan(200);
    });

    test('同期関数の実行時間を測定できること', async () => {
      // Arrange
      const syncFunction = () => {
        let sum = 0;
        for (let i = 0; i < 1000; i++) {
          sum += i;
        }
        return sum;
      };

      // Act
      const result = await measureExecutionTime(syncFunction);

      // Assert
      expect(result.value).toBe(499500);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.executionTimeMs).toBeLessThan(10);
    });

    test('エラーが発生した場合もエラーを投げること', async () => {
      // Arrange
      const errorFunction = () => {
        throw new Error('Test error');
      };

      // Act & Assert
      await expect(measureExecutionTime(errorFunction)).rejects.toThrow(
        'Test error'
      );
    });
  });

  describe('measureMemoryUsage', () => {
    test('メモリ使用量を測定できること', () => {
      // Arrange
      const beforeMemory = process.memoryUsage();

      // Act
      const result = measureMemoryUsage();

      // Assert
      expect(result.heapUsedMB).toBeGreaterThan(0);
      expect(result.heapTotalMB).toBeGreaterThan(result.heapUsedMB);
      expect(result.externalMB).toBeGreaterThanOrEqual(0);
      expect(result.arrayBuffersMB).toBeGreaterThanOrEqual(0);
    });

    test('メモリ使用量の差分を計算できること', () => {
      // Arrange
      const before = measureMemoryUsage();
      const largeArray = new Array(100000).fill('data');

      // Act
      const after = measureMemoryUsage();

      // Assert
      expect(after.heapUsedMB).toBeGreaterThan(before.heapUsedMB);

      // Cleanup
      largeArray.length = 0;
    });
  });

  describe('calculateStatistics', () => {
    test('統計値を正しく計算できること', () => {
      // Arrange
      const values = [10, 20, 30, 40, 50];

      // Act
      const stats = calculateStatistics(values);

      // Assert
      expect(stats.min).toBe(10);
      expect(stats.max).toBe(50);
      expect(stats.mean).toBe(30);
      expect(stats.median).toBe(30);
      expect(stats.p95).toBe(50);
      expect(stats.p99).toBe(50);
    });

    test('中央値を正しく計算できること（奇数個）', () => {
      // Arrange
      const values = [1, 3, 5, 7, 9];

      // Act
      const stats = calculateStatistics(values);

      // Assert
      expect(stats.median).toBe(5);
    });

    test('中央値を正しく計算できること（偶数個）', () => {
      // Arrange
      const values = [1, 2, 3, 4];

      // Act
      const stats = calculateStatistics(values);

      // Assert
      expect(stats.median).toBe(2.5);
    });

    test('パーセンタイルを正しく計算できること', () => {
      // Arrange
      const values = Array.from({ length: 100 }, (_, i) => i + 1);

      // Act
      const stats = calculateStatistics(values);

      // Assert
      expect(stats.p95).toBe(95);
      expect(stats.p99).toBe(99);
    });

    test('1つの値でも統計を計算できること', () => {
      // Arrange
      const values = [42];

      // Act
      const stats = calculateStatistics(values);

      // Assert
      expect(stats.min).toBe(42);
      expect(stats.max).toBe(42);
      expect(stats.mean).toBe(42);
      expect(stats.median).toBe(42);
      expect(stats.p95).toBe(42);
      expect(stats.p99).toBe(42);
    });

    test('空の配列に対してはエラーを投げること', () => {
      // Arrange
      const values: number[] = [];

      // Act & Assert
      expect(() => calculateStatistics(values)).toThrow(
        'Cannot calculate statistics for empty array'
      );
    });
  });

  describe('PerformanceMetrics type', () => {
    test('PerformanceMetricsの型が正しいこと', () => {
      // Arrange
      const metrics: PerformanceMetrics = {
        value: 'test',
        executionTimeMs: 123.45,
      };

      // Assert
      expect(metrics.value).toBe('test');
      expect(metrics.executionTimeMs).toBe(123.45);
    });
  });

  describe('Statistics type', () => {
    test('Statisticsの型が正しいこと', () => {
      // Arrange
      const stats: Statistics = {
        min: 10,
        max: 50,
        mean: 30,
        median: 30,
        p95: 48,
        p99: 50,
      };

      // Assert
      expect(stats.min).toBe(10);
      expect(stats.max).toBe(50);
      expect(stats.mean).toBe(30);
      expect(stats.median).toBe(30);
      expect(stats.p95).toBe(48);
      expect(stats.p99).toBe(50);
    });
  });
});
