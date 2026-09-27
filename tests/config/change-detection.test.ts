import { afterEach, describe, expect, test } from 'bun:test';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const detector = resolve('scripts/ci/detect-changes.sh');
const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'blog-changes-'));
  directories.push(cwd);
  function git(...args: string[]) {
    const result = spawnSync(
      'git',
      [
        '-c',
        'core.hooksPath=/dev/null',
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.com',
        '-c',
        'commit.gpgsign=false',
        ...args,
      ],
      { cwd, encoding: 'utf8' }
    );
    if (result.status !== 0) throw new Error(result.stderr);
    return result.stdout.trim();
  }
  function write(path: string, content = 'fixture') {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), content);
  }
  function commit() {
    git('add', '.');
    git('commit', '-qm', 'fixture');
    return git('rev-parse', 'HEAD');
  }
  git('init', '-q');
  write('README.md');
  const base = commit();
  function detect(
    mode = 'deploy',
    before = base,
    head = git('rev-parse', 'HEAD')
  ) {
    return spawnSync('bash', [detector, mode, before, head], {
      cwd,
      encoding: 'utf8',
    });
  }
  return { cwd, git, write, commit, base, detect };
}

function flags(result: ReturnType<typeof spawnSync>) {
  expect(result.status).toBe(0);
  return Object.fromEntries(
    result.stdout
      .toString()
      .trim()
      .split('\n')
      .map((line) => line.split('='))
  );
}

describe('complete push and PR component detection', () => {
  test('retains an earlier public change when the final push commit is docs only', () => {
    const repo = fixture();
    repo.write('frontend/public-astro/src/pages/index.astro');
    repo.commit();
    repo.write('README.md', 'later docs');
    repo.commit();
    expect(flags(repo.detect())).toEqual({
      astro: 'true',
      admin: 'false',
      infrastructure: 'false',
      'deploy-scripts': 'false',
    });
  });

  for (const [path, astro, admin, infrastructure] of [
    ['frontend/admin/src/App.tsx', 'false', 'true', 'false'],
    ['frontend/public-astro/src/styles/global.css', 'true', 'false', 'false'],
    ['frontend/shared-ui/src/styles/post-content.css', 'true', 'true', 'false'],
    ['package.json', 'true', 'true', 'false'],
    ['bun.lock', 'true', 'true', 'false'],
    ['go-functions/main.go', 'false', 'false', 'true'],
    ['terraform/main.tf', 'false', 'false', 'true'],
    ['README.md', 'false', 'false', 'false'],
  ]) {
    test(`deploy selects dependencies of ${path}`, () => {
      const repo = fixture();
      repo.write(path, 'change');
      repo.commit();
      expect(flags(repo.detect())).toMatchObject({
        astro,
        admin,
        infrastructure,
      });
    });
  }

  test('deploy scripts rebuild the public deployment and select their tests', () => {
    const repo = fixture();
    repo.write('scripts/deploy/deploy.ts');
    repo.commit();
    expect(flags(repo.detect())).toMatchObject({
      astro: 'true',
      admin: 'false',
      'deploy-scripts': 'true',
    });
  });

  test('renaming public source into admin selects both removed and added paths', () => {
    const repo = fixture();
    repo.write('frontend/public-astro/old.ts');
    const before = repo.commit();
    mkdirSync(join(repo.cwd, 'frontend/admin'), { recursive: true });
    renameSync(
      join(repo.cwd, 'frontend/public-astro/old.ts'),
      join(repo.cwd, 'frontend/admin/new.ts')
    );
    repo.commit();
    expect(flags(repo.detect('deploy', before))).toMatchObject({
      astro: 'true',
      admin: 'true',
    });
  });

  test('deleted paths with whitespace are preserved', () => {
    const repo = fixture();
    repo.write('frontend/public-astro/line\nbreak file.astro');
    const before = repo.commit();
    repo.git('rm', 'frontend/public-astro/line\nbreak file.astro');
    repo.commit();
    expect(flags(repo.detect('deploy', before))).toMatchObject({
      astro: 'true',
      admin: 'false',
    });
  });

  test('zero before SHA treats every tracked file as added', () => {
    const repo = fixture();
    repo.write('frontend/shared-ui/style.css');
    repo.commit();
    expect(flags(repo.detect('deploy', '0'.repeat(40)))).toMatchObject({
      astro: 'true',
      admin: 'true',
    });
  });

  test('unavailable base or head fails without publishing false flags', () => {
    const repo = fixture();
    for (const result of [
      repo.detect('deploy', 'f'.repeat(40)),
      repo.detect('ci', repo.base, 'f'.repeat(40)),
    ]) {
      expect(result.status).not.toBe(0);
      expect(result.stdout).toBe('');
    }
  });

  test('PR uses the merge base, excluding changes only on the target branch', () => {
    const repo = fixture();
    repo.git('checkout', '-qb', 'topic');
    repo.write('frontend/public-astro/index.astro');
    const head = repo.commit();
    repo.git('checkout', '-qb', 'target', repo.base);
    repo.write('frontend/admin/App.tsx');
    const target = repo.commit();
    expect(flags(repo.detect('ci', target, head))).toMatchObject({
      astro: 'true',
      admin: 'false',
    });
  });

  for (const [path, astro, admin] of [
    ['tests/e2e/specs/editorial.spec.ts', 'true', 'false'],
    ['tests/e2e/specs/admin-auth.spec.ts', 'false', 'true'],
    ['playwright.config.ts', 'true', 'false'],
    ['playwright.admin.config.ts', 'false', 'true'],
    ['tests/e2e/fixtures/index.ts', 'true', 'true'],
    ['tests/e2e/pages/HomePage.ts', 'true', 'true'],
    ['tests/e2e/pages/AdminLoginPage.ts', 'true', 'true'],
    ['tests/e2e/global-setup.ts', 'true', 'true'],
    ['.github/actions/setup-bun-deps/action.yml', 'true', 'true'],
    ['.github/workflows/ci.yml', 'true', 'true'],
  ]) {
    test(`CI selects consumers of ${path}`, () => {
      const repo = fixture();
      repo.write(path);
      repo.commit();
      expect(flags(repo.detect('ci'))).toMatchObject({ astro, admin });
    });
  }
});

