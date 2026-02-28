import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import './mocks/server';

// 各テスト後にクリーンアップ
afterEach(() => {
  cleanup();
});
