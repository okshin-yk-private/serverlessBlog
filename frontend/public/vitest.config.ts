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

    // 100%カバレッジ閾値の強制
    coverage: {
      provider: 'v8',
      reporter: ['html', 'json', 'lcov', 'text'],
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
