/**
 * Jest Configuration for Frontend Integration Tests
 *
 * このファイルは、フロントエンド統合テスト用のJest設定です。
 * 実際のAWS環境（dev/prd）に対してフロントエンドの統合テストを実行します。
 *
 * テスト対象:
 * - 公開サイト（記事一覧、記事詳細、カテゴリフィルタリング、タグ検索、SEO）
 * - 管理画面（ログイン、記事CRUD、画像アップロード、ダッシュボード）
 * - 認証・認可（セッション管理、認証ガード、アクセス制御）
 */

module.exports = {
  displayName: 'frontend-integration',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/tests/integration/frontend'],
  testMatch: ['**/*.integration.test.ts', '**/*.integration.test.tsx'],

  // TypeScript変換
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          jsx: 'react-jsx',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
        },
      },
    ],
  },

  // モジュール解決
  moduleNameMapper: {
    // CSS/画像のモック
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif|svg|webp)$': '<rootDir>/__mocks__/fileMock.js',
    // エイリアス解決
    '^@/(.*)$': '<rootDir>/frontend/public/src/$1',
    '^@admin/(.*)$': '<rootDir>/frontend/admin/src/$1',
  },

  // セットアップファイル
  setupFilesAfterEnv: ['<rootDir>/tests/integration/frontend/setup.ts'],

  // カバレッジ設定
  collectCoverage: true,
  collectCoverageFrom: [
    'frontend/public/src/**/*.{ts,tsx}',
    'frontend/admin/src/**/*.{ts,tsx}',
    '!frontend/*/src/**/*.test.{ts,tsx}',
    '!frontend/*/src/**/*.spec.{ts,tsx}',
    '!frontend/*/src/main.tsx',
    '!frontend/*/src/vite-env.d.ts',
  ],

  coverageDirectory: '<rootDir>/coverage/frontend-integration',
  coverageReporters: ['text', 'lcov', 'html', 'json'],

  // カバレッジ閾値（統合テストは100%を要求しない）
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },

  // タイムアウト（AWS環境へのリクエストを考慮）
  testTimeout: 30000,

  // グローバル設定
  globals: {
    'ts-jest': {
      isolatedModules: true,
    },
  },

  // 無視するパターン
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/build/'],
  modulePathIgnorePatterns: ['<rootDir>/frontend/*/dist/', '<rootDir>/frontend/*/build/'],
};
