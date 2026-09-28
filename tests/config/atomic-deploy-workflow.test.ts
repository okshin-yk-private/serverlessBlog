import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const codebuild = readFileSync('terraform/modules/codebuild/main.tf', 'utf8');
const workflow = readFileSync('.github/workflows/deploy.yml', 'utf8');
const publish = codebuild
  .split('  post_build:\n')[1]
  .split('      - echo')[0]
  .split('      - |\n')[1]
  .split('\n')
  .map((line) => line.slice(8))
  .join('\n')
  .replaceAll('$${', '${')
  .replaceAll('${var.aws_region}', 'ap-northeast-1');

function runPublisher(
  state: string,
  startTime = '1710000000000',
  verifierExit = '0'
) {
  // Execute the actual buildspec shell; replace external actions with shell functions.
  return spawnSync(
    'bash',
    [
      '-e',
      '-c',
      `cd() { :; }; bun() { printf '%s\\n' "$@"; }; node() { printf '%s\\n' "$@"; return "$VERIFIER_EXIT"; }; ${publish}`,
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        CODEBUILD_BUILD_SUCCEEDING: state,
        CODEBUILD_START_TIME: startTime,
        CODEBUILD_RESOLVED_SOURCE_VERSION: 'abcdef0123456789',
        CODEBUILD_BUILD_NUMBER: '7',
        CODEBUILD_SRC_DIR: '/fixture',
        DEPLOYMENT_BUCKET: 'fixture',
        RELEASE_KVS_ARN: 'fixture',
        SITE_URL: 'https://site.test',
        VERIFIER_EXIT: verifierExit,
      },
    }
  );
}

describe('atomic release workflow contracts', () => {
  test('failed or unknown build never invokes the publisher', () => {
    for (const state of ['0', '']) {
      const result = runPublisher(state);
      expect(result.status).not.toBe(0);
      expect(result.stdout).not.toContain('--bucket');
    }
  });
  test('release order uses build start in seconds and public verification is mandatory', () => {
    const result = runPublisher('1');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('r1710000000-abcdef012345-7');
    expect(result.stdout).toContain('--site-url\nhttps://site.test');
    expect(runPublisher('1', '').status).not.toBe(0);
  });
  test('both GitHub publishers preserve the build revision and verify the public origin', () => {
    for (const environment of ['dev', 'prd']) {
      const job = workflow
        .split(`  deploy-astro-${environment}:`)[1]
        .split('\n  # =======================================')[0];
      expect(job).toContain(
        'REVISION="${{ needs.build-astro.outputs.revision }}"'
      );
      expect(job).toContain(
        '--site-url "${{ steps.config.outputs.public_url }}"'
      );
      expect(job).not.toContain('REVISION="r${START_TIME}');
      expect(job).not.toContain('sync --delete');
      expect(job).toContain('node --import tsx cli.ts');
    }
    expect(workflow.indexOf('id: revision')).toBeLessThan(
      workflow.indexOf('- name: Build Astro project')
    );
  });
  test('CodeBuild rejects a zero-exit publisher when the manifest gate fails', () => {
    const result = runPublisher('1', '1710000000000', '1');
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('verify-public-manifest.mjs');
  });
  test.each(['dev', 'prd'])(
    '%s rejects a zero-exit publisher without the expected manifest',
    (environment) => {
      const script = workflow
        .split(`  deploy-astro-${environment}:`)[1]
        .split('- name: Deploy to S3 (Atomic Deployment)')[1]
        .split('run: |\n')[1]
        .split('\n      - name:')[0]
        .split('\n')
        .map((line) => line.slice(10))
        .join('\n')
        .replace(
          /\$\{\{\s*needs.build-astro.outputs.revision\s*\}\}/g,
          'r20-test'
        )
        .replace(/\$\{\{[^}]+\}\}/g, 'https://site.test');
      for (const verifierExit of ['0', '1']) {
        const result = spawnSync(
          'bash',
          [
            '-e',
            '-c',
            `
        curl() { printf '200'; }
        node() {
          if [ "$1" = "--import" ]; then return 0; fi
          [ "$1" = "verify-public-manifest.mjs" ] || return 99
          [ "$3" = "r20-test" ] || return 98
          return "$VERIFIER_EXIT"
        }
        ${script}
      `,
          ],
          {
            encoding: 'utf8',
            env: { ...process.env, VERIFIER_EXIT: verifierExit },
          }
        );
        expect(result.status).toBe(Number(verifierExit));
        expect(result.stdout.includes('Deployment completed in')).toBe(
          verifierExit === '0'
        );
      }
    }
  );
});

// Issue #743 item 4: post-deploy-e2e-dev used to run
// `bunx playwright install --with-deps chromium` unconditionally on every
// DEV deploy (~27s, run 36176816604). It now uses the same cache-then-
// install-deps-on-hit pattern as ci.yml's E2E jobs, keyed on the
// @playwright/test version so a cache hit skips the full browser download.
describe('post-deploy-e2e-dev caches Playwright browsers', () => {
  const job = workflow
    .split('\n  post-deploy-e2e-dev:\n')[1]
    .split(/\n {2}[a-zA-Z][\w-]*:\n/)[0];

  test('no longer runs an unconditional full browser install', () => {
    // The old step was named exactly "Install Playwright browsers" with an
    // unconditional run:. The new (conditional, cache-miss-only) step is
    // named "Install Playwright browsers and dependencies", so this must
    // match the old name precisely rather than a substring of the new one.
    expect(job).not.toMatch(/- name: Install Playwright browsers\n/);
  });

  test('resolves the Playwright version and caches ~/.cache/ms-playwright by it', () => {
    expect(job).toContain(
      "PLAYWRIGHT_VERSION=$(node -e \"console.log(require('./package.json').devDependencies['@playwright/test'])\")"
    );
    expect(job).toContain(
      'uses: actions/cache@caa296126883cff596d87d8935842f9db880ef25 # v5.1.0'
    );
    expect(job).toContain('path: ~/.cache/ms-playwright');
    expect(job).toContain(
      'key: ${{ runner.os }}-playwright-${{ steps.playwright-version.outputs.version }}'
    );
  });

  test('installs the full browser only on a cache miss, and only deps on a hit', () => {
    expect(job).toContain(
      "if: steps.playwright-cache.outputs.cache-hit != 'true'"
    );
    expect(job).toContain('run: bunx playwright install --with-deps chromium');
    expect(job).toContain(
      "if: steps.playwright-cache.outputs.cache-hit == 'true'"
    );
    expect(job).toContain('bunx playwright install-deps chromium');
  });

  test('the new Playwright steps never interpolate expressions inside run:', () => {
    // zizmor template-injection guard: expressions may only be expanded in
    // `with:`/`key:` contexts here, never inline inside a `run:` script.
    // Scoped to the newly added steps only — other pre-existing steps in
    // this job (e.g. reading step outputs into a shell `if`) are unrelated
    // to this change and out of scope here.
    const playwrightStepNames = [
      'Get Playwright version',
      'Install Playwright browsers and dependencies',
      'Install Playwright system dependencies only',
    ];
    for (const stepName of playwrightStepNames) {
      const step = job
        .split(`- name: ${stepName}\n`)[1]
        .split(/\n {6}- name:/)[0];
      expect(step).not.toMatch(/\$\{\{/);
    }
  });
});
