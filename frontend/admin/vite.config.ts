import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // CloudFrontで /admin/ パスで配信するため、base を設定
  base: '/admin/',
  css: {
    postcss: {
      plugins: [tailwindcss()],
    },
  },
  build: {
    rollupOptions: {
      // MSWと関連する依存関係を外部化（プロダクションビルドから除外）
      external: (id) => {
        // MSW関連のモジュールを外部化
        if (id.includes('msw')) return true;
        // tests/e2e/mocksディレクトリのファイルを外部化
        if (id.includes('tests/e2e/mocks')) return true;
        // src/mocksディレクトリのファイルを外部化（テスト専用）
        if (id.includes('src/mocks')) return true;
        return false;
      },
    },
  },
  server: {
    port: 3001,
    headers: {
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;",
    },
  },
});
