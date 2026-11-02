import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';

test('publication Insights query and read-only fixture contracts', () => {
  const result = spawnSync(
    'python3',
    [
      '-m',
      'unittest',
      'discover',
      '-s',
      'scripts/ci',
      '-p',
      'test_publication_query.py',
    ],
    { encoding: 'utf8' }
  );
  expect(result.stderr).not.toContain('FAILED');
  expect(result.status).toBe(0);
});
