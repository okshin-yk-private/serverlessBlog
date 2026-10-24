import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const workflow = readFileSync('.github/workflows/deploy.yml', 'utf8');
const buildScript = workflow
  .split('- name: Build Astro project')[1]
  .split('run: |\n')[1]
  .split('        env:')[0]
  .split('\n')
  .map((line) => line.slice(10))
  .join('\n')
  .replaceAll('${{ needs.detect-changes.outputs.target-env }}', 'dev');

test.each(['401', '200'])(
  'DEV build loads scoped API credentials only for protected API (%s)',
  (status) => {
    const result = spawnSync(
      'bash',
      [
        '-e',
        '-c',
        `
    curl() { printf '%s' "$TEST_HTTP_STATUS"; }
    aws() { printf 'fixture-credential'; }
    bun() {
      if [ "$TEST_HTTP_STATUS" = "401" ]; then
        test "$BASIC_AUTH_USERNAME" = "fixture-credential" && test "$BASIC_AUTH_PASSWORD" = "fixture-credential" || return 1
      else
        test -z "$BASIC_AUTH_USERNAME" && test -z "$BASIC_AUTH_PASSWORD" || return 1
      fi
    }
    ls() { :; }; du() { echo '1K dist/'; }
    ${buildScript}
  `,
      ],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          TEST_HTTP_STATUS: status,
          BASIC_AUTH_USERNAME: '',
          BASIC_AUTH_PASSWORD: '',
          API_URL: 'https://fixture.test/api',
        },
      }
    );
    expect(result.status).toBe(0);
    expect(buildScript).not.toContain('GITHUB_ENV');
    expect(buildScript).not.toContain('GITHUB_OUTPUT');
  }
);
