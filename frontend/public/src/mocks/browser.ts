/**
 * MSW Browser Worker
 *
 * ブラウザ環境でのMSWワーカー設定
 * E2Eテスト時にバックエンドAPIをモックする
 *
 * Requirements:
 * - R43: Playwright E2Eテスト
 * - R44: テストデータ管理
 */

import { setupWorker } from 'msw/browser';
import { handlers } from '../../../../tests/e2e/mocks/handlers';

// MSWブラウザワーカーを作成
export const worker = setupWorker(...handlers);
