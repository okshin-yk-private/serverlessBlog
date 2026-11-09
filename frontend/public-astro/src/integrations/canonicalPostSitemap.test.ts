import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findPostAliases } from './canonicalPostSitemap';

const site = new URL('https://example.com/');
const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((dir) => rm(dir, { recursive: true }))
  );
});

async function fixture(pages: Record<string, string>) {
  const dir = await mkdtemp(join(tmpdir(), 'canonical-sitemap-'));
  directories.push(dir);
  for (const [path, html] of Object.entries(pages)) {
    await mkdir(join(dir, path), { recursive: true });
    await writeFile(join(dir, path, 'index.html'), html);
  }
  return {
    dir: pathToFileURL(`${dir}/`),
    pages: Object.keys(pages).map((pathname) => ({ pathname })),
  };
}

const head = (path: string) =>
  `<html><head><link rel="canonical" href="${new URL(path, site).href}"></head><body></body></html>`;

describe('canonical post sitemap', () => {
  it('excludes only generated aliases, retaining UUID canonicals and static pages', async () => {
    const uuid = '11111111-2222-4333-8444-555555555555';
    const { dir, pages } = await fixture({
      'posts/old-id/': head('/posts/friendly-slug/'),
      'posts/friendly-slug/': head('/posts/friendly-slug/'),
      [`posts/${uuid}/`]: head(`/posts/${uuid}/`),
      'posts/empty-slug/': head('/posts/empty-slug/'),
      'posts/same-id-and-slug/': head('/posts/same-id-and-slug/'),
      'about/': head('/'),
      'articles/': head('/'),
    });
    expect(await findPostAliases(dir, pages, site)).toEqual(
      new Set(['https://example.com/posts/old-id/'])
    );
  });

  it('does not exclude posts with missing, external, or ungenerated canonical targets', async () => {
    const { dir, pages } = await fixture({
      'posts/missing/': '<html><head></head><body></body></html>',
      'posts/external/': head('https://other.example/posts/target/'),
      'posts/absent/': head('/posts/not-generated/'),
      'posts/target/': head('/posts/target/'),
      'posts/body-link/':
        '<html><head></head><body><link rel="canonical" href="https://example.com/posts/target/"></body></html>',
    });
    expect(await findPostAliases(dir, pages, site)).toEqual(new Set());
  });

  it('handles leading slashes and HTML-escaped canonical attributes', async () => {
    const { dir, pages } = await fixture({
      'posts/old/':
        '<head><link href="https://example.com/posts/a&amp;b/" rel="canonical"></head>',
      'posts/a&b/': head('/posts/a&b/'),
    });
    pages[0].pathname = `/${pages[0].pathname}`;
    expect(await findPostAliases(dir, pages, site)).toEqual(
      new Set(['https://example.com/posts/old/'])
    );
  });

  it('handles an empty content snapshot without retaining old exclusions', async () => {
    const { dir } = await fixture({});
    expect(await findPostAliases(dir, [], site)).toEqual(new Set());
  });

  it('fails the build if a generated post cannot be inspected', async () => {
    const { dir } = await fixture({});
    await expect(
      findPostAliases(dir, [{ pathname: 'posts/missing/' }], site)
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
