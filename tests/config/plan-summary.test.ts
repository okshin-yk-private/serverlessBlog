import { describe, expect, test } from 'bun:test';
import {
  readFileSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  copyFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function run(input: string) {
  return spawnSync('python3', ['scripts/ci/summarize_plan.py'], {
    input,
    encoding: 'utf8',
  });
}

function plan(actions: unknown[]) {
  return {
    format_version: '1.2',
    resource_changes: actions.map((actions) => ({ change: { actions } })),
  };
}

describe('public Terraform plan summary', () => {
  test('counts allowed actions including both replacement orders and state removal', () => {
    const result = run(
      JSON.stringify(
        plan([
          ['create'],
          ['update'],
          ['delete'],
          ['read'],
          ['forget'],
          ['no-op'],
          ['create', 'delete'],
          ['delete', 'create'],
          ['create', 'forget'],
        ])
      )
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('| create | 4 |');
    expect(result.stdout).toContain('| delete | 3 |');
    expect(result.stdout).toContain('| update | 1 |');
    expect(result.stdout).toContain('| forget | 2 |');
  });

  test('never discloses sensitive or unmarked values, addresses or output names', () => {
    const secret = 'CANARY-PRIVATE-PLAN-VALUE';
    const input = {
      ...plan([['update']]),
      variables: { password: { value: secret } },
      prior_state: { values: secret },
      planned_values: { outputs: { [secret]: { value: secret } } },
      output_changes: { [secret]: { after: secret, after_sensitive: false } },
      resource_changes: [
        {
          address: secret,
          change: {
            actions: ['update'],
            before: secret,
            after: secret,
            after_sensitive: false,
          },
        },
      ],
    };
    const result = run(JSON.stringify(input));
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(run(JSON.stringify(plan([['update']]))).stdout);
    expect(result.stdout + result.stderr).not.toContain(secret);
  });

  test('rejects malformed/errored/unknown input without disclosing it or partial counts', () => {
    for (const input of [
      'PRIVATE-INVALID-INPUT',
      '{}',
      'null',
      '[]',
      JSON.stringify({ ...plan([]), errored: true }),
      JSON.stringify({ ...plan([]), format_version: '2.0' }),
      JSON.stringify(plan([['create'], ['PRIVATE-INVALID-INPUT']])),
      JSON.stringify(plan([['create', 'update']])),
      JSON.stringify(plan([[{}]])),
    ]) {
      const result = run(input);
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe(
        'Cannot publish summary: invalid Terraform plan.\n'
      );
    }
  });

  test('an empty successful plan produces a zero-count summary', () => {
    const result = run(JSON.stringify(plan([])));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('| create | 0 |');
  });
});

describe('plan publishing boundary in both CI environments', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  for (const env of ['dev', 'prd']) {
    test(`${env} uploads/comments only the allowlisted summary and cleans raw files on failure`, () => {
      const job = workflow
        .split(`\n  terraform-plan-${env}:\n`)[1]
        .split(/\n {2}[\w-]+:\n/)[0];
      const upload = job
        .split('      - name: Upload Plan Summary\n')[1]
        .split('      - name:')[0];
      expect(upload).toContain("if: steps.plan.outcome == 'success'");
      expect(upload).toContain(
        `path: terraform/environments/${env}/tfplan-summary.md`
      );
      expect(upload).not.toMatch(/tfplan\.(binary|json|txt)/);
      expect(job).toContain('scripts/ci/check_backup_plan.py < tfplan.json');
      expect(job).toContain(
        'scripts/ci/summarize_plan.py < tfplan.json > tfplan-summary.md'
      );
      expect(job).not.toContain('tee tfplan_output.txt');
      expect(job).toContain(
        `fs.readFileSync('terraform/environments/${env}/tfplan-summary.md'`
      );
      expect(job).toContain(
        'name: Remove raw plan files\n        if: always()'
      );
      expect(job).toContain(
        'rm -f tfplan.binary tfplan.json tfplan.txt tfplan_output.txt'
      );
    });
  }
});

describe('actual Plan workflow shell with a fake Terraform executable', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  const job = workflow
    .split('\n  terraform-plan-dev:\n')[1]
    .split('\n  terraform-plan-prd:')[0];
  const shell = job
    .split('      - name: Terraform Plan\n')[1]
    .split('        run: |\n')[1]
    .split('\n      - name:')[0]
    .split('\n')
    .map((line) => line.replace(/^ {10}/, ''))
    .join('\n');

  for (const [exitCode, actions, success] of [
    [0, ['no-op'], true],
    [2, ['update'], true],
    [1, ['update'], false],
    [2, ['delete'], false],
  ] as const) {
    test(`exit ${exitCode}, backup ${actions[0]} preserves the failure boundary`, () => {
      const folder = mkdtempSync(join(tmpdir(), 'plan-workflow-'));
      try {
        const cwd = join(folder, 'terraform/environments/dev');
        const bin = join(folder, 'bin');
        mkdirSync(cwd, { recursive: true });
        mkdirSync(bin);
        mkdirSync(join(folder, 'scripts/ci'), { recursive: true });
        for (const script of ['check_backup_plan.py', 'summarize_plan.py'])
          copyFileSync(
            `scripts/ci/${script}`,
            join(folder, 'scripts/ci', script)
          );
        const canary = 'CANARY-RAW-PLAN-DIAGNOSTIC';
        const fixture = join(folder, 'fixture.json');
        writeFileSync(
          fixture,
          JSON.stringify({
            format_version: '1.2',
            resource_changes: [
              {
                address: `module.content_backup.aws_s3_bucket.${canary}`,
                type: 'aws_s3_bucket',
                change: { actions, after: { secret: canary } },
              },
            ],
          })
        );
        writeFileSync(
          join(bin, 'terraform'),
          `#!/bin/sh
if [ "$1" = plan ]; then
  echo CANARY-RAW-PLAN-DIAGNOSTIC
  echo CANARY-RAW-PLAN-DIAGNOSTIC >&2
  touch tfplan.binary
  exit "$FAKE_EXIT_CODE"
fi
cat "$PLAN_FIXTURE"
`,
          { mode: 0o755 }
        );
        const output = join(folder, 'outputs');
        const result = spawnSync(
          'bash',
          ['-e', '-o', 'pipefail', '-c', shell],
          {
            cwd,
            env: {
              ...process.env,
              PATH: `${bin}:${process.env.PATH}`,
              FAKE_EXIT_CODE: String(exitCode),
              PLAN_FIXTURE: fixture,
              GITHUB_OUTPUT: output,
            },
            encoding: 'utf8',
          }
        );
        expect(result.status).toBe(success ? 0 : 1);
        expect(result.stdout + result.stderr).not.toContain(canary);
        expect(existsSync(join(cwd, 'tfplan-summary.md'))).toBe(success);
        if (success)
          expect(readFileSync(output, 'utf8')).toBe(`exitcode=${exitCode}\n`);
      } finally {
        rmSync(folder, { recursive: true, force: true });
      }
    });
  }
});
