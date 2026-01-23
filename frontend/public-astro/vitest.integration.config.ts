/**
 * 統合テスト用Vitest設定
 *
 * ビルド出力テストなど、dist/ ディレクトリを検証するテストに使用。
 * 事前に `bun run build` でビルドを実行してください。
 *
 * 使用方法:
 *   bun run test:integration
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // 統合テスト：tests/ ディレクトリとパフォーマンス検証テスト
    // Task 8.2: SEO統合テスト、CodeBuildトリガー連携テストを追加
    include: ['tests/**/*.test.ts', 'src/lib/performanceValidation.test.ts'],
    exclude: [],
    globals: true,
    environment: 'node',
    // 並列実行しない（dist/ への依存があるため）
    maxConcurrency: 1,
    // タイムアウトを長めに設定
    testTimeout: 30000,
    // 統合テストモードを有効化
    env: {
      VITEST_INTEGRATION: 'true',
    },
  },
});
