import { describe, expect, test } from 'bun:test';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Issue #693: local checks must not fail on stale dependencies, silently skip
// security scans, or rewrite tracked lock files as a side effect.

const repo = resolve(import.meta.dir, '../..');
const read = (path: string) => readFileSync(join(repo, path), 'utf8');
const resolver = join(repo, '.husky/scripts/resolve-pre-commit.sh');
const doctor = join(repo, 'scripts/doctor.sh');

const expectedBun = read('.github/actions/setup-bun-deps/action.yml').match(
  /bun-version:[\s\S]*?default: '([\d.]+)'/
)![1];
const expectedGo = read('go-functions/go.mod').match(/^go (\S+)$/m)![1];
const expectedTerraform = read('.github/workflows/ci.yml').match(
  /TERRAFORM_VERSION: '([\d.]+)'/
)![1];

type Fakes = Record<string, string>;

// A PATH holding only the given fake tools plus the utilities the scripts use.
function withPath(fakes: Fakes, run: (path: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'blog-local-checks-'));
  try {
    const bin = join(dir, 'bin');
    mkdirSync(bin);
    for (const util of ['sed', 'awk', 'head', 'dirname', 'bash', 'sh']) {
      const real = Bun.which(util);
      if (real) symlinkSync(real, join(bin, util));
    }
    for (const [name, output] of Object.entries(fakes)) {
      const file = join(bin, name);
      writeFileSync(file, `#!/bin/sh\necho '${output}'\n`);
      chmodSync(file, 0o755);
    }
    run(bin);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runScript(script: string, path: string, extraEnv = {}) {
  return spawnSync(script, [], {
    cwd: repo,
    env: { PATH: path, HOME: tmpdir(), ...extraEnv },
    encoding: 'utf8',
  });
}

const healthyTools: Fakes = {
  bun: expectedBun,
  go: `go${expectedGo}`,
  terraform: `Terraform v${expectedTerraform}`,
  'pre-commit': 'pre-commit 4.6.2',
  trivy: 'Version: 0',
  'terraform-docs': 'terraform-docs v0',
  jq: 'jq-1.7',
  gh: 'gh version 2',
  python3: 'Python 3',
};

describe('resolve-pre-commit', () => {
  test('prefers an installed pre-commit', () => {
    withPath({ 'pre-commit': '', uvx: '' }, (path) => {
      const result = runScript(resolver, path);
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe('pre-commit');
    });
  });

  test('falls back to a pinned uvx run', () => {
    withPath({ uvx: '' }, (path) => {
      const result = runScript(resolver, path);
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toMatch(/^uvx pre-commit@\d+\.\d+\.\d+$/);
    });
  });

  test('fails under STRICT_LOCAL_CHECKS=1 when neither is available', () => {
    withPath({}, (path) => {
      const result = runScript(resolver, path, { STRICT_LOCAL_CHECKS: '1' });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('STRICT_LOCAL_CHECKS=1');
    });
  });

  test('only warns for humans when neither is available', () => {
    withPath({}, (path) => {
      const result = runScript(resolver, path);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('skipped');
    });
  });
});

describe('doctor', () => {
  test('passes with every tool at the CI versions', () => {
    withPath(healthyTools, (path) => {
      const result = runScript(doctor, path);
      expect(result.stdout).toContain(`✓ bun ${expectedBun}`);
      expect(result.stdout).toContain(`✓ go ${expectedGo}`);
      expect(result.status).toBe(0);
    });
  });

  test('fails when bun differs from the version CI uses', () => {
    withPath({ ...healthyTools, bun: '0.0.1' }, (path) => {
      const result = runScript(doctor, path);
      expect(result.status).toBe(1);
      expect(result.stdout).toContain(
        `✗ bun 0.0.1, but CI uses ${expectedBun}`
      );
    });
  });

  test('fails when a scanner the hooks need is missing', () => {
    const { trivy: _trivy, ...withoutTrivy } = healthyTools;
    withPath(withoutTrivy, (path) => {
      const result = runScript(doctor, path);
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('✗ trivy not found');
    });
  });

  test('only warns on a Go patch mismatch', () => {
    withPath({ ...healthyTools, go: 'go1.0.0' }, (path) => {
      const result = runScript(doctor, path);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(
        `⚠ go 1.0.0, but go-functions/go.mod requires ${expectedGo}`
      );
    });
  });
});

describe('lock files', () => {
  test('every provider records hashes for more than one platform', () => {
    const locks = spawnSync('git', ['ls-files', '*.terraform.lock.hcl'], {
      cwd: repo,
      encoding: 'utf8',
    })
      .stdout.trim()
      .split('\n');
    expect(locks.length).toBeGreaterThan(0);
    const singlePlatform: string[] = [];
    for (const lock of locks) {
      for (const block of read(lock)
        .split(/^provider /m)
        .slice(1)) {
        const h1 = block.match(/"h1:/g)?.length ?? 0;
        if (h1 < 2) singlePlatform.push(`${lock}: ${block.split('\n')[0]}`);
      }
    }
    // One h1 means one platform: `terraform init` on the other one (CI on
    // linux_amd64, local on darwin_arm64) would rewrite the file.
    expect(singlePlatform).toEqual([]);
  });
});

describe('wiring', () => {
  test('verify syncs dependencies first and doctor is exposed', () => {
    const scripts = JSON.parse(read('package.json')).scripts;
    expect(scripts.verify.startsWith('bun run deps:sync && ')).toBe(true);
    for (const dir of ['frontend/admin', 'public-astro', 'scripts/deploy']) {
      expect(scripts['deps:sync']).toContain(dir);
    }
    expect(scripts.doctor).toBe('scripts/doctor.sh');
  });

  test('agents opt into strict checks and the hook uses the resolver', () => {
    const settings = JSON.parse(read('.claude/settings.json'));
    expect(settings.env.STRICT_LOCAL_CHECKS).toBe('1');
    expect(read('scripts/run-codex.sh')).toContain(
      'export STRICT_LOCAL_CHECKS=1'
    );
    const hook = read('.husky/pre-commit');
    expect(hook).toContain('.husky/scripts/resolve-pre-commit.sh');
    expect(hook).not.toContain('command -v pre-commit');
  });

  test('the generated MSW worker stays as msw writes it', () => {
    // `msw init` rewrites the file on every install; if ESLint --fix may strip
    // its first line, each install shows up as a tracked-file change.
    expect(read('frontend/admin/eslint.config.js')).toContain(
      "'public/mockServiceWorker.js'"
    );
    expect(
      read('frontend/admin/public/mockServiceWorker.js').split('\n')[0]
    ).toBe('/* eslint-disable */');
  });

  test('Python bytecode from script tests is ignored', () => {
    const ignored = spawnSync(
      'git',
      ['check-ignore', '-q', 'scripts/ci/__pycache__/x.pyc'],
      { cwd: repo }
    );
    expect(ignored.status).toBe(0);
  });
});
