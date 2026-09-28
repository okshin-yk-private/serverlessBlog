import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Issue #684 item 1: the admin upload UI enforces MAX_IMAGE_BYTES
// (frontend/admin/src/utils/imageValidation.ts) and the Lambda's presigned
// POST policy enforces maxUploadSizeBytes
// (go-functions/cmd/images/get_upload_url/main.go) via a content-length-range
// condition. These two limits are declared independently in two different
// languages/files, so nothing at compile time stops them from drifting apart
// (the server silently enforcing a different limit than the UI promises).
// This test parses both literal size expressions out of source and asserts
// they're numerically equal.

const GO_MAIN_PATH = resolve(
  import.meta.dir,
  '../../go-functions/cmd/images/get_upload_url/main.go'
);

const TS_VALIDATION_PATH = resolve(
  import.meta.dir,
  '../../frontend/admin/src/utils/imageValidation.ts'
);

/**
 * Evaluates a simple multiplication-of-integer-literals expression such as
 * "5 * 1024 * 1024" (spaces optional) to a number. Intentionally strict: it
 * only accepts digits, `*`, and whitespace, so it cannot be tricked into
 * evaluating arbitrary code from the source files it reads.
 */
function evalSimpleLiteralExpression(expr: string): number {
  const trimmed = expr.trim();
  if (!/^[0-9*\s]+$/.test(trimmed)) {
    throw new Error(
      `Expected a simple "N * N * N" literal expression, got: ${JSON.stringify(expr)}`
    );
  }
  const factors = trimmed.split('*').map((part) => {
    const n = Number(part.trim());
    if (!Number.isInteger(n) || part.trim() === '') {
      throw new Error(
        `Expected an integer literal, got: ${JSON.stringify(part)}`
      );
    }
    return n;
  });
  return factors.reduce((product, n) => product * n, 1);
}

function extractGoMaxUploadSizeBytes(): number {
  const source = readFileSync(GO_MAIN_PATH, 'utf-8');
  const match = source.match(/const\s+maxUploadSizeBytes\s*=\s*([0-9*\s]+)/);
  if (!match) {
    throw new Error(
      `Could not find "const maxUploadSizeBytes = ..." in ${GO_MAIN_PATH}. ` +
        'If it was renamed or restructured, update this cross-check test too.'
    );
  }
  return evalSimpleLiteralExpression(match[1]);
}

function extractTsMaxImageBytes(): number {
  const source = readFileSync(TS_VALIDATION_PATH, 'utf-8');
  const match = source.match(
    /export\s+const\s+MAX_IMAGE_BYTES\s*=\s*([0-9*\s]+);/
  );
  if (!match) {
    throw new Error(
      `Could not find "export const MAX_IMAGE_BYTES = ...;" in ${TS_VALIDATION_PATH}. ` +
        'If it was renamed or restructured, update this cross-check test too.'
    );
  }
  return evalSimpleLiteralExpression(match[1]);
}

describe('upload size limit stays in sync between admin UI and Lambda (issue #684)', () => {
  test('maxUploadSizeBytes (Go) equals MAX_IMAGE_BYTES (admin TS)', () => {
    const goBytes = extractGoMaxUploadSizeBytes();
    const tsBytes = extractTsMaxImageBytes();

    expect(goBytes).toBeGreaterThan(0);
    expect(goBytes).toBe(tsBytes);
  });

  test('the shared limit is 5 MiB', () => {
    // Pins the current agreed-upon value so a future change to either file
    // that keeps them equal but silently changes the limit is still visible
    // in a diff of this test.
    const expected = 5 * 1024 * 1024;
    expect(extractGoMaxUploadSizeBytes()).toBe(expected);
    expect(extractTsMaxImageBytes()).toBe(expected);
  });
});
