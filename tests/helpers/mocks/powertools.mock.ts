/**
 * Lambda Powertools のモック設定
 *
 * Logger, Tracer, Metrics をモック化するヘルパー関数を提供します。
 */

// モックインスタンスをエクスポート（テストで検証可能にする）
export const mockLogger = {
  addContext: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

export const mockTracer = {
  captureAWSv3Client: jest.fn((client) => client),
  getSegment: jest.fn(),
  setSegment: jest.fn(),
  annotateColdStart: jest.fn(),
  addServiceNameAnnotation: jest.fn(),
  addResponseAsMetadata: jest.fn(),
  addErrorAsMetadata: jest.fn(),
};

export const mockMetrics = {
  addMetadata: jest.fn(),
  addMetric: jest.fn(),
  publishStoredMetrics: jest.fn(),
  clearMetrics: jest.fn(),
  setDefaultDimensions: jest.fn(),
};

/**
 * Logger のモック設定
 * テストファイルの先頭（importより前）で呼び出す必要があります
 */
export function setupLoggerMock() {
  jest.mock('@aws-lambda-powertools/logger', () => ({
    Logger: jest.fn().mockImplementation(() => mockLogger),
  }));
}

/**
 * Tracer のモック設定
 * テストファイルの先頭（importより前）で呼び出す必要があります
 */
export function setupTracerMock() {
  jest.mock('@aws-lambda-powertools/tracer', () => ({
    Tracer: jest.fn().mockImplementation(() => mockTracer),
  }));
}

/**
 * Metrics のモック設定
 * テストファイルの先頭（importより前）で呼び出す必要があります
 */
export function setupMetricsMock() {
  jest.mock('@aws-lambda-powertools/metrics', () => ({
    Metrics: jest.fn().mockImplementation(() => mockMetrics),
    MetricUnit: {
      Count: 'Count',
      Seconds: 'Seconds',
      Milliseconds: 'Milliseconds',
      Bytes: 'Bytes',
      Kilobytes: 'Kilobytes',
      Megabytes: 'Megabytes',
      Gigabytes: 'Gigabytes',
      Terabytes: 'Terabytes',
      Bits: 'Bits',
      Kilobits: 'Kilobits',
      Megabits: 'Megabits',
      Gigabits: 'Gigabits',
      Terabits: 'Terabits',
      Percent: 'Percent',
      BytesPerSecond: 'Bytes/Second',
      KilobytesPerSecond: 'Kilobytes/Second',
      MegabytesPerSecond: 'Megabytes/Second',
      GigabytesPerSecond: 'Gigabytes/Second',
      TerabytesPerSecond: 'Terabytes/Second',
      BitsPerSecond: 'Bits/Second',
      KilobitsPerSecond: 'Kilobits/Second',
      MegabitsPerSecond: 'Megabits/Second',
      GigabitsPerSecond: 'Gigabits/Second',
      TerabitsPerSecond: 'Terabits/Second',
      CountPerSecond: 'Count/Second',
    },
  }));
}

/**
 * すべての Powertools モックを設定
 * 便利なヘルパー関数
 */
export function setupAllPowertoolsMocks() {
  setupLoggerMock();
  setupTracerMock();
  setupMetricsMock();
}

/**
 * Logger モックをリセット
 * 各テストの beforeEach で呼び出してください
 */
export function resetLoggerMock() {
  mockLogger.addContext.mockClear();
  mockLogger.info.mockClear();
  mockLogger.warn.mockClear();
  mockLogger.error.mockClear();
  mockLogger.debug.mockClear();
}

/**
 * Tracer モックをリセット
 * 各テストの beforeEach で呼び出してください
 */
export function resetTracerMock() {
  mockTracer.captureAWSv3Client.mockClear();
  mockTracer.getSegment.mockClear();
  mockTracer.setSegment.mockClear();
  mockTracer.annotateColdStart.mockClear();
  mockTracer.addServiceNameAnnotation.mockClear();
  mockTracer.addResponseAsMetadata.mockClear();
  mockTracer.addErrorAsMetadata.mockClear();
}

/**
 * Metrics モックをリセット
 * 各テストの beforeEach で呼び出してください
 */
export function resetMetricsMock() {
  mockMetrics.addMetadata.mockClear();
  mockMetrics.addMetric.mockClear();
  mockMetrics.publishStoredMetrics.mockClear();
  mockMetrics.clearMetrics.mockClear();
  mockMetrics.setDefaultDimensions.mockClear();
}

/**
 * すべての Powertools モックをリセット
 * 便利なヘルパー関数
 */
export function resetAllPowertoolsMocks() {
  resetLoggerMock();
  resetTracerMock();
  resetMetricsMock();
}
