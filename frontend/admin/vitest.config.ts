import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // ローカル実行時の負荷軽減: ワーカー数を制限
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: process.env.CI ? 4 : 2,
      },
    },
    env: {
      // 単体テスト環境では VITE_ENABLE_MSW_MOCK を未設定にして、Amplifyモックを使用
      VITE_ENABLE_MSW_MOCK: undefined as string | undefined,
    },
    coverage: {
      provider: 'v8',
      // ローカル実行時はtextのみ、CI実行時は全種類を生成
      reporter: process.env.CI
        ? ['text', 'json', 'json-summary', 'html', 'lcov']
        : ['text'],
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
