/**
 * Jest Configuration for Unit Tests
 *
 * Requirement R40: Lambda関数のテストカバレッジを100%にする
 * Requirement R45: CI/CDパイプラインでテストを自動実行する
 *
 * このファイルは以下を構成します:
 * - 100%カバレッジ閾値 (branches, functions, lines, statements)
 * - 複数形式のカバレッジレポート (HTML, JSON, LCOV, Text)
 * - Istanbulによる詳細なカバレッジメトリクス
 */

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '../../',
  testMatch: ['<rootDir>/tests/unit/**/*.test.ts'],

  // integration testを除外
  testPathIgnorePatterns: [
    '/node_modules/',
    '/tests/integration/',
  ],

  transformIgnorePatterns: [
    'node_modules/(?!(@aws-sdk)/)',
  ],
  setupFiles: ['<rootDir>/tests/unit/jest.setup.js'],

  // カバレッジ収集対象ファイル
  collectCoverageFrom: [
    'functions/**/*.ts',
    'layers/common/nodejs/**/*.ts',
    '!functions/**/index.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],

  // 100%カバレッジ閾値の強制
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },

  // カバレッジレポート形式 (HTML, JSON, LCOV, Text)
  coverageReporters: [
    'html',      // HTMLレポート - ブラウザで詳細確認用
    'json',      // JSONレポート - CI/CD統合用
    'lcov',      // LCOVレポート - カバレッジバッジ・外部ツール統合用
    'text',      // テキストレポート - コンソール出力用
  ],

  // カバレッジディレクトリ
  coverageDirectory: '<rootDir>/tests/unit/coverage',

  moduleNameMapper: {
    '^/opt/nodejs/(.*)$': '<rootDir>/layers/common/nodejs/$1',
  },
  moduleDirectories: [
    'node_modules',
    '<rootDir>/node_modules',
    '<rootDir>/tests/unit/node_modules',
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: '<rootDir>/tests/unit/tsconfig.json',
      isolatedModules: true,
    }],
  },
};
