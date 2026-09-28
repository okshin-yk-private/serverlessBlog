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

test('terraform updates are a single grouped Thursday entry covering every directory', () => {
  const config = Bun.YAML.parse(
    readFileSync('.github/dependabot.yml', 'utf8')
  ) as {
    updates: Array<{
      'package-ecosystem': string;
      directory?: string;
      directories?: string[];
      schedule?: { day?: string };
      groups?: Record<string, { 'group-by'?: string }>;
    }>;
  };

  const terraformEntries = config.updates.filter(
    (update) => update['package-ecosystem'] === 'terraform'
  );
  expect(terraformEntries).toHaveLength(1);

  const [entry] = terraformEntries;
  expect(entry.directory).toBeUndefined();
  expect(entry.directories).toEqual(
    expect.arrayContaining([
      '/terraform',
      '/terraform/bootstrap',
      '/terraform/examples/complete',
      '/terraform/environments/*',
      '/terraform/modules/*',
    ])
  );
  expect(entry.directories).toHaveLength(5);
  expect(entry.schedule?.day).toBe('thursday');

  const groupNames = Object.keys(entry.groups ?? {});
  expect(groupNames).toHaveLength(1);
  expect(entry.groups?.[groupNames[0]]?.['group-by']).toBe('dependency-name');

  // No terraform entry targets an environment (or any other directory) on its own.
  for (const update of config.updates) {
    if (update['package-ecosystem'] !== 'terraform') continue;
    expect(update.directory).toBeUndefined();
  }
});

test('every required-check workflow also reports on the merge queue', () => {
  for (const file of [
    'ci.yml',
    'security-scan.yml',
    'dependency-update-security.yml',
  ]) {
    const workflow = readFileSync(`.github/workflows/${file}`, 'utf8');
    expect(workflow).toMatch(
      /\n {2}merge_group:\n {4}types: \[checks_requested\]\n/
    );
  }
  // Merge groups have no PR payload: base branch comes from setup-labels.
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  expect(ci).not.toContain('github.base_ref ==');
  expect(ci).toContain('github.event.merge_group.head_ref');
});
