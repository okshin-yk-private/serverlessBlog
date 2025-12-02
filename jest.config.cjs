/**
 * Root Jest Configuration
 *
 * Requirement R40: Lambda関数のテストカバレッジを100%にする
 * Requirement R41: フロントエンドのテストカバレッジを100%にする
 * Requirement R42: CDKスタックのテストカバレッジを100%にする
 * Requirement R45: CI/CDパイプラインでテストを自動実行する
 *
 * このファイルは全プロジェクト共通のJest設定です。
 * 個別プロジェクト (infrastructure, tests/unit, frontend) は独自の設定を持ちます。
 */

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/unit'],
  testMatch: ['**/*.test.ts'],
  // ローカル実行時の負荷軽減: ワーカー数を制限
  maxWorkers: process.env.CI ? 4 : 2,

  // integration testを除外
  testPathIgnorePatterns: [
    '/node_modules/',
    '/tests/integration/',
    '/infrastructure/test/',
  ],

  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        isolatedModules: true,
      },
    ],
  },

  // カバレッジ収集対象ファイル
  collectCoverageFrom: [
    'functions/**/*.ts',
    'layers/common/nodejs/**/*.ts',
    '!functions/**/index.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],

  // カバレッジレポート形式
  // ローカル実行時はtextのみ、CI実行時は全種類を生成
  coverageReporters: process.env.CI
    ? ['html', 'json', 'json-summary', 'lcov', 'text']
    : ['text'],

  // カバレッジディレクトリ
  coverageDirectory: '<rootDir>/coverage',

  moduleNameMapper: {
    '^@aws-sdk/(.*)$': '<rootDir>/node_modules/@aws-sdk/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(isomorphic-dompurify|dompurify)/)',
  ],
};
