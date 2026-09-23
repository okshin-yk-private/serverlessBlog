import { describe, expect, test } from 'bun:test';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Issue #694: CI guards for workflow security, Bun pins and scanner exceptions.

const repo = resolve(import.meta.dir, '../..');
const read = (path: string) => readFileSync(join(repo, path), 'utf8');

function fixture(run: (dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'blog-ci-guards-'));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function put(dir: string, path: string, content: string) {
  const file = join(dir, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

describe('verify-bun-version.sh', () => {
  const sha = 'a'.repeat(64);
  function bunRepo(
    dir: string,
    {
      workflowVersion = "'1.2.3'",
      codebuildVersion = '1.2.3',
      codebuildSha = sha,
    } = {}
  ) {
    put(
      dir,
      'scripts/ci/verify-bun-version.sh',
      read('scripts/ci/verify-bun-version.sh')
    );
    chmodSync(join(dir, 'scripts/ci/verify-bun-version.sh'), 0o755);
    put(
      dir,
      '.github/actions/setup-bun-deps/action.yml',
      "inputs:\n  bun-version:\n    description: 'Bun'\n    default: '1.2.3'\nruns:\n  steps:\n    - with:\n        bun-version: ${{ inputs.bun-version }}\n"
    );
    put(
      dir,
      '.github/workflows/scan.yml',
      `jobs:\n  a:\n    steps:\n      - with:\n          bun-version: ${workflowVersion}\n`
    );
    put(
      dir,
      'terraform/modules/codebuild/main.tf',
      `locals {\n  bun_version              = "${codebuildVersion}"\n  bun_linux_aarch64_sha256 = "${codebuildSha}"\n}\n`
    );
    return spawnSync(join(dir, 'scripts/ci/verify-bun-version.sh'), [], {
      encoding: 'utf8',
    });
  }

  test('passes when every source matches the setup-bun-deps default', () => {
    fixture((dir) => {
      const result = bunRepo(dir);
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
    });
  });

  test('rejects a workflow with its own Bun version', () => {
    fixture((dir) => {
      const result = bunRepo(dir, { workflowVersion: "'1.2.4'" });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('declares bun-version 1.2.4');
    });
  });

  test('rejects a CodeBuild Bun version that drifted', () => {
    fixture((dir) => {
      const result = bunRepo(dir, { codebuildVersion: '1.2.0' });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('pins Bun 1.2.0');
    });
  });

  test('rejects a malformed CodeBuild checksum', () => {
    fixture((dir) => {
      const result = bunRepo(dir, { codebuildSha: 'not-a-hash' });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('64 lowercase hex');
    });
  });
});

describe('verify_security_exceptions.py', () => {
  function exceptionsRepo(
    dir: string,
    { trivy = '', checkov = '', tf = '' },
    args: string[] = []
  ) {
    put(dir, 'terraform/.trivyignore', trivy);
    put(
      dir,
      'terraform/.checkov.yaml',
      `framework:\n  - terraform\nskip-check:\n${checkov}`
    );
    put(dir, 'terraform/main.tf', tf);
    return spawnSync(
      'python3',
      [
        join(repo, 'scripts/ci/verify_security_exceptions.py'),
        '--root',
        dir,
        '--today',
        '2026-09-23',
        ...args,
      ],
      {
        encoding: 'utf8',
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
      }
    );
  }

  const trivyOk =
    '# AVD-AWS-1: x\n# Justification: reason.\n# Review-by: 2027-01-01\nAVD-AWS-1\n';
  const checkovOk =
    '  # CKV_AWS_1: x\n  # Justification: reason.\n  # Review-by: 2027-01-01\n  - CKV_AWS_1\n';

  test('accepts justified exceptions with a future review date', () => {
    fixture((dir) => {
      const result = exceptionsRepo(dir, {
        trivy: trivyOk,
        checkov: checkovOk,
        tf: '#trivy:ignore:AVD-AWS-2 reason here\n#checkov:skip=CKV_AWS_2:reason\n',
      });
      expect(result.stdout).toContain('0 error(s), 0 overdue');
      expect(result.status).toBe(0);
    });
  });

  test('rejects an exception without a justification or review date', () => {
    fixture((dir) => {
      const noJustification = exceptionsRepo(dir, {
        trivy:
          '# AVD-AWS-1: x\n# Note: reason.\n# Review-by: 2027-01-01\nAVD-AWS-1\n',
      });
      expect(noJustification.status).toBe(1);
      expect(noJustification.stdout).toContain(
        "AVD-AWS-1 has no 'Justification:'"
      );
      const noReview = exceptionsRepo(dir, {
        checkov:
          '  # CKV_AWS_1: x\n  # Justification: reason.\n  - CKV_AWS_1\n',
      });
      expect(noReview.status).toBe(1);
      expect(noReview.stdout).toContain("CKV_AWS_1 has no 'Review-by:");
    });
  });

  test('an overdue review warns on PRs and fails nightly', () => {
    fixture((dir) => {
      const overdue = {
        trivy: '# Justification: reason.\n# Review-by: 2026-01-01\nAVD-AWS-1\n',
      };
      const pr = exceptionsRepo(dir, overdue);
      expect(pr.status).toBe(0);
      expect(pr.stdout).toContain(
        '::warning file=terraform/.trivyignore,line=3::'
      );
      expect(exceptionsRepo(dir, overdue, ['--fail-on-expired']).status).toBe(
        1
      );
    });
  });

  test('rejects inline suppressions without a reason', () => {
    fixture((dir) => {
      const trivyInline = exceptionsRepo(dir, {
        tf: '#trivy:ignore:AVD-AWS-2\n',
      });
      expect(trivyInline.status).toBe(1);
      const checkovInline = exceptionsRepo(dir, {
        tf: '  #checkov:skip=CKV_AWS_2\n',
      });
      expect(checkovInline.status).toBe(1);
    });
  });

  test('the repository registers pass', () => {
    const result = spawnSync(
      'python3',
      [join(repo, 'scripts/ci/verify_security_exceptions.py')],
      {
        encoding: 'utf8',
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
      }
    );
    expect(result.stdout).toContain(' 0 error(s)');
    expect(result.status).toBe(0);
  });
});

describe('workflow permissions and wiring', () => {
  // The workflow-level permissions block, up to the next top-level key.
  const topLevelPermissions = (workflow: string) =>
    workflow.split(/^permissions:\n/m)[1].split(/^\S/m)[0];

  // Map of job name -> job body for a workflow file.
  function jobs(workflow: string) {
    const body = workflow.split(/^jobs:\n/m)[1];
    const result: Record<string, string> = {};
    for (const chunk of body.split(/^(?= {2}[A-Za-z0-9_-]+:\n)/m)) {
      const name = chunk.match(/^ {2}([A-Za-z0-9_-]+):\n/)?.[1];
      if (name) result[name] = chunk;
    }
    return result;
  }

  test('CI and deploy grant write scopes only to the jobs that need them', () => {
    for (const file of [
      '.github/workflows/ci.yml',
      '.github/workflows/deploy.yml',
    ]) {
      const workflow = read(file);
      const top = topLevelPermissions(workflow);
      expect(top).toContain('contents: read');
      expect(top).not.toContain('id-token');
      expect(top).not.toContain('pull-requests: write');
      for (const [name, job] of Object.entries(jobs(workflow))) {
        if (job.includes('aws-actions/configure-aws-credentials')) {
          expect(`${name}\n${job}`).toMatch(
            /permissions:\n(?: {6}.*\n)*? {6}id-token: write/
          );
        }
      }
    }
    const ci = jobs(read('.github/workflows/ci.yml'));
    expect(ci['setup-labels']).toContain('pull-requests: write');
  });

  test('zizmor gates high findings and uploads every finding', () => {
    const job = jobs(read('.github/workflows/security-scan.yml')).zizmor;
    expect(job).toMatch(/ZIZMOR_VERSION: '\d+\.\d+\.\d+'/);
    expect(job).toContain('--format sarif --no-exit-codes');
    expect(job).toContain('category: zizmor');
    expect(job).toContain('zizmor --min-severity high');
    expect(job).toContain('persist-credentials: false');
  });

  test('CI checks the pins and exceptions, nightly fails on overdue reviews', () => {
    const guard = jobs(read('.github/workflows/ci.yml'))[
      'verify-config-guards'
    ];
    expect(guard).toContain('scripts/ci/verify-bun-version.sh --online');
    expect(guard).toContain('python3 scripts/ci/verify_security_exceptions.py');
    expect(read('.github/workflows/nightly.yml')).toContain(
      'python3 scripts/ci/verify_security_exceptions.py --fail-on-expired'
    );
  });
});
