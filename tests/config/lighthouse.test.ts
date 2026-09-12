import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startStaticSite } from '../../frontend/public-astro/scripts/lighthouse.mjs';

const folders: string[] = [];
afterEach(async () => {
  await Promise.all(
    folders
      .splice(0)
      .map((folder) => rm(folder, { recursive: true, force: true }))
  );
});

async function fixture() {
  const folder = await mkdtemp(join(tmpdir(), 'lighthouse-site-'));
  folders.push(folder);
  const dist = join(folder, 'dist');
  await mkdir(join(dist, 'posts', '日本語'), { recursive: true });
  await writeFile(join(dist, 'index.html'), '<h1>Home</h1>');
  await writeFile(join(dist, '404.html'), '<h1>Not found</h1>');
  await writeFile(join(dist, 'posts', '日本語', 'index.html'), '<h1>Post</h1>');
  await writeFile(join(dist, 'style.css'), 'body{color:black}');
  return { folder, dist };
}

describe('local Lighthouse build server', () => {
  test('collects real pages including encoded paths, and serves assets with the correct type', async () => {
    const { dist } = await fixture();
    const site = await startStaticSite(dist);
    try {
      expect(site.urls).toHaveLength(2);
      expect(site.urls.map((url: string) => new URL(url).pathname)).toEqual([
        '/',
        '/posts/%E6%97%A5%E6%9C%AC%E8%AA%9E/',
      ]);
      expect(await (await fetch(site.urls[1])).text()).toBe('<h1>Post</h1>');
      const response = await fetch(new URL('/style.css', site.urls[0]));
      expect(response.headers.get('content-type')).toBe('text/css');
      expect((await fetch(new URL('/missing', site.urls[0]))).status).toBe(404);
    } finally {
      await site.close();
    }
  });

  test('refuses files outside dist even through symlinks and malformed URL escapes', async () => {
    const { folder, dist } = await fixture();
    await writeFile(join(folder, 'outside.txt'), 'outside fixture');
    await symlink(join(folder, 'outside.txt'), join(dist, 'escape.txt'));
    const site = await startStaticSite(dist);
    try {
      for (const path of ['/escape.txt', '/..%2Foutside.txt', '/%00', '/%ZZ']) {
        const response = await fetch(new URL(path, site.urls[0]));
        expect(response.status).toBe(404);
        expect(await response.text()).not.toContain('outside fixture');
      }
    } finally {
      await site.close();
    }
  });

  test('a missing or empty build fails instead of reporting a successful zero-page audit', async () => {
    const { folder } = await fixture();
    await expect(startStaticSite(join(folder, 'missing'))).rejects.toThrow();
    const empty = join(folder, 'empty');
    await mkdir(empty);
    await expect(startStaticSite(empty)).rejects.toThrow('no HTML pages');
  });
});
