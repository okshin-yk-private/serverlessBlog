/**
 * robots.txt エンドポイントのユニットテスト
 */
import { describe, it, expect } from 'vitest';
import type { APIContext } from 'astro';
import { GET } from '../robots.txt';

function createContext(site: string | undefined): APIContext {
  return {
    site: site ? new URL(site) : undefined,
  } as APIContext;
}

describe('robots.txt endpoint', () => {
  it('text/plain で全クローラー許可のルールを返す', async () => {
    const response = GET(createContext('https://blog.example.jp'));

    expect(response.headers.get('Content-Type')).toBe(
      'text/plain; charset=utf-8'
    );

    const body = await response.text();
    expect(body).toContain('User-agent: *');
    expect(body).toContain('Allow: /');
  });

  it('Sitemap は site 設定ベースの sitemap-index.xml を指す', async () => {
    const response = GET(createContext('https://blog.example.jp'));
    const body = await response.text();

    expect(body).toContain(
      'Sitemap: https://blog.example.jp/sitemap-index.xml'
    );
  });

  it('site 末尾のスラッシュを二重にしない', async () => {
    const response = GET(createContext('https://blog.example.jp/'));
    const body = await response.text();

    expect(body).toContain(
      'Sitemap: https://blog.example.jp/sitemap-index.xml'
    );
    expect(body).not.toContain('//sitemap-index.xml');
  });
});
