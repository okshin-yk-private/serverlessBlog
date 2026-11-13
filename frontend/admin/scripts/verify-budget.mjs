#!/usr/bin/env node
// Reproducible asset budgets, not a measurement of browser transfer or LCP.
import { readFileSync, realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

try {
  const dist = realpathSync(process.argv[2] ?? 'dist');
  const readAsset = (file) => {
    if (typeof file !== 'string') throw new Error('Missing asset path');
    const path = realpathSync(resolve(dist, file));
    if (!path.startsWith(dist + sep)) throw new Error('Asset outside dist');
    return readFileSync(path);
  };
  const manifest = JSON.parse(readAsset('.vite/manifest.json'));
  const roots = ['index.html', 'src/pages/LoginPage.tsx'];
  if (!manifest['index.html']?.isEntry) throw new Error('Missing entry');
  const seen = new Set();
  const js = new Set();
  const css = new Set();
  function visit(key) {
    if (seen.has(key)) return;
    seen.add(key);
    const chunk = manifest[key];
    if (!chunk || typeof chunk.file !== 'string' || !chunk.file.endsWith('.js'))
      throw new Error(`Missing JavaScript chunk: ${key}`);
    js.add(chunk.file);
    for (const field of ['imports', 'css']) {
      if (
        chunk[field] !== undefined &&
        (!Array.isArray(chunk[field]) ||
          chunk[field].some((v) => typeof v !== 'string'))
      )
        throw new Error(`Invalid ${field}: ${key}`);
    }
    for (const file of chunk.css ?? []) css.add(file);
    // Other lazy pages are intentionally excluded; shared static imports counted once.
    for (const dependency of chunk.imports ?? []) visit(dependency);
  }
  roots.forEach(visit);
  for (const [name, files, limit] of [
    ['login JavaScript', js, 180 * 1024],
    ['login CSS', css, 190 * 1024],
  ]) {
    if (files.size === 0) throw new Error(`No ${name} assets`);
    const bytes = [...files].reduce(
      (sum, file) => sum + gzipSync(readAsset(file)).length,
      0
    );
    console.log(
      `${name}: ${bytes} gzip bytes / ${limit} (${files.size} files)`
    );
    if (bytes > limit) throw new Error(`${name} exceeds budget`);
  }
} catch (error) {
  console.error(`Admin budget failed: ${error.message}`);
  process.exitCode = 1;
}
