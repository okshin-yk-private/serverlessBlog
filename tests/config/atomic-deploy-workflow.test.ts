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

function runPublisher(state: string, startTime = '1710000000000') {
  // Execute the actual buildspec shell; replace external actions with shell functions.
  return spawnSync(
    'bash',
    ['-e', '-c', `cd() { :; }; bun() { printf '%s\\n' "$@"; }; ${publish}`],
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
    }
    expect(workflow.indexOf('id: revision')).toBeLessThan(
      workflow.indexOf('- name: Build Astro project')
    );
  });
});
