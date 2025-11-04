import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/test/',
        'dist/',
        '**/*.config.{js,ts}',
        'src/main.tsx',
        'src/App.tsx',
        // 'src/pages/**', // Task 6.1, 6.2, 6.3, 6.4でLoginPage, DashboardPage, PostCreatePage, PostEditPage, PostListPageのカバレッジを測定するため一時的にコメントアウト
        // 'src/pages/DashboardPage.tsx', // Task 6.2で追加
        // 'src/pages/PostCreatePage.tsx', // Task 6.3で追加
        // 'src/pages/PostEditPage.tsx', // Task 6.4で追加
        // 'src/pages/PostListPage.tsx', // Task 6.4で追加
        'src/config/**', // Amplify設定など
        'src/api/**', // API関数はMSWでモック
        'src/mocks/**', // MSWのモック設定
        'public/**', // MSWのmockServiceWorker.jsなど
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
