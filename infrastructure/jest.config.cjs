/**
 * Jest Configuration for CDK Infrastructure Tests
 *
 * Requirement R42: CDKスタックのテストカバレッジを100%にする
 * Requirement R45: CI/CDパイプラインでテストを自動実行する
 *
 * このファイルは以下を構成します:
 * - 100%カバレッジ閾値 (branches, functions, lines, statements)
 * - 複数形式のカバレッジレポート (HTML, JSON, LCOV, Text)
 * - Istanbulによる詳細なカバレッジメトリクス
 */

module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
  },

  // カバレッジ収集対象ファイル
  collectCoverageFrom: [
    '<rootDir>/lib/**/*.ts',
    '!<rootDir>/test/**',
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
    'html', // HTMLレポート - ブラウザで詳細確認用
    'json', // JSONレポート - CI/CD統合用
    'lcov', // LCOVレポート - カバレッジバッジ・外部ツール統合用
    'text', // テキストレポート - コンソール出力用
  ],

  // カバレッジディレクトリ
  coverageDirectory: '<rootDir>/coverage',
};
