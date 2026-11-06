import { expect, test } from 'bun:test';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

test('rotation rejects drift, leaked cookies, outages, redirects and secret-bearing errors', () => {
  const result = spawnSync(
    'python3',
    ['tests/config/dev_access_rotation_test.py'],
    {
      encoding: 'utf8',
    }
  );
  expect(result.status, result.stderr).toBe(0);
});

test('rotation is explicit and DEV-only, verifies after apply and always cleans its receipt', () => {
  const workflow = readFileSync('.github/workflows/deploy.yml', 'utf8');
  const dev = workflow.slice(
    workflow.indexOf('  deploy-infrastructure-dev:'),
    workflow.indexOf('  deploy-infrastructure-prd:')
  );
  expect(workflow).toContain('rotate_dev_access:');
  expect(workflow).toContain('[ "$GITHUB_REF" != "refs/heads/develop" ]');
  expect(workflow).toContain('[ "$INPUT_ENVIRONMENT" != "dev" ]');
  expect(dev.indexOf('rotate_dev_access.py prepare')).toBeLessThan(
    dev.indexOf('Get Basic Auth Credentials from SSM')
  );
  expect(dev.indexOf('deploy_passkey_infrastructure.sh dev')).toBeLessThan(
    dev.indexOf('rotate_dev_access.py verify')
  );
  expect(dev).toContain(
    "if: always() && github.event_name == 'workflow_dispatch' && inputs.rotate_dev_access == true"
  );
  expect(dev).toContain('rotate_dev_access.py cleanup');
  expect(dev).not.toContain('upload-artifact');
});

test('legacy CI cannot be reintroduced by normal PR execution', () => {
  expect(existsSync('.github/workflows/ci.yml')).toBe(false);
  const ci = readFileSync('.github/workflows/ci-secure.yml', 'utf8');
  expect(ci).toContain('name: CI Secure');
  expect(ci).toContain('name: All CI Checks Passed');
  expect(ci).toContain('merge_group:');
});

test('provider-only Cloudflare inputs are ephemeral; edge code credentials stay sensitive', () => {
  for (const env of ['dev', 'prd']) {
    const variables = readFileSync(
      `terraform/environments/${env}/variables.tf`,
      'utf8'
    );
    const block = variables.match(
      /variable "cloudflare_api_token" \{([^}]+)\}/
    )?.[1];
    expect(block).toContain('sensitive   = true');
    expect(block).toContain('ephemeral   = true');
  }
});
