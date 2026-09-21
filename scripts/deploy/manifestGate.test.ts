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
import timers from 'node:timers';
import { syncBuiltinESMExports } from 'node:module';
// Advance only retry delays; the production watchdog remains a real timer.
const realSetTimeout = timers.setTimeout;
let now = Date.now();
Date.now = () => now;
timers.setTimeout = (callback, ms, ...args) => ms <= 2000
  ? realSetTimeout(() => { now += ms; callback(...args); }, 0)
  : realSetTimeout(callback, ms, ...args);
syncBuiltinESMExports();
let calls = 0;
process.on('exit', () => console.log('fixtureCalls=' + calls));
globalThis.fetch = async (url, options) => {
  if (String(url) !== 'https://site.test/release-manifest.json' || options.redirect !== 'error') throw Error('bad request');
  calls++;
  let mode = process.env.FIXTURE_MODE;
  if (mode.startsWith('recover-')) mode = calls < 3 ? mode.slice(8) : 'success';
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
    ['success', ''],
    ['missing', 'httpStatus:404'],
    ['old', 'revisionMismatch'],
    ['schema', 'invalidSchema'],
    ['empty', 'invalidSchema'],
    ['malformed', 'invalidJSON'],
    ['network', 'requestFailed'],
    ['redirect', 'httpStatus:302'],
    ['recover-missing', 'httpStatus:404'],
    ['recover-old', 'revisionMismatch'],
    ['recover-network', 'requestFailed'],
  ])('%s response', (mode, reason) => {
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
    const succeeds = mode === 'success' || mode.startsWith('recover-');
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(succeeds ? 0 : 1);
    expect(result.stdout.includes('Public manifest confirmed')).toBe(succeeds);
    expect(result.stderr).not.toContain('DO_NOT_LOG');
    if (reason) expect(result.stderr).toContain(`reason=${reason}`);
    expect(result.stdout).toContain(
      `fixtureCalls=${mode === 'success' ? 1 : succeeds ? 3 : 45}`
    );
    if (!succeeds) expect(result.stderr).toContain('verification failed');
  });
});
