/**
 * 統合テスト用Vitest設定
 *
 * ビルド出力テストなど、dist/ ディレクトリを検証するテストに使用。
 * 事前に `tests/build-with-mock.sh` でビルドを実行してください。
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 統合テストのみを含める
    include: ['tests/**/*.test.ts'],
    exclude: ['src/**/*.test.ts'],
    globals: true,
    environment: 'node',
    // 並列実行しない（dist/ への依存があるため）
    maxConcurrency: 1,
    // タイムアウトを長めに設定
    testTimeout: 30000,
  },
});
