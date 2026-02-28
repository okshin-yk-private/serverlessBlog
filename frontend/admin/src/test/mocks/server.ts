import { setupServer } from 'msw/node';
import { handlers } from './handlers';

// MSWサーバーのセットアップ
export const server = setupServer(...handlers);

// テストの前後でサーバーを起動/停止
import { beforeAll, afterAll, afterEach } from 'vitest';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
