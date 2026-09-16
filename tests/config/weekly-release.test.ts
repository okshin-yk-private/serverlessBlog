import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';

test('weekly production release rejects stale, untested or changed candidates', () => {
  const result = spawnSync(
    'python3',
    ['tests/config/weekly_release_test.py', '-v'],
    {
      encoding: 'utf8',
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    }
  );
  expect(result.stderr).toContain('OK');
  expect(result.status).toBe(0);
});
