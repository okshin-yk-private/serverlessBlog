import { afterEach, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true });
});
const marker = 'Amplify has not been configured';
function check(chunks: string[], config = 'pool-fixture client-fixture') {
  const folder = mkdtempSync(join(tmpdir(), 'admin-bundle-'));
  folders.push(folder);
  mkdirSync(join(folder, 'assets'));
  for (const [i, chunk] of [config, ...chunks].entries())
    writeFileSync(join(folder, 'assets', `${i}.js`), chunk);
  return spawnSync(
    process.execPath,
    ['frontend/admin/scripts/verify-bundle.mjs', folder],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        VITE_COGNITO_USER_POOL_ID: 'pool-fixture',
        VITE_COGNITO_USER_POOL_CLIENT_ID: 'client-fixture',
      },
    }
  );
}
test('accepts configuration and singleton in separate chunks', () => {
  expect(check([marker]).status).toBe(0);
});
test('rejects duplicates within one chunk', () => {
  expect(check([marker + marker]).status).toBe(1);
});
test('rejects duplicates across chunks', () => {
  const result = check([marker, marker]);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('across bundles (2)');
});
test('rejects missing marker after upstream changes', () => {
  expect(check(['unrelated']).status).toBe(1);
});
test('rejects missing embedded config', () => {
  expect(check([marker], 'pool-fixture').status).toBe(1);
});
