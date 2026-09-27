import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
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
    expect(finalJob).toContain('      - verify-config-guards');
    expect(finalJob).toContain('      - setup-labels');
    expect(finalJob).toContain('if: ${{ !cancelled() }}');
    expect(runGate()).toBe(0);
  });

  for (const job of [
    'setup-labels',
    'verify-go-toolchain',
    'verify-config-guards',
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
        "needs.setup-labels.outputs.has-admin == 'true'": 'true',
      })
    ).toBe(1);
  });

  for (const [name, flag] of [
    ['frontend-astro-tests', 'has-astro'],
    ['frontend-admin-tests', 'has-admin'],
    ['e2e-public-tests', 'has-astro'],
    ['e2e-admin-tests', 'has-admin'],
  ]) {
    test(`${name} skipped is rejected only when its component is required`, () => {
      const skipped = { [`needs.${name}.result`]: 'skipped' };
      expect(runGate(skipped)).toBe(0);
      expect(
        runGate({
          ...skipped,
          [`needs.setup-labels.outputs.${flag} == 'true'`]: 'true',
        })
      ).toBe(1);
    });
  }

  test('public-only PR allows skipped admin and badge jobs', () => {
    expect(
      runGate({
        "needs.setup-labels.outputs.has-astro == 'true'": 'true',
        'needs.frontend-admin-tests.result': 'skipped',
        'needs.e2e-admin-tests.result': 'skipped',
        'needs.coverage-check.result': 'skipped',
      })
    ).toBe(0);
  });

  test('public coverage is enforced in its own job and component gates are wired', () => {
    const publicJob = workflow
      .split('  frontend-astro-tests:')[1]
      .split('  frontend-admin-tests:')[0];
    const adminJob = workflow
      .split('  frontend-admin-tests:')[1]
      .split('  e2e-public-tests:')[0];
    expect(publicJob).toContain('run: bun run test:coverage -- --run');
    expect(publicJob).toContain(
      "if: needs.setup-labels.outputs.has-astro == 'true'"
    );
    expect(adminJob).toContain(
      "if: needs.setup-labels.outputs.has-admin == 'true'"
    );
    expect(workflow).toContain(
      'has-astro: ${{ steps.frontend-changes.outputs.astro }}'
    );
    expect(workflow).toContain(
      'has-admin: ${{ steps.frontend-changes.outputs.admin }}'
    );
    expect(workflow).toContain(
      'has-go: ${{ steps.frontend-changes.outputs.go }}'
    );
    expect(workflow).toContain(
      'has-terraform: ${{ steps.frontend-changes.outputs.terraform }}'
    );
    expect(workflow).toContain(
      'has-deploy-scripts: ${{ steps.frontend-changes.outputs.deploy-scripts }}'
    );
    expect(workflow).toContain(
      'bash scripts/ci/detect-changes.sh ci "$BASE_SHA" "$HEAD_SHA" >> "$GITHUB_OUTPUT"'
    );
  });

  test('optional failures are never accepted', () => {
    expect(runGate({ 'needs.terraform-plan-prd.result': 'failure' })).toBe(1);
  });
});

describe('job gating no longer depends on PR labels', () => {
  const triggerBlock = workflow.slice(
    workflow.indexOf('on:\n'),
    workflow.indexOf('concurrency:')
  );

  test('the labeled/unlabeled PR events no longer trigger CI', () => {
    expect(triggerBlock).toContain('types: [opened, synchronize, reopened]');
    expect(triggerBlock).not.toContain('labeled');
    expect(triggerBlock).not.toContain('unlabeled');
  });

  test('the PR-label-reading step (gh api pulls/.../labels) has been removed', () => {
    expect(workflow).not.toContain('id: check-labels');
    expect(workflow).not.toContain('.labels[].name');
    expect(workflow).not.toContain('has_label');
  });

  test('has-go, has-terraform and has-deploy-scripts are sourced from path detection', () => {
    const setupLabelsJob = workflow
      .split('  setup-labels:\n')[1]
      .split(/\n {2}[a-zA-Z][\w-]*:\n/)[0];
    expect(setupLabelsJob).not.toContain('steps.check-labels');
    for (const output of ['has-go', 'has-terraform', 'has-deploy-scripts']) {
      expect(setupLabelsJob).toContain(
        `${output}: \${{ steps.frontend-changes.outputs.`
      );
    }
  });

  test('the auto-labeler step, if kept, only labels PRs for display', () => {
    // The auto-labeler step may remain for PR display purposes, but no job
    // condition may branch on a PR's *label list* (as opposed to the
    // `setup-labels` job name/id, or the path-derived `has-*` outputs).
    expect(workflow).not.toMatch(/if:[^\n]*pull_request\.labels/);
    expect(workflow).not.toMatch(/if:[^\n]*contains\([^)]*labels/);
  });
});
