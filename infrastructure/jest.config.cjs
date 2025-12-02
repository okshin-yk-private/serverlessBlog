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
  // ローカル実行時の負荷軽減: ワーカー数を制限
  maxWorkers: process.env.CI ? 4 : 2,
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

  // カバレッジレポート形式
  // ローカル実行時はtextのみ、CI実行時は全種類を生成
  coverageReporters: process.env.CI
    ? ['html', 'json', 'json-summary', 'lcov', 'text']
    : ['text'],

  // カバレッジディレクトリ
  coverageDirectory: '<rootDir>/coverage',

  // カスタムスナップショットシリアライザー
  // S3Keyハッシュを正規化して環境非依存のスナップショット比較を実現
  snapshotSerializers: ['<rootDir>/test/snapshot-serializer.ts'],
};
