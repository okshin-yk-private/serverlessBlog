import { afterAll, describe, expect, test } from 'vitest';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Execute the actual CLI sources in fresh Node/Bun processes. Only the operation
// modules are fixtures; no AWS client or network request is created.
const fixture = mkdtempSync(join(tmpdir(), 'deploy-cli-lifecycle-'));
writeFileSync(join(fixture, 'package.json'), '{"type":"module"}');
symlinkSync(
  fileURLToPath(new URL('./node_modules', import.meta.url)),
  join(fixture, 'node_modules')
);
for (const file of ['cli.ts', 'astroLocalDeployCli.ts', 'runCli.ts']) {
  writeFileSync(
    join(fixture, file),
    readFileSync(new URL(file, import.meta.url))
  );
}
const operation = `
export async function operation() {
  console.log('operation started');
  if (process.env.FIXTURE_MODE === 'pending') await new Promise(() => {});
  await new Promise(resolve => setTimeout(resolve, 30));
  if (process.env.FIXTURE_MODE === 'reject') throw new Error('fixture rejected');
  console.log('operation finished');
  return { success: process.env.FIXTURE_MODE !== 'failure', buildId: 'r20-test', durationMs: 30 };
}
`;
writeFileSync(
  join(fixture, 'atomicDeploy.ts'),
  operation +
    '\nexport const atomicDeploy = operation; export const rollbackRelease = operation;'
);
writeFileSync(
  join(fixture, 'astroLocalDeploy.ts'),
  operation +
    '\nexport const astroLocalDeploy = operation; export function printDeploymentSummary() {}'
);
afterAll(() => rmSync(fixture, { recursive: true, force: true }));

function run(runtime: string, mode: string, kind = 'publish', seconds = '1') {
  const local = kind === 'local';
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !/^(AWS_|SITE_VERIFY_)/.test(key)
    )
  );
  return spawnSync(
    runtime,
    [
      ...(runtime === 'node' ? ['--import', 'tsx'] : []),
      local ? 'astroLocalDeployCli.ts' : 'cli.ts',
      '--bucket',
      'fixture',
      '--kvs-arn',
      'fixture',
      '--site-url',
      'https://site.test',
      '--revision',
      'r20-test',
      '--timeout-seconds',
      seconds,
      ...(local
        ? ['--project-root', fixture, '--api-url', 'https://api.test']
        : []),
      ...(kind === 'rollback'
        ? ['--rollback', '--expected-active', 'r30-test']
        : []),
    ],
    {
      cwd: fixture,
      env: { ...env, FIXTURE_MODE: mode },
      encoding: 'utf8',
      timeout: 5000,
    }
  );
}

describe.each(['node', 'bun'])('%s CLI lifecycle', (runtime) => {
  test.each(['publish', 'rollback', 'local'])(
    'fails an unfinished %s within its deadline',
    (kind) => {
      const result = run(runtime, 'pending', kind);
      expect(result.error).toBeUndefined();
      expect(result.signal).toBeNull();
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('operation started');
      expect(result.stdout).not.toContain('operation finished');
      expect(result.stderr).toContain('Deployment deadline exceeded');
    }
  );
  test.each(['publish', 'rollback', 'local'])(
    'waits for successful %s and clears its deadline',
    (kind) => {
      const result = run(runtime, 'success', kind);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('operation finished');
      expect(result.stderr).not.toContain('deadline exceeded');
    }
  );
  test.each(['reject', 'failure'])('does not hide operation %s', (mode) => {
    expect(run(runtime, mode).status).toBe(1);
  });
  test.each(['0', '-1', 'NaN', '3601'])(
    'rejects invalid timeout %s before starting',
    (seconds) => {
      const result = run(runtime, 'success', 'publish', seconds);
      expect(result.status).toBe(1);
      expect(result.stdout).not.toContain('operation started');
    }
  );
});
