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
    },
  },
});
