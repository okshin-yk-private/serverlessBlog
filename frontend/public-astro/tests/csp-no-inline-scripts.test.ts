/**
 * CSP フェーズ1の前提を守るガードテスト
 *
 * Issue #680: `/admin/*` と公開サイトの CSP を script-src 'self' に絞るには、
 * 実行可能なインラインスクリプト（src を持たない <script>、
 * type="application/ld+json" 以外）がビルド出力に存在しないことが前提となる。
 * このテストはビルド済みの dist/ を JSDOM でパースし、その前提が崩れていないかを
 * 検出する（Report-Only 期間中に違反が再発しないようにするための回帰防止）。
 *
 * Note: 事前に `tests/build-with-mock.sh` でビルドしてください:
 *   MOCK_PORT=3458 ./tests/build-with-mock.sh
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { JSDOM } from 'jsdom';

const distDir = join(import.meta.dirname, '../dist');

function listHtmlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...listHtmlFiles(full));
    } else if (entry.endsWith('.html')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * A <script> tag counts as "executable inline" (and therefore a CSP
 * script-src 'self' violation) when it has no `src` attribute and its
 * type is not a non-executable data block (application/ld+json, and the
 * other well-known non-executable script types).
 */
const NON_EXECUTABLE_TYPES = new Set([
  'application/ld+json',
  'application/json',
  'importmap',
  'speculationrules',
]);

function findExecutableInlineScripts(html: string, file: string) {
  const dom = new JSDOM(html);
  const scripts = Array.from(dom.window.document.querySelectorAll('script'));
  return scripts
    .filter((el) => {
      if (el.hasAttribute('src')) return false;
      const type = (el.getAttribute('type') || '').toLowerCase().trim();
      if (type && NON_EXECUTABLE_TYPES.has(type)) return false;
      // No type attribute defaults to text/javascript (executable).
      if (type && type !== 'text/javascript' && type !== 'module') {
        // Unknown non-JS type (e.g. text/template) — not executable.
        return false;
      }
      return el.textContent !== null && el.textContent.trim().length > 0;
    })
    .map((el) => ({
      file: relative(distDir, file),
      snippet: (el.textContent || '').trim().slice(0, 120),
    }));
}

describe('CSP phase 1: no executable inline scripts in the public-site build', () => {
  beforeAll(() => {
    if (!existsSync(distDir)) {
      throw new Error(
        'dist/ directory not found. Run "MOCK_PORT=3458 ./tests/build-with-mock.sh" first.'
      );
    }
  });

  it('has no <script> without src, other than JSON-LD/data blocks', () => {
    const htmlFiles = listHtmlFiles(distDir);
    expect(htmlFiles.length).toBeGreaterThan(0);

    const violations = htmlFiles.flatMap((file) =>
      findExecutableInlineScripts(readFileSync(file, 'utf-8'), file)
    );

    expect(violations).toEqual([]);
  });

  it('still loads the FOUC-prevention theme scripts as external, blocking scripts', () => {
    const indexHtml = readFileSync(join(distDir, 'index.html'), 'utf-8');
    const dom = new JSDOM(indexHtml);
    const headScripts = Array.from(
      dom.window.document.head.querySelectorAll('script')
    );
    const themeInit = headScripts.find((el) =>
      (el.getAttribute('src') || '').includes('theme-init.js')
    );
    expect(themeInit).toBeDefined();
    // Must stay a classic, render-blocking script: no defer/async/module.
    expect(themeInit?.hasAttribute('defer')).toBe(false);
    expect(themeInit?.hasAttribute('async')).toBe(false);
    expect((themeInit?.getAttribute('type') || '').toLowerCase()).not.toBe(
      'module'
    );
  });
});
