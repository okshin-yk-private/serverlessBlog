import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';

test('develop merge-queue helper refuses non-develop, unready and changed PRs', () => {
  const result = spawnSync(
    'python3',
    ['tests/config/enqueue_pr_test.py', '-v'],
    {
      encoding: 'utf8',
    }
  );
  expect(result.stderr).toContain('OK');
  expect(result.status).toBe(0);
});
