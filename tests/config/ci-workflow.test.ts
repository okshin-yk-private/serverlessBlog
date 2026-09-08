import { describe, expect, test } from 'bun:test';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const finalJob = workflow.slice(workflow.indexOf('  ci-success:'));
const gate = finalJob.split(
  '      - name: Verify required checks\n        run: |\n'
)[1];

function runGate(overrides: Record<string, string> = {}) {
  const script = gate.replace(
    /\$\{\{\s*(.*?)\s*\}\}/g,
    (_, expression: string) =>
      overrides[expression] ??
      (expression.endsWith('.result') ? 'success' : 'false')
  );
  return spawnSync('bash', ['-e', '-c', script], { encoding: 'utf8' }).status;
}

describe('CI aggregate executes the workflow shell', () => {
  test('waits for both mandatory setup jobs and excludes cancelled workflows', () => {
    expect(finalJob).toContain('      - verify-go-toolchain');
    expect(finalJob).toContain('      - setup-labels');
    expect(finalJob).toContain('if: ${{ !cancelled() }}');
    expect(runGate()).toBe(0);
  });

  for (const job of [
    'setup-labels',
    'verify-go-toolchain',
    'lint',
    'typecheck',
  ]) {
    for (const result of ['failure', 'cancelled', 'skipped', '']) {
      test(`${job} ${result || 'missing result'} cannot pass`, () => {
        expect(runGate({ [`needs.${job}.result`]: result })).toBe(1);
      });
    }
  }

  test('optional skipped frontend is allowed, required skipped frontend is rejected', () => {
    const skipped = { 'needs.frontend-admin-tests.result': 'skipped' };
    expect(runGate(skipped)).toBe(0);
    expect(
      runGate({
        ...skipped,
        "needs.setup-labels.outputs.has-frontend == 'true'": 'true',
      })
    ).toBe(1);
  });

  test('optional failures are never accepted', () => {
    expect(runGate({ 'needs.terraform-plan-prd.result': 'failure' })).toBe(1);
  });
});

describe('label lookup', () => {
  test('a failed GitHub request fails the step instead of selecting no tests', () => {
    const directory = mkdtempSync(join(tmpdir(), 'ci-labels-'));
    try {
      writeFileSync(join(directory, 'gh'), '#!/bin/sh\nexit 1\n', {
        mode: 0o755,
      });
      const script = workflow
        .split('        id: check-labels\n        run: |\n')[1]
        .split('        env:')[0]
        .replace(/\$\{\{.*?\}\}/g, 'fixture');
      const output = join(directory, 'output');
      const result = spawnSync('bash', ['-e', '-c', script], {
        env: {
          ...process.env,
          PATH: `${directory}:${process.env.PATH}`,
          GITHUB_OUTPUT: output,
        },
        encoding: 'utf8',
      });
      expect(result.status).toBe(1);
      expect(result.stdout).not.toContain('PR Labels:');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
