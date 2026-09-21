import { afterAll, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const fixture = mkdtempSync(join(tmpdir(), 'manifest-gate-'));
const preload = join(fixture, 'fetch.mjs');
writeFileSync(
  preload,
  `
globalThis.fetch = async (url, options) => {
  if (String(url) !== 'https://site.test/release-manifest.json' || options.redirect !== 'error') throw Error('bad request');
  const mode = process.env.FIXTURE_MODE;
  if (mode === 'network') throw Error('Authorization: DO_NOT_LOG');
  const body = mode === 'malformed' ? '{' : JSON.stringify({
    schemaVersion: mode === 'schema' ? 2 : 1,
    revision: mode === 'old' ? 'r10-old' : 'r20-test',
    files: mode === 'empty' ? [] : [{ path: 'index.html' }],
  });
  return new Response(body, { status: mode === 'missing' ? 404 : mode === 'redirect' ? 302 : 200 });
};
`
);
afterAll(() => rmSync(fixture, { recursive: true, force: true }));

describe('independent public manifest gate', () => {
  test.each([
    'success',
    'missing',
    'old',
    'schema',
    'empty',
    'malformed',
    'network',
    'redirect',
  ])('%s response', (mode) => {
    const result = spawnSync(
      'node',
      [
        '--import',
        preload,
        fileURLToPath(new URL('./verify-public-manifest.mjs', import.meta.url)),
        'https://site.test',
        'r20-test',
      ],
      {
        encoding: 'utf8',
        timeout: 3000,
        env: {
          ...process.env,
          FIXTURE_MODE: mode,
          SITE_VERIFY_BASIC_USER: '',
          SITE_VERIFY_BASIC_PASSWORD: '',
        },
      }
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(mode === 'success' ? 0 : 1);
    expect(result.stdout.includes('Public manifest confirmed')).toBe(
      mode === 'success'
    );
    expect(result.stderr).not.toContain('DO_NOT_LOG');
  });
});
