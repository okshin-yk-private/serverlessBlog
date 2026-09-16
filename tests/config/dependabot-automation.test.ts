import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

test('Dependabot policy/controller and security comparator behavior', () => {
  const result = spawnSync(
    'python3',
    ['tests/config/dependabot_automation_test.py', '-v'],
    { encoding: 'utf8' }
  );
  expect(result.stderr).toContain('OK');
  expect(result.status).toBe(0);
});

test('privileged controller stays on trusted code with default dry-run', () => {
  const workflow = readFileSync(
    '.github/workflows/dependabot-auto-merge.yml',
    'utf8'
  );
  expect(workflow).toContain('ref: refs/heads/develop');
  expect(workflow).toContain('persist-credentials: false');
  expect(workflow).toContain("vars.DEPENDABOT_AUTOMERGE_MODE == 'enabled'");
  expect(workflow).not.toMatch(
    /pull_request_target:|download-artifact|actions\/cache|bun install|npm install/
  );
  expect(workflow).not.toContain('github.event.workflow_run.head_sha');
});

test('security gate has no write token and blocks new secrets', () => {
  const workflow = readFileSync(
    '.github/workflows/dependency-update-security.yml',
    'utf8'
  );
  expect(workflow).not.toContain(': write');
  expect(workflow).not.toMatch(/\$\{\{\s*secrets\./);
  expect(workflow).toContain('--redact=100 --exit-code 1');
  expect(workflow).toContain('trivy image --download-db-only');
  expect(workflow).toContain('sha256sum --check');
});
