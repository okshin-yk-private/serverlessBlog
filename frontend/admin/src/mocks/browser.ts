/**
 * MSW Browser Worker
 *
 * ブラウザ環境でのMSWワーカー設定（管理画面）
 * E2Eテスト時にバックエンドAPIをモックする
 *
 * Requirements:
 * - R43: Playwright E2Eテスト
 * - R44: テストデータ管理
 */

import { setupWorker } from 'msw/browser';
import { handlers } from '../../../../tests/e2e/mocks/handlers';

// MSWブラウザワーカーを作成
// @ts-expect-error - MSW version mismatch between browser and handlers
export const worker = setupWorker(...handlers);
