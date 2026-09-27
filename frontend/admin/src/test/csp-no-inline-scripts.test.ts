/**
 * CSP フェーズ1の前提を守るガードテスト
 *
 * Issue #680: `/admin/*` の CSP を script-src 'self' に絞るには、実行可能な
 * インラインスクリプト（src を持たない <script>）が admin の HTML に存在しない
 * ことが前提となる。
 *
 * - `index.html`（開発時に配信される元ファイル）を常にチェックする。
 * - `dist/index.html`（`bun run build` の成果物）が存在する場合は、Vite の
 *   base 書き換えを経た後も同じ前提が保たれていることも確認する。存在しない
 *   場合はこのケースをスキップする（このファイル自体は `bun run build` を
 *   要求しない）。CI では `bun run build` を実行するジョブと同じワークフロー
 *   内でこのテストも走るため、dist/ ビルド後の検証が抜け落ちることはない。
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { JSDOM } from 'jsdom';

const NON_EXECUTABLE_TYPES = new Set([
  'application/ld+json',
  'application/json',
  'importmap',
  'speculationrules',
]);

function findExecutableInlineScripts(html: string) {
  const dom = new JSDOM(html);
  const scripts = Array.from(dom.window.document.querySelectorAll('script'));
  return scripts.filter((el) => {
    if (el.hasAttribute('src')) return false;
    const type = (el.getAttribute('type') || '').toLowerCase().trim();
    if (type && NON_EXECUTABLE_TYPES.has(type)) return false;
    if (type && type !== 'text/javascript' && type !== 'module') return false;
    return (el.textContent || '').trim().length > 0;
  });
}

describe('CSP phase 1: no executable inline scripts in admin HTML', () => {
  it('index.html has no <script> without src', () => {
    const html = readFileSync(
      join(import.meta.dirname, '../../index.html'),
      'utf-8'
    );
    expect(findExecutableInlineScripts(html)).toEqual([]);
  });

  it('index.html still loads the theme scripts as external, blocking scripts', () => {
    const html = readFileSync(
      join(import.meta.dirname, '../../index.html'),
      'utf-8'
    );
    const dom = new JSDOM(html);
    const head = Array.from(
      dom.window.document.head.querySelectorAll('script')
    );
    const themeInit = head.find((el) =>
      (el.getAttribute('src') || '').includes('theme-init.js')
    );
    expect(themeInit).toBeDefined();
    expect(themeInit?.hasAttribute('defer')).toBe(false);
    expect(themeInit?.hasAttribute('async')).toBe(false);
    expect((themeInit?.getAttribute('type') || '').toLowerCase()).not.toBe(
      'module'
    );
  });

  it('dist/index.html (if built) has no <script> without src', () => {
    const distIndex = join(import.meta.dirname, '../../dist/index.html');
    if (!existsSync(distIndex)) {
      // `bun run build` was not run before this test; the build step in CI
      // (and the pre-commit/verify pipeline) covers this case separately.
      return;
    }
    const html = readFileSync(distIndex, 'utf-8');
    expect(findExecutableInlineScripts(html)).toEqual([]);
  });
});
