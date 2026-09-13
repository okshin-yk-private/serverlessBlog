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

  it('features the newest article with one h1 and preserves every article in the archive', () => {
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(
      document.querySelector('[data-testid="feature-article"] h1')?.textContent
    ).toBe('日本語タイトルの記事');
    expect(
      document.querySelector('[data-testid="aside-article"] h2')?.textContent
    ).toBe('テスト記事1');
    const rows = [...document.querySelectorAll('#article-records article')];
    expect(rows.map((row) => row.getAttribute('data-post-id'))).toEqual([
      'post-2',
      'post-1',
    ]);
    expect(
      rows.map((row) => row.querySelector('h3 a')?.getAttribute('href'))
    ).toEqual(['/posts/post-2/', '/posts/post-1/']);
    expect(
      document
        .querySelector('[data-testid="feature-article"]')
        ?.hasAttribute('data-post-id')
    ).toBe(false);
  });

  it('keeps the full archive available without JavaScript and gives search an accessible label', () => {
    expect(
      document.querySelectorAll('#article-records article[hidden]')
    ).toHaveLength(0);
    expect(
      document.querySelector('label[for="search-input"]')?.textContent
    ).toContain('タイトル');
    expect(
      document.querySelectorAll('[data-search-control]:not([hidden])')
    ).toHaveLength(0);
    expect(document.querySelectorAll('[data-category]')).toHaveLength(3);
    expect(
      JSON.parse(document.querySelector('#search-data')!.textContent!)
    ).toHaveLength(2);
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
