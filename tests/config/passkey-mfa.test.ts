import { test, expect } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

test('passkey deployment preserves required MFA and verifies the actual AWS configuration', () => {
  expect(() =>
    execFileSync(
      'python3',
      [
        '-m',
        'unittest',
        'discover',
        '-s',
        'scripts',
        '-p',
        'test_configure_passkey_mfa.py',
      ],
      { stdio: 'pipe' }
    )
  ).not.toThrow();
});
test('both deployments use staged MFA migration and frontend builds require readback', () => {
  const workflow = readFileSync('.github/workflows/deploy.yml', 'utf8');
  expect(workflow).toContain(
    'bash ../../../scripts/deploy_passkey_infrastructure.sh dev'
  );
  expect(workflow).toContain(
    'bash ../../../scripts/deploy_passkey_infrastructure.sh prd'
  );
  expect(workflow).toContain('VITE_ENABLE_PASSKEY: "true"');
  expect(workflow).toContain(
    'configure_passkey_mfa.py --environment "${{ needs.detect-changes.outputs.target-env }}" --check-only'
  );
});

test('only the dedicated Playwright configuration collects passkey fixtures', () => {
  for (const config of [
    'playwright.config.ts',
    'playwright.admin.config.ts',
    'playwright.aws.config.ts',
  ]) {
    const output = execFileSync(
      'bunx',
      ['playwright', 'test', '--config=' + config, '--list', '--reporter=list'],
      { encoding: 'utf8' }
    );
    expect(output).not.toContain('passkeys/passkey.spec.ts');
  }
  const dedicated = execFileSync(
    'bunx',
    [
      'playwright',
      'test',
      '--config=playwright.passkey.config.ts',
      '--list',
      '--reporter=list',
    ],
    { encoding: 'utf8' }
  );
  expect(dedicated).toContain('virtual authenticator');
}, 30000);