const baseSelector = resolve('scripts/ci/deploy-base.sh');
const EMPTY_BASE = '0'.repeat(40);

describe('deploy base selection (#740)', () => {
  function select(cwd: string, head: string, lastSuccess: string) {
    return spawnSync('bash', [baseSelector, head, lastSuccess], {
      cwd,
      encoding: 'utf8',
    });
  }

  test('diffs from the last successful deploy, not the previous push', () => {
    const repo = fixture();
    repo.write('scripts/deploy/deploy.ts');
    const deployed = repo.base;
    const cancelled = repo.commit();
    repo.write('go-functions/main.go');
    const head = repo.commit();
    const result = select(repo.cwd, head, deployed);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(deployed);
    // The cancelled push's scripts/deploy change is still selected.
    expect(flags(repo.detect('deploy', result.stdout.trim(), head))).toEqual({
      astro: 'true',
      admin: 'false',
      infrastructure: 'true',
      'deploy-scripts': 'true',
    });
    expect(cancelled).not.toBe(deployed);
  });

  test('deploys everything without a usable successful deploy', () => {
    const repo = fixture();
    repo.write('README.md', 'next');
    const head = repo.commit();
    for (const lastSuccess of ['', 'f'.repeat(40)]) {
      const result = select(repo.cwd, head, lastSuccess);
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe(EMPTY_BASE);
    }
    // Diverged history (for example a rewritten branch) is not a safe base.
    repo.git('checkout', '-qb', 'other', repo.base);
    repo.write('README.md', 'diverged');
    const diverged = repo.commit();
    expect(select(repo.cwd, head, diverged).stdout.trim()).toBe(EMPTY_BASE);
  });

  test('refuses to deploy a commit older than the last successful deploy', () => {
    const repo = fixture();
    repo.write('README.md', 'next');
    const newer = repo.commit();
    const result = select(repo.cwd, repo.base, newer);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('older than');
  });

  test('the same commit selects no work', () => {
    const repo = fixture();
    const result = select(repo.cwd, repo.base, repo.base);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(repo.base);
  });
});

