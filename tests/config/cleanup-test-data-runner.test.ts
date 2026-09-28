import { describe, expect, test } from 'bun:test';
import { runCleanup } from '../e2e/utils/cleanupRunner';
import type { CleanupHttpClient } from '../e2e/utils/awsCleanup';

// Issue #737: cleanup-test-data.ts の --dry-run は「何を消すか表示するだけで
// DELETE を発行しない」ことが要件。ログイン (実ブラウザ) を挟まずに済むよう、
// ID トークン取得後の処理 (runCleanup) を injected fetch 相当の
// CleanupHttpClient で直接テストする。

const API = 'https://example.cloudfront.net/api';

type Route = { status: number; body?: unknown };

function fakeHttp(routes: Record<string, Route>) {
  const calls: { method: string; url: string }[] = [];
  const respond = (method: string, url: string) => {
    calls.push({ method, url });
    const route = routes[`${method} ${url}`] ?? { status: 404 };
    return Promise.resolve({
      ok: () => route.status >= 200 && route.status < 300,
      status: () => route.status,
      json: () => Promise.resolve(route.body),
    });
  };
  const http: CleanupHttpClient = {
    get: (url) => respond('GET', url),
    delete: (url) => respond('DELETE', url),
  };
  return { http, calls };
}

const list = (status: string) =>
  `GET ${API}/admin/posts?publishStatus=${status}&limit=100`;

function routes(overrides: Record<string, Route> = {}) {
  return {
    [list('draft')]: {
      status: 200,
      body: { items: [{ id: 'd1', title: '[E2E-TEST] draft' }] },
    },
    [list('published')]: {
      status: 200,
      body: { items: [{ id: 'p1', title: '[E2E-TEST] published' }] },
    },
    [`GET ${API}/categories`]: {
      status: 200,
      body: [{ id: 'c1', name: '[E2E-TEST] cat' }],
    },
    [`DELETE ${API}/admin/posts/d1`]: { status: 204 },
    [`DELETE ${API}/admin/posts/p1`]: { status: 204 },
    [`DELETE ${API}/admin/categories/c1`]: { status: 204 },
    ...overrides,
  };
}

describe('runCleanup', () => {
  test('dry-run reports targets without issuing any DELETE', async () => {
    const { http, calls } = fakeHttp(routes());

    const report = await runCleanup({
      http,
      apiBase: API,
      idToken: 't',
      dryRun: true,
    });

    expect(report.dryRun).toBe(true);
    expect(report.posts).toEqual(['[E2E-TEST] draft', '[E2E-TEST] published']);
    expect(report.categories).toEqual(['[E2E-TEST] cat']);
    expect(report.failures).toEqual([]);
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);
  });

  test('live run delegates to cleanupE2ETestData and does delete', async () => {
    const { http, calls } = fakeHttp(routes());

    const report = await runCleanup({
      http,
      apiBase: API,
      idToken: 't',
      dryRun: false,
    });

    expect(report.dryRun).toBe(false);
    expect(report.posts).toEqual(['[E2E-TEST] draft', '[E2E-TEST] published']);
    expect(report.categories).toEqual(['[E2E-TEST] cat']);
    expect(calls.filter((c) => c.method === 'DELETE').length).toBe(3);
  });
});
