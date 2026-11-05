import { afterEach, describe, expect, test } from 'bun:test';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  openSync,
  ftruncateSync,
  closeSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0))
    rmSync(folder, { recursive: true, force: true });
});

function fixture() {
  const folder = mkdtempSync(join(tmpdir(), 'public-budget-'));
  folders.push(folder);
  writeFileSync(
    join(folder, 'index.html'),
    '<!doctype html><title>Fixture</title>'
  );
  return folder;
}

function validate(folder: string) {
  return spawnSync(
    process.execPath,
    [
      'run',
      'frontend/public-astro/scripts/validate-build.ts',
      '--dist',
      folder,
    ],
    { encoding: 'utf8' }
  );
}

describe('public build budget executable gate', () => {
  test('accepts a small static site', () => {
    expect(validate(fixture()).status).toBe(0);
  });

  test('rejects gzip JavaScript above the existing 50 KiB budget', () => {
    const folder = fixture();
    writeFileSync(join(folder, 'oversized.js'), randomBytes(60 * 1024));
    const result = validate(folder);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('JavaScript bundle size (gzip:');
  });

  test('rejects a site above the existing 50 MiB total budget', () => {
    const folder = fixture();
    const file = openSync(join(folder, 'oversized.bin'), 'w');
    try {
      ftruncateSync(file, 51 * 1024 * 1024);
    } finally {
      closeSync(file);
    }
    const result = validate(folder);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Total static size');
  });

  test('PR and deployment enforce the gate before publishing artifacts', () => {
    for (const [file, jobName, artifact] of [
      ['ci.yml', 'frontend-astro-tests', 'Upload Astro build output'],
      ['deploy.yml', 'build-astro', 'Upload build artifact'],
    ]) {
      const workflow = readFileSync(`.github/workflows/${file}`, 'utf8');
      const job = workflow
        .split(`\n  ${jobName}:\n`)[1]
        .split(/\n {2}[\w-]+:\n/)[0];
      const budget = job.indexOf('bun run validate:build');
      expect(budget).toBeGreaterThan(0);
      expect(budget).toBeLessThan(job.indexOf(artifact));
    }
  });
});

describe('Astro cache isolation', () => {
  test('dependencies exclude generated caches and image restore stays within its source/config scope', () => {
    const dependencies = readFileSync(
      '.github/actions/setup-bun-deps/action.yml',
      'utf8'
    );
    const images = readFileSync(
      '.github/actions/cache-astro-images/action.yml',
      'utf8'
    );
    expect(dependencies).toContain(
      '!${{ inputs.working-directory }}/node_modules/.astro'
    );
    expect(dependencies).toContain('key: bun-deps-v3-');
    expect(images).toContain(
      'path: frontend/public-astro/node_modules/.astro/assets'
    );
    const save = images.match(/key: (.+)/)?.[1];
    const restore = images.split('restore-keys: |\n')[1].trim();
    expect(save).toBe(
      `${restore}${'${{ github.run_id }}'}-${'${{ github.run_attempt }}'}`
    );
    expect(restore).toContain('${{ inputs.scope }}');
    expect(restore).toContain('frontend/public-astro/bun.lock');
    expect(restore).toContain('frontend/public-astro/astro.config.mjs');
    expect(readFileSync('.github/workflows/ci.yml', 'utf8')).toContain(
      'scope: fixtures'
    );
    expect(readFileSync('.github/workflows/deploy.yml', 'utf8')).toContain(
      'scope: ${{ needs.detect-changes.outputs.target-env }}'
    );
  });
});