describe('workflow wiring', () => {
  const deploy = readFileSync('.github/workflows/deploy.yml', 'utf8');
  const detectionJob = deploy.slice(
    deploy.indexOf('  detect-changes:'),
    deploy.indexOf('  restore-lambda-binaries:')
  );
  test('deployment diffs from the last successful deploy with full history', () => {
    expect(detectionJob).toContain('fetch-depth: 0');
    expect(detectionJob).not.toContain('github.event.before');
    expect(detectionJob).toContain('AFTER_SHA: ${{ github.sha }}');
    expect(detectionJob).toContain('actions: read');
    expect(detectionJob).toContain(
      'actions/workflows/deploy.yml/runs?branch=${BRANCH}&event=push&status=success&per_page=1'
    );
    expect(detectionJob).toContain(
      'BASE_SHA=$(bash scripts/ci/deploy-base.sh "$AFTER_SHA" "$LAST_SUCCESS")'
    );
    expect(detectionJob).toContain(
      'bash scripts/ci/detect-changes.sh deploy "$BASE_SHA" "$AFTER_SHA"'
    );
    // Dispatch inputs reach the shell as environment variables, never through
    // template expansion inside `run:` (#694, zizmor template-injection).
    expect(detectionJob).toContain('EVENT_NAME: ${{ github.event_name }}');
    expect(detectionJob).toContain(
      'COMPONENTS: ${{ github.event.inputs.components }}'
    );
    expect(detectionJob.split('        env:')[0]).not.toContain(
      '${{ github.event.inputs.'
    );
    expect(detectionJob).not.toContain('HEAD~1');
    for (const path of [
      'frontend/**',
      'package.json',
      'bun.lock',
      'scripts/deploy/**',
      'scripts/ci/detect-changes.sh',
      'scripts/ci/deploy-base.sh',
    ]) {
      expect(deploy.split('  workflow_dispatch:')[0]).toContain(`- '${path}'`);
    }
  });

  for (const [component, expected] of [
    ['all', 'infrastructure=true\nfrontend=true\nastro=true\n'],
    ['infrastructure', 'infrastructure=true\nfrontend=false\nastro=false\n'],
    ['frontend', 'infrastructure=false\nfrontend=true\nastro=false\n'],
    ['astro', 'infrastructure=false\nfrontend=false\nastro=true\n'],
  ]) {
    test(`manual dispatch preserves ${component} selection`, () => {
      const directory = mkdtempSync(join(tmpdir(), 'blog-dispatch-'));
      directories.push(directory);
      const output = join(directory, 'output');
      const script = detectionJob
        .split('        id: changes\n        run: |\n')[1]
        .split('        env:')[0];
      const result = spawnSync('bash', ['-e', '-c', script], {
        encoding: 'utf8',
        env: {
          ...process.env,
          GITHUB_OUTPUT: output,
          EVENT_NAME: 'workflow_dispatch',
          COMPONENTS: component,
        },
      });
      expect(result.status).toBe(0);
      expect(readFileSync(output, 'utf8')).toBe(expected);
    });
  }
});

describe('deploy summary accurately reports detection failures', () => {
  const deploy = readFileSync('.github/workflows/deploy.yml', 'utf8');
  const summary = deploy.split('  deploy-summary:')[1];
  const script = summary.split('        run: |\n')[1];
  for (const result of ['failure', 'cancelled', 'skipped', 'success']) {
    test(`detection ${result}`, () => {
      const rendered = script.replace(
        /\$\{\{\s*(.*?)\s*\}\}/g,
        (_, expression: string) => {
          if (expression === 'needs.detect-changes.result') return result;
          return expression.endsWith('.result') ? 'skipped' : 'fixture';
        }
      );
      const execution = spawnSync('bash', ['-e', '-c', rendered], {
        encoding: 'utf8',
      });
      expect(execution.status).toBe(result === 'success' ? 0 : 1);
    });
  }
});
