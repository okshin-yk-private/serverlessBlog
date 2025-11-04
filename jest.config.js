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

  // integration testを除外
  testPathIgnorePatterns: [
    '/node_modules/',
    '/tests/integration/',
    '/infrastructure/test/',
  ],

  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      isolatedModules: true,
    }],
  },

  // カバレッジ収集対象ファイル
  collectCoverageFrom: [
    'functions/**/*.ts',
    'layers/common/nodejs/**/*.ts',
    '!functions/**/index.ts',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],

  // カバレッジレポート形式 (HTML, JSON, LCOV, Text)
  coverageReporters: [
    'html',      // HTMLレポート - ブラウザで詳細確認用
    'json',      // JSONレポート - CI/CD統合用
    'lcov',      // LCOVレポート - カバレッジバッジ・外部ツール統合用
    'text',      // テキストレポート - コンソール出力用
  ],

  // カバレッジディレクトリ
  coverageDirectory: '<rootDir>/coverage',

  moduleNameMapper: {
    '^@aws-sdk/(.*)$': '<rootDir>/node_modules/@aws-sdk/$1',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(isomorphic-dompurify|dompurify)/)',
  ],
};
