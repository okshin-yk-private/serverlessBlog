import { afterEach, expect, test } from 'bun:test';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true });
});
function fixture() {
  const folder = mkdtempSync(join(tmpdir(), 'admin-budget-'));
  folders.push(folder);
  mkdirSync(join(folder, '.vite'));
  const manifest = {
    'index.html': {
      file: 'entry.js',
      isEntry: true,
      imports: ['shared'],
      css: ['style.css'],
      dynamicImports: ['editor'],
    },
    'src/pages/LoginPage.tsx': { file: 'login.js', imports: ['shared'] },
    shared: { file: 'shared.js', imports: ['index.html'] },
    editor: { file: 'editor.js' },
  };
  for (const file of ['entry.js', 'login.js', 'shared.js', 'style.css'])
    writeFileSync(join(folder, file), 'fixture');
  // An unrelated lazy page must not consume the login budget.
  writeFileSync(join(folder, 'editor.js'), randomBytes(200 * 1024));
  return { folder, manifest };
}
function check({ folder, manifest }: ReturnType<typeof fixture>) {
  writeFileSync(join(folder, '.vite/manifest.json'), JSON.stringify(manifest));
  return spawnSync(
    process.execPath,
    ['frontend/admin/scripts/verify-budget.mjs', folder],
    { encoding: 'utf8' }
  );
}
test('deduplicates shared/cyclic imports and excludes unrelated lazy pages', () => {
  const data = fixture();
  writeFileSync(join(data.folder, 'shared.js'), randomBytes(100 * 1024));
  const result = check(data);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('(3 files)');
});
test('rejects oversized initial JavaScript', () => {
  const data = fixture();
  writeFileSync(join(data.folder, 'entry.js'), randomBytes(181 * 1024));
  expect(check(data).stderr).toContain('JavaScript exceeds budget');
});
test('rejects oversized initial CSS', () => {
  const data = fixture();
  writeFileSync(join(data.folder, 'style.css'), randomBytes(191 * 1024));
  expect(check(data).stderr).toContain('CSS exceeds budget');
});
test('fails closed on missing chunks, missing assets, malformed imports and paths outside dist', () => {
  for (const mutation of [
    (data: ReturnType<typeof fixture>) => {
      data.manifest['index.html'].imports = ['missing'];
    },
    (data: ReturnType<typeof fixture>) => {
      data.manifest['src/pages/LoginPage.tsx'].file = 'missing.js';
    },
    (data: ReturnType<typeof fixture>) => {
      data.manifest['index.html'].imports = 'shared' as unknown as string[];
    },
    (data: ReturnType<typeof fixture>) => {
      data.manifest['index.html'].file = '../missing.js';
    },
  ]) {
    const data = fixture();
    mutation(data);
    expect(check(data).status).toBe(1);
  }
});
test('checks production assets in PR CI and before deploy upload', () => {
  const ci = readFileSync('.github/workflows/ci-secure.yml', 'utf8')
    .split('\n  frontend-admin-tests:\n')[1]
    .split('\n  e2e-public-tests:')[0];
  expect(ci).toContain('bun scripts/verify-budget.mjs');
  expect(ci).toContain('bun scripts/verify-bundle.mjs');
  const deploy = readFileSync('.github/workflows/deploy.yml', 'utf8')
    .split('\n  build-frontend-admin:\n')[1]
    .split('\n  deploy-admin-dev:')[0];
  expect(deploy.indexOf('bun run verify:budget')).toBeGreaterThan(0);
  expect(deploy.indexOf('bun run verify:budget')).toBeLessThan(
    deploy.indexOf('uses: actions/upload-artifact')
  );
});
