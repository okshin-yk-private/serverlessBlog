/**
 * Integration Test Jest Configuration
 *
 * Task 10.1: 監視とロギングの統合検証
 *
 * このファイルは統合テスト専用のJest設定です。
 */

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/integration'],
  testMatch: ['**/*.test.ts'],

  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        isolatedModules: true,
      },
    ],
  },

  // 環境変数の設定
  setupFiles: ['<rootDir>/tests/integration/jest.setup.js'],

  // モジュールマッピング
  moduleNameMapper: {
    '^@aws-sdk/(.*)$': '<rootDir>/node_modules/@aws-sdk/$1',
    'isomorphic-dompurify': '<rootDir>/tests/__mocks__/isomorphic-dompurify.js',
    '^marked$': '<rootDir>/tests/__mocks__/marked.js',
  },

  transformIgnorePatterns: [
    'node_modules/(?!(isomorphic-dompurify|dompurify|parse5|jsdom)/)',
  ],

  // タイムアウトを長めに設定（統合テストのため）
  testTimeout: 30000,
};
