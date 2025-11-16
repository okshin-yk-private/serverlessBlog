/**
 * Frontend Integration Tests Setup
 *
 * このファイルは、フロントエンド統合テストのセットアップを行います。
 * 実際のAWS環境に対してテストを実行するため、MSWモックは使用しません。
 */

import '@testing-library/jest-dom';

// グローバル環境変数の設定
process.env.VITE_API_ENDPOINT =
  process.env.VITE_API_ENDPOINT || 'http://localhost:3000';
process.env.VITE_CLOUDFRONT_URL =
  process.env.VITE_CLOUDFRONT_URL || 'http://localhost:3000';
process.env.TEST_ENVIRONMENT = process.env.TEST_ENVIRONMENT || 'dev';

// MSWモックを無効化（実AWS環境に対してテスト）
process.env.VITE_ENABLE_MSW_MOCK = 'false';

// テストタイムアウトの設定
jest.setTimeout(30000);

// コンソール出力の抑制（必要に応じて）
if (process.env.CI) {
  global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

// グローバルテストユーティリティ
beforeAll(() => {
  console.log('🚀 フロントエンド統合テストを開始します');
  console.log(`環境: ${process.env.TEST_ENVIRONMENT}`);
  console.log(`API Endpoint: ${process.env.VITE_API_ENDPOINT}`);
  console.log(`CloudFront URL: ${process.env.VITE_CLOUDFRONT_URL}`);
});

afterAll(() => {
  console.log('✅ フロントエンド統合テストが完了しました');
});
