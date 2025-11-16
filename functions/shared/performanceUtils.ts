/**
 * パフォーマンス測定ユーティリティ
 *
 * Task 10.2: パフォーマンス最適化とベンチマーク
 * Requirements: R33 (公開サイト - 2秒以内), R36 (スケーラビリティ)
 *
 * Lambda関数のパフォーマンス測定とベンチマークに使用するユーティリティ関数を提供します。
 */

/**
 * パフォーマンスメトリクス
 */
export interface PerformanceMetrics<T = unknown> {
  value: T;
  executionTimeMs: number;
}

/**
 * 統計情報
 */
export interface Statistics {
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  p99: number;
}

/**
 * メモリ使用量
 */
export interface MemoryUsage {
  heapUsedMB: number;
  heapTotalMB: number;
  externalMB: number;
  arrayBuffersMB: number;
}

/**
 * 関数の実行時間を測定
 *
 * @param fn - 測定対象の関数
 * @returns 実行結果と実行時間
 */
export async function measureExecutionTime<T>(
  fn: () => T | Promise<T>
): Promise<PerformanceMetrics<T>> {
  const startTime = Date.now();

  const value = await fn();
  const endTime = Date.now();
  const executionTimeMs = endTime - startTime;

  return {
    value,
    executionTimeMs,
  };
}

/**
 * メモリ使用量を測定
 *
 * @returns メモリ使用量（MB単位）
 */
export function measureMemoryUsage(): MemoryUsage {
  const memoryUsage = process.memoryUsage();

  return {
    heapUsedMB: memoryUsage.heapUsed / 1024 / 1024,
    heapTotalMB: memoryUsage.heapTotal / 1024 / 1024,
    externalMB: memoryUsage.external / 1024 / 1024,
    arrayBuffersMB: memoryUsage.arrayBuffers / 1024 / 1024,
  };
}

/**
 * 統計値を計算
 *
 * @param values - 数値の配列
 * @returns 統計情報（最小値、最大値、平均値、中央値、P95、P99）
 */
export function calculateStatistics(values: number[]): Statistics {
  if (values.length === 0) {
    throw new Error('Cannot calculate statistics for empty array');
  }

  const sorted = [...values].sort((a, b) => a - b);

  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;

  // 中央値
  const median =
    sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];

  // パーセンタイル
  const p95Index = Math.ceil(sorted.length * 0.95) - 1;
  const p99Index = Math.ceil(sorted.length * 0.99) - 1;

  const p95 = sorted[p95Index];
  const p99 = sorted[p99Index];

  return {
    min,
    max,
    mean,
    median,
    p95,
    p99,
  };
}
