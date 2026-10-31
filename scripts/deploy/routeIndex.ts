/** Immutable per-release routing index, published atomically with the pointer. */
export function routeBucket(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 32;
}

export function createRouteIndex(revision: string, paths: string[]) {
  const buckets: string[][] = Array.from({ length: 32 }, () => []);
  for (const file of [...new Set([...paths, 'release-manifest.json'])].sort()) {
    if (!file.startsWith('_astro/'))
      buckets[routeBucket('/' + file)].push('/' + file);
  }
  return buckets.map((paths, bucket) => {
    const Value = JSON.stringify(paths);
    if (Buffer.byteLength(Value) > 1024) {
      throw new Error(
        `Route index bucket ${bucket} exceeds 1024 bytes; release not promoted`
      );
    }
    return { Key: `routes:v1:${revision}:${bucket}`, Value };
  });
}
