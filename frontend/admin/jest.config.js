/**
 * Jest Configuration for Admin Dashboard (Frontend)
 *
 * Requirement R41: フロントエンドのテストカバレッジを100%にする
 * Requirement R45: CI/CDパイプラインでテストを自動実行する
 *
 * このファイルは以下を構成します:
 * - 100%カバレッジ閾値 (branches, functions, lines, statements)
 * - 複数形式のカバレッジレポート (HTML, JSON, LCOV, Text)
 * - Istanbulによる詳細なカバレッジメトリクス
 * - React Testing Library統合
 */

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.ts?(x)',
    '**/?(*.)+(spec|test).ts?(x)',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],

  // カバレッジ収集対象ファイル
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/index.tsx',
    '!src/**/*.stories.tsx',
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
  coverageDirectory: '<rootDir>/coverage',

  // モジュールエイリアスマッピング
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif|svg)$': '<rootDir>/__mocks__/fileMock.js',
  },

  // セットアップファイル
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],

  // Transform設定
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        jsx: 'react',
        esModuleInterop: true,
      },
    }],
  },

  // ignore patterns
  transformIgnorePatterns: [
    'node_modules/(?!(.*\\.mjs$))',
  ],
};
