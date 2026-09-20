// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dist = join(import.meta.dirname, '../dist');

describe('editorial home built against the local mock API', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = readFileSync(
      join(dist, 'index.html'),
      'utf8'
    );
  });

  it('separates Home from the complete searchable Articles collection', () => {
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(
      document.querySelectorAll('[data-testid="feature-article"]')
    ).toHaveLength(1);
    expect(
      document.querySelector('[data-testid="feature-article"] h2')?.textContent
    ).toBe('日本語タイトルの記事');
    expect(document.querySelector('#intro-title')).not.toBeNull();
    expect(document.querySelector('#search-input')).toBeNull();
    expect(
      document.querySelector('a[aria-current="page"]')?.getAttribute('href')
    ).toBe('/');
    document.documentElement.innerHTML = readFileSync(
      join(dist, 'articles/index.html'),
      'utf8'
    );
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(document.querySelector('#intro-title')).toBeNull();
    expect(
      document.querySelector('a[aria-current="page"]')?.getAttribute('href')
    ).toBe('/articles/');
    const rows = [...document.querySelectorAll('#article-records article')];
    expect(rows.map((row) => row.getAttribute('data-post-id'))).toEqual([
      'post-2',
      'post-1',
    ]);
    expect(
      rows.map((row) => row.querySelector('h3 a')?.getAttribute('href'))
    ).toEqual(['/posts/post-2/', '/posts/post-1/']);
    expect(
      document.querySelector('link[rel="canonical"]')?.getAttribute('href')
    ).toBe('https://example.com/articles/');
    const calendar = JSON.parse(
      document.querySelector('#calendar-data')!.textContent!
    );
    expect(calendar.counts).toEqual({ '2024-01-01': 1, '2024-01-02': 1 });
  });

  it('keeps every article available without JavaScript and labels search and dates', () => {
    document.documentElement.innerHTML = readFileSync(
      join(dist, 'articles/index.html'),
      'utf8'
    );
    expect(
      document.querySelectorAll('#article-records article[hidden]')
    ).toHaveLength(0);
    expect(
      document.querySelector('label[for="search-input"]')?.textContent
    ).toContain('Search by title');
    expect(
      document.querySelector('#archive-search')?.hasAttribute('data-ready')
    ).toBe(false);
    expect(
      document.querySelectorAll('.calendar-fallback-mobile .calendar-week')
        .length
    ).toBeGreaterThan(0);
    expect(document.querySelectorAll('[data-category]')).toHaveLength(3);
    const data = JSON.parse(
      document.querySelector('#search-data')!.textContent!
    );
    expect(data).toHaveLength(2);
    expect(
      data.map((p: { publicationDay: string }) => p.publicationDay)
    ).toEqual(['2024-01-02', '2024-01-01']);
  });

  it('emits self-hosted Japanese font chunks and their licenses', () => {
    const assets = readdirSync(join(dist, '_astro'));
    expect(
      assets.some(
        (name) =>
          name.startsWith('zen-kaku-gothic-new') && name.endsWith('.woff2')
      )
    ).toBe(true);
    expect(
      assets.some(
        (name) => name.startsWith('zen-old-mincho') && name.endsWith('.woff2')
      )
    ).toBe(true);
    for (const name of ['zen-kaku-gothic-new', 'zen-old-mincho']) {
      expect(existsSync(join(dist, 'fonts/licenses', `${name}.txt`))).toBe(
        true
      );
    }
    const css = assets
      .filter((name) => name.endsWith('.css'))
      .map((name) => readFileSync(join(dist, '_astro', name), 'utf8'))
      .join('\n');
    expect(css).toContain('unicode-range:');
    expect(css).toContain('font-display:swap');
    expect(css).not.toContain('fonts.googleapis.com');
    expect(css).not.toContain('fonts.gstatic.com');
    expect(css).not.toMatch(/url\(["']?data:(?:font|application\/font)/);
  });
});
