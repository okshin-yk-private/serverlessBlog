import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { parseArgs } from '../e2e/cleanup-test-data';

// Issue #737: the CLI must refuse to run (no network calls at all) when the
// target isn't explicitly DEV, before it ever attempts a Cognito login.
// These tests spawn the real CLI as a subprocess (Bun.spawn, not spawnSync,
// per tests/config/verify-public-contract.test.ts's pattern) so a hang would
// show up as a timeout instead of deadlocking the test runner.

const CLI = resolve(import.meta.dir, '../e2e/cleanup-test-data.ts');

describe('parseArgs', () => {
  test('detects --dry-run', () => {
    expect(parseArgs(['--dry-run']).dryRun).toBe(true);
    expect(parseArgs([]).dryRun).toBe(false);
  });

  test('detects --help / -h', () => {
    expect(parseArgs(['--help']).help).toBe(true);
    expect(parseArgs(['-h']).help).toBe(true);
    expect(parseArgs(['--dry-run']).help).toBe(false);
  });
});

async function runCli(
  args: string[],
  env: Record<string, string | undefined>
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(['bun', CLI, ...args], {
    env: { ...process.env, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { exitCode, stdout, stderr };
}

describe('cleanup-test-data CLI guard (no network)', () => {
  test('refuses with no env vars at all', async () => {
    const { exitCode, stderr } = await runCli(['--dry-run'], {
      CLEANUP_TARGET_ENV: undefined,
      BASE_URL: undefined,
      ADMIN_BASE_URL: undefined,
      TEST_ADMIN_EMAIL: undefined,
      TEST_ADMIN_PASSWORD: undefined,
    });
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('CLEANUP_TARGET_ENV must be exactly "dev"');
  }, 15000);

  test('refuses a prod-like BASE_URL even with CLEANUP_TARGET_ENV=dev', async () => {
    const { exitCode, stderr } = await runCli(['--dry-run'], {
      CLEANUP_TARGET_ENV: 'dev',
      BASE_URL: 'https://boneofmyfallacy.net',
      TEST_ADMIN_EMAIL: undefined,
      TEST_ADMIN_PASSWORD: undefined,
    });
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain('production domain');
  }, 15000);

  test('lets the DEV host past the guard (stops at the credential check)', async () => {
    // DEV is https://dev.boneofmyfallacy.net; a suffix match on the prd apex used
    // to refuse it. Missing credentials keep this run off the network.
    const { exitCode, stderr } = await runCli(['--dry-run'], {
      CLEANUP_TARGET_ENV: 'dev',
      BASE_URL: 'https://dev.boneofmyfallacy.net',
      ADMIN_BASE_URL: undefined,
      TEST_ADMIN_EMAIL: undefined,
      TEST_ADMIN_PASSWORD: undefined,
    });
    expect(exitCode).not.toBe(0);
    expect(stderr).not.toContain('production domain');
    expect(stderr).toContain(
      'TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD must be set'
    );
  }, 15000);

  test('refuses when TEST_ADMIN_EMAIL/PASSWORD are missing, before any login', async () => {
    const { exitCode, stderr } = await runCli(['--dry-run'], {
      CLEANUP_TARGET_ENV: 'dev',
      BASE_URL: 'https://d111111abcdef8.cloudfront.net',
      TEST_ADMIN_EMAIL: undefined,
      TEST_ADMIN_PASSWORD: undefined,
    });
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain(
      'TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD must be set'
    );
  }, 15000);

  test('--help prints usage and exits 0 without any guard/env checks', async () => {
    const { exitCode, stdout } = await runCli(['--help'], {
      CLEANUP_TARGET_ENV: undefined,
    });
    expect(exitCode).toBe(0);
    expect(stdout).toContain('cleanup:test-data');
    expect(stdout).toContain('--dry-run');
  }, 15000);
});
