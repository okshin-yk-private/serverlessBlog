import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

test('the mandatory lint job executes the actual restore runbook tests without AWS setup', () => {
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  const job = ci.slice(ci.indexOf('  lint:'), ci.indexOf('  typecheck:'));
  expect(job).toContain('python3 -m unittest discover -s tests/docs -v');
  expect(job).not.toContain('configure-aws-credentials');
});
