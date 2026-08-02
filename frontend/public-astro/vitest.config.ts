import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // ユニットテストのみを含める（ビルド統合テストを除外）
    include: ['src/**/*.test.ts'],
    exclude: ['tests/**/*.test.ts'],
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/lib/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      thresholds: {
        // Regression floor, not an aspirational target. Measured on 2026-08-02
        // (356 tests / 14 files): statements 96.95%, branches 97.26%,
        // functions 100%, lines 96.81%. Thresholds set a few points below
        // the measured values; re-measure with `bun run test:coverage` and
        // adjust if coverage legitimately grows.
        statements: 95,
        branches: 95,
        functions: 95,
        lines: 95,
      },
    },
  },
});
