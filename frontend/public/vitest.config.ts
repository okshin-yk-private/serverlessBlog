/**
 * Vitest Configuration for Public Blog Site
 *
 * Requirement R41: フロントエンドのテストカバレッジを100%にする
 * Requirement R45: CI/CDパイプラインでテストを自動実行する
 */

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    css: true,
    // ローカル実行時の負荷軽減: ワーカー数を制限
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: process.env.CI ? 4 : 2,
      },
    },

    // 100%カバレッジ閾値の強制
    coverage: {
      provider: 'v8',
      // ローカル実行時はtextのみ、CI実行時は全種類を生成
      reporter: process.env.CI
        ? ['html', 'json', 'json-summary', 'lcov', 'text']
        : ['text'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.config.{js,ts}',
        '**/*.d.ts',
        '**/index.tsx',
        '**/main.tsx',
        '**/*.stories.tsx',
        'vitest.setup.ts',
        'src/types/**',
        // テストインフラ - MSW関連
        'public/**',
        'src/mocks/**',
      ],
      all: true,
      thresholds: {
        branches: 100,
        functions: 100,
        lines: 100,
        statements: 100,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
