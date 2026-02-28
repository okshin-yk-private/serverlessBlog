import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['atomicDeploy.ts'],
      exclude: ['cli.ts', '**/*.test.ts'],
      thresholds: {
        // Lower thresholds for deployment script since AWS SDK calls are mocked
        // Core utility functions have 100% coverage
        statements: 75,
        branches: 55,
        functions: 90,
        lines: 75,
      },
    },
  },
});
