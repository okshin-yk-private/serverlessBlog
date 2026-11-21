export const ROUTE_INDEX_BUCKET_COUNT = 32;
export const ROUTE_INDEX_MAX_BUCKET_BYTES = 1024;
export const ROUTE_INDEX_WARN_THRESHOLD_BYTES = 820;

export interface RouteIndexStats {
  maxBytes: number;
  maxBucket: number;
  totalBytes: number;
  totalPaths: number;
  limitBytes: number;
  nearLimit: boolean;
}

/** Immutable per-release routing index, published atomically with the pointer. */
export function routeBucket(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % ROUTE_INDEX_BUCKET_COUNT;
}

export function createRouteIndex(revision: string, paths: string[]) {
  const buckets: string[][] = Array.from(
    { length: ROUTE_INDEX_BUCKET_COUNT },
    () => []
  );
  for (const file of [...new Set([...paths, 'release-manifest.json'])].sort()) {
    if (!file.startsWith('_astro/'))
      buckets[routeBucket('/' + file)].push('/' + file);
  }
  return buckets.map((bucketPaths, bucket) => {
    const Value = JSON.stringify(bucketPaths);
    if (Buffer.byteLength(Value) > ROUTE_INDEX_MAX_BUCKET_BYTES) {
      throw new Error(
        `Route index bucket ${bucket} exceeds ${ROUTE_INDEX_MAX_BUCKET_BYTES} bytes; release not promoted`
      );
    }
    return { Key: `routes:v1:${revision}:${bucket}`, Value };
  });
}

export function measureRouteIndexBuckets(
  entries: Array<{ Key: string; Value: string }>
): RouteIndexStats {
  let maxBytes = 0;
  let maxBucket = 0;
  let totalBytes = 0;
  let totalPaths = 0;
  entries.forEach((entry, index) => {
    const bytes = Buffer.byteLength(entry.Value);
    totalBytes += bytes;
    const parsed = JSON.parse(entry.Value) as unknown[];
    totalPaths += parsed.length;
    if (bytes > maxBytes) {
      maxBytes = bytes;
      maxBucket = index;
    }
  });
  return {
    maxBytes,
    maxBucket,
    totalBytes,
    totalPaths,
    limitBytes: ROUTE_INDEX_MAX_BUCKET_BYTES,
    nearLimit: maxBytes >= ROUTE_INDEX_WARN_THRESHOLD_BYTES,
  };
}
