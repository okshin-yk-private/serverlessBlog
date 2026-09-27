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

  // Issue #718: the terraform provider cache no longer accumulates old
  // provider versions via restore-keys, and Lambda binaries are restored
  // from (or built and saved to) a single exact-match cache instead of a
  // 19-way matrix, with the function list read from go-functions/Makefile
  // rather than duplicated in each workflow.
  describe('terraform provider cache and Lambda build (issue #718)', () => {
    test('the shared setup-terraform-cached action has no restore-keys', () => {
      const action = read('.github/actions/setup-terraform-cached/action.yml');
      expect(action).toContain(
        "key: terraform-providers-${{ runner.os }}-${{ hashFiles('terraform/**/.terraform.lock.hcl') }}"
      );
      expect(action).not.toContain('restore-keys');
    });

    test('deploy.yml delegates DEV/PRD Terraform setup to the shared cached action', () => {
      const deploy = jobs(read('.github/workflows/deploy.yml'));
      for (const name of [
        'deploy-infrastructure-dev',
        'deploy-infrastructure-prd',
      ]) {
        const job = deploy[name];
        expect(job).toContain('uses: ./.github/actions/setup-terraform-cached');
        expect(job).not.toContain('uses: hashicorp/setup-terraform@');
        expect(job).not.toContain('restore-keys');
      }
    });

    // Binaries depend on the Go toolchain (go.mod) and the build flags
    // (Makefile), not only on sources: a Go security patch or a flag change
    // must never reuse stale binaries from the cache.
    const LAMBDA_CACHE_KEY =
      "key: lambda-all-${{ runner.os }}-${{ hashFiles('go-functions/**/*.go', 'go-functions/go.sum', 'go-functions/go.mod', 'go-functions/Makefile') }}";

    test('every Lambda cache restore/save uses the toolchain- and flag-aware key', () => {
      for (const file of [
        '.github/workflows/ci.yml',
        '.github/workflows/deploy.yml',
      ]) {
        const keys = read(file).match(/key: lambda-all-.*$/gm) ?? [];
        expect(keys.length).toBe(2);
        for (const key of keys) expect(key).toBe(LAMBDA_CACHE_KEY);
      }
    });

    test('ci.yml builds Lambda binaries in a single job with an exact-match cache, not a matrix', () => {
      const ci = jobs(read('.github/workflows/ci.yml'));
      const build = ci['terraform-build-lambdas'];
      expect(build).toBeDefined();
      expect(build).not.toContain('strategy:');
      expect(build).not.toContain('matrix:');
      expect(build).not.toContain('restore-keys:');
      expect(build).toContain(LAMBDA_CACHE_KEY);
      expect(build).toContain('make -C go-functions build');
      expect(build).toContain('make -s -C go-functions print-functions');
      // The separate merge job is gone; terraform-build-lambdas alone
      // produces the lambda-binaries artifact plan jobs consume.
      expect(ci['terraform-merge-artifacts']).toBeUndefined();
    });

    test('deploy.yml restores or builds Lambda binaries in a single job, not a matrix', () => {
      const deploy = jobs(read('.github/workflows/deploy.yml'));
      const job = deploy['restore-lambda-binaries'];
      expect(job).toBeDefined();
      expect(job).not.toContain('strategy:');
      expect(job).not.toContain('matrix:');
      expect(job).not.toContain('restore-keys:');
      expect(job).toContain('make -C go-functions build');
      expect(job).toContain('make -s -C go-functions print-functions');
      expect(deploy['build-lambdas']).toBeUndefined();
      expect(deploy['merge-lambda-artifacts']).toBeUndefined();
    });

    test('no workflow hardcodes the Lambda function list; go-functions/Makefile is the single source', () => {
      for (const file of [
        '.github/workflows/ci.yml',
        '.github/workflows/deploy.yml',
      ]) {
        const workflow = read(file);
        expect(workflow).not.toContain('posts-create posts-get');
        expect(workflow).not.toMatch(/function:\s*posts-create/);
      }
    });

    test('ci-success still fail-closed gates the Lambda build job', () => {
      const ciSuccess = jobs(read('.github/workflows/ci.yml'))['ci-success'];
      expect(ciSuccess).toContain('- terraform-build-lambdas');
      expect(ciSuccess).not.toContain('terraform-merge-artifacts');
      expect(ciSuccess).toContain(
        '"Terraform Build Lambdas" "${{ needs.terraform-build-lambdas.result }}"'
      );
    });

    test('go-functions/Makefile print-functions is the single source of the function list', () => {
      const result = spawnSync(
        'make',
        ['-s', '-C', 'go-functions', 'print-functions'],
        { cwd: repo, encoding: 'utf8' }
      );
      expect(result.status).toBe(0);
      const functions = result.stdout.trim().split('\n');
      // develop currently ships 19 functions, including auth/login,
      // auth/logout and auth/refresh; this guards against silently
      // dropping any of them while consolidating the build jobs.
      expect(functions).toHaveLength(19);
      expect(functions).toEqual(
        expect.arrayContaining(['auth-login', 'auth-logout', 'auth-refresh'])
      );
      expect(new Set(functions).size).toBe(functions.length);
    });
  });
});
