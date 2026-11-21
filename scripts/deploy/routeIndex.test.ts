import { isKvsConflict } from './atomicDeploy';
import { describe, expect, test } from 'vitest';
import {
  ROUTE_INDEX_MAX_BUCKET_BYTES,
  ROUTE_INDEX_WARN_THRESHOLD_BYTES,
  createRouteIndex,
  measureRouteIndexBuckets,
  routeBucket,
} from './routeIndex';

describe('release route index', () => {
  test('contains exact Unicode object paths and manifest but excludes shared assets', () => {
    const index = createRouteIndex('r1-fixture', [
      'index.html',
      'posts/日本語/index.html',
      '_astro/old.js',
    ]);
    expect(index).toHaveLength(32);
    const paths = index.flatMap((entry) => JSON.parse(entry.Value));
    expect(paths).toEqual(
      expect.arrayContaining([
        '/index.html',
        '/posts/日本語/index.html',
        '/release-manifest.json',
      ])
    );
    expect(paths).not.toContain('/_astro/old.js');
    for (const entry of index) {
      for (const path of JSON.parse(entry.Value))
        expect(entry.Key).toBe(`routes:v1:r1-fixture:${routeBucket(path)}`);
    }
  });
  test('rejects oversized buckets before promotion rather than silently omitting paths', () => {
    expect(() => createRouteIndex('r1-fixture', ['x'.repeat(1024)])).toThrow(
      'exceeds 1024 bytes'
    );
  });
  test('measures max bucket saturation and flags releases near the 1024-byte limit', () => {
    const small = measureRouteIndexBuckets(
      createRouteIndex('r1-small', ['index.html', 'posts/hello/index.html'])
    );
    expect(small.limitBytes).toBe(ROUTE_INDEX_MAX_BUCKET_BYTES);
    expect(small.nearLimit).toBe(false);
    expect(small.totalPaths).toBe(3);

    const nearFull = measureRouteIndexBuckets(
      createRouteIndex('r1-near', [
        'a'.repeat(ROUTE_INDEX_WARN_THRESHOLD_BYTES),
      ])
    );
    expect(nearFull.maxBytes).toBeGreaterThanOrEqual(
      ROUTE_INDEX_WARN_THRESHOLD_BYTES
    );
    expect(nearFull.nearLimit).toBe(true);
  });
});

test('recognizes observed KVS stale ETag errors without retrying invalid data', () => {
  const e = new Error('Pre-Condition failed during update of Key-Value-Store');
  e.name = 'ValidationException';
  expect(isKvsConflict(e)).toBe(true);
  expect(
    isKvsConflict(
      Object.assign(new Error('Invalid key size'), {
        name: 'ValidationException',
      })
    )
  ).toBe(false);
});
