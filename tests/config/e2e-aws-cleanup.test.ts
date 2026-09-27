import { describe, test, expect } from 'bun:test';
import {
  cleanupE2ETestData,
  type CleanupHttpClient,
} from '../e2e/utils/awsCleanup';

/**
 * Unit tests for tests/e2e/utils/awsCleanup.ts (global-teardown の AWS 掃除)
 *
 * 旧 teardown は publishStatus 未指定 (= published のみ) の 1 ページしか見ず、
 * 下書きや 101 件目以降の [E2E-TEST] 記事を取りこぼしていた。
 */

const API = 'https://example.cloudfront.net/api';

type Route = { status: number; body?: unknown };

function fakeHttp(routes: Record<string, Route>) {
  const calls: { method: string; url: string; auth?: string }[] = [];
  const respond = (method: string, url: string, auth?: string) => {
    calls.push({ method, url, auth });
    const route = routes[`${method} ${url}`] ?? { status: 404 };
    return Promise.resolve({
      ok: () => route.status >= 200 && route.status < 300,
      status: () => route.status,
      json: () => Promise.resolve(route.body),
    });
  };
  const http: CleanupHttpClient = {
    get: (url, o) => respond('GET', url, o?.headers?.Authorization),
    delete: (url, o) => respond('DELETE', url, o?.headers?.Authorization),
  };
  return { http, calls };
}

const list = (status: string, token?: string) =>
  `GET ${API}/admin/posts?publishStatus=${status}&limit=100` +
  (token ? `&nextToken=${token}` : '');

describe('cleanupE2ETestData', () => {
  test('deletes [E2E-TEST] drafts and published posts across pages, then categories', async () => {
    const { http, calls } = fakeHttp({
      [list('draft')]: {
        status: 200,
        body: {
          items: [
            { id: 'd1', title: '[E2E-TEST] draft' },
            { id: 'keep', title: 'Real draft' },
          ],
          nextToken: 'abc',
        },
      },
      [list('draft', 'abc')]: {
        status: 200,
        body: { items: [{ id: 'd2', title: '[E2E-TEST] draft 2' }] },
      },
      [list('published')]: {
        status: 200,
        body: { items: [{ id: 'p1', title: '[E2E-TEST] published' }] },
      },
      [`DELETE ${API}/admin/posts/d1`]: { status: 204 },
      [`DELETE ${API}/admin/posts/d2`]: { status: 204 },
      [`DELETE ${API}/admin/posts/p1`]: { status: 204 },
      [`GET ${API}/categories`]: {
        status: 200,
        body: [
          { id: 'c1', name: '[E2E-TEST] cat' },
          { id: 'c2', name: 'Tech' },
        ],
      },
      [`DELETE ${API}/admin/categories/c1`]: { status: 204 },
    });

    const result = await cleanupE2ETestData(http, API, 'id-token');

    expect(result.deletedPosts).toEqual([
      '[E2E-TEST] draft',
      '[E2E-TEST] draft 2',
      '[E2E-TEST] published',
    ]);
    expect(result.deletedCategories).toEqual(['[E2E-TEST] cat']);
    expect(result.failures).toEqual([]);

    const deletes = calls.filter((c) => c.method === 'DELETE');
    expect(deletes.map((c) => c.url)).not.toContain(`${API}/admin/posts/keep`);
    expect(deletes.every((c) => c.auth === 'Bearer id-token')).toBe(true);
    // 記事を消してからカテゴリを消す
    expect(deletes.at(-1)?.url).toBe(`${API}/admin/categories/c1`);
  });

  test('collects individual delete failures and keeps going', async () => {
    const { http } = fakeHttp({
      [list('draft')]: {
        status: 200,
        body: {
          items: [
            { id: 'x', title: '[E2E-TEST] a' },
            { id: 'y', title: '[E2E-TEST] b' },
          ],
        },
      },
      [list('published')]: { status: 200, body: { items: [] } },
      [`DELETE ${API}/admin/posts/x`]: { status: 403 },
      [`DELETE ${API}/admin/posts/y`]: { status: 204 },
      [`GET ${API}/categories`]: { status: 200, body: [] },
    });

    const result = await cleanupE2ETestData(http, API, 't');

    expect(result.deletedPosts).toEqual(['[E2E-TEST] b']);
    expect(result.failures).toEqual(['post x: 403']);
  });

  test('throws when the post list is rejected instead of reporting nothing to clean', async () => {
    const { http } = fakeHttp({ [list('draft')]: { status: 401 } });

    await expect(cleanupE2ETestData(http, API, 'expired')).rejects.toThrow(
      'returned 401'
    );
  });
});
