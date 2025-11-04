/**
 * Vitest Setup File
 *
 * React Testing LibraryとJest DOMの設定
 */

import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// 各テスト後にクリーンアップ
afterEach(() => {
  cleanup();
});
