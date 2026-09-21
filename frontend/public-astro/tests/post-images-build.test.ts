import { beforeAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { JSDOM } from 'jsdom';
import sharp from 'sharp';
import { mockPosts } from './mock-api-server';

const project = resolve(import.meta.dirname, '..');
const dist = resolve(project, 'test-results/post-images-build/dist');
const execFileAsync = promisify(execFile);
let buildLog = '';

async function documentAt(path: string) {
  return new JSDOM(await readFile(resolve(dist, path), 'utf8')).window.document;
}

describe('article image and prefetch build output', () => {
  beforeAll(async () => {
    const large = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: '#24783b' },
    })
      .png()
      .toBuffer();
    const small = await sharp({
      create: { width: 240, height: 160, channels: 4, background: '#12152680' },
    })
      .png()
      .toBuffer();
    let origin = '';
    const server = createServer((req, res) => {
      const path = new URL(req.url!, origin).pathname;
      if (path === '/posts') {
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            items: [
              {
                ...mockPosts[0],
                slug: 'responsive-image-post',
                contentHtml:
                  '<p>本文は変更しない</p><img src="/images/body.png" alt="本文画像">',
                imageUrls: [
                  `${origin}/images/large.png`,
                  '/images/small.png',
                  '/images/missing.png',
                  'https://external.invalid/photo.png',
                  '/images/animation.gif',
                ],
              },
              mockPosts[1],
            ],
            count: 2,
          })
        );
      } else if (path === '/images/large.png' || path === '/images/small.png') {
        res.setHeader('Content-Type', 'image/png');
        res.end(path.endsWith('large.png') ? large : small);
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing fixture port');
    origin = `http://127.0.0.1:${address.port}`;
    try {
      const result = await execFileAsync(
        'bun',
        ['run', 'astro', 'build', '--outDir', dist],
        {
          cwd: project,
          env: { ...process.env, API_URL: origin, SITE_URL: origin },
          timeout: 60000,
          maxBuffer: 5 * 1024 * 1024,
        }
      );
      buildLog = result.stdout + result.stderr;
    } finally {
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
    }
  }, 90000);

  it('emits correctly sized WebP candidates, including legacy ID routes', async () => {
    for (const route of ['responsive-image-post', 'post-1']) {
      const doc = await documentAt(`posts/${route}/index.html`);
      const hero = doc.querySelector('.hero-image img')!;
      expect(hero.getAttribute('alt')).toBe(mockPosts[0].title);
      expect(hero.getAttribute('width')).toBe('1200');
      expect(hero.getAttribute('height')).toBe('800');
      expect(hero.getAttribute('loading')).toBe('eager');
      expect(hero.getAttribute('fetchpriority')).toBe('high');
      expect(hero.getAttribute('sizes')).toContain('800px');
      const candidates = hero
        .getAttribute('srcset')!
        .split(',')
        .map((part) => part.trim().split(/\s+/));
      expect(candidates.length).toBeGreaterThan(1);
      for (const [url, descriptor] of candidates) {
        expect(url).toMatch(/^\/_astro\/.*\.webp$/);
        const width = parseInt(descriptor);
        expect(width).toBeLessThanOrEqual(1200);
        const metadata = await sharp(
          await readFile(resolve(dist, url.slice(1)))
        ).metadata();
        expect(metadata.width).toBe(width);
        expect(metadata.height).toBe(Math.round((width * 800) / 1200));
        expect(metadata.format).toBe('webp');
      }
      const gallery = doc.querySelector('.image-gallery img')!;
      expect(gallery.getAttribute('width')).toBe('240');
      expect(gallery.getAttribute('height')).toBe('160');
      expect(gallery.getAttribute('loading')).toBe('lazy');
      expect(gallery.getAttribute('srcset')).toMatch(/ 240w$/);
      expect(gallery.getAttribute('srcset')!.split(',')).toHaveLength(1);
    }
  });

  it('preserves unsupported/missing images, raw body HTML and posts without images', async () => {
    const doc = await documentAt('posts/responsive-image-post/index.html');
    for (const src of [
      '/images/missing.png',
      'https://external.invalid/photo.png',
      '/images/animation.gif',
    ]) {
      const image = doc.querySelector(`.image-gallery img[src="${src}"]`);
      expect(image).not.toBeNull();
      expect(image!.hasAttribute('srcset')).toBe(false);
    }
    expect(doc.querySelector('.post-content img')?.getAttribute('src')).toBe(
      '/images/body.png'
    );
    expect(buildLog).toContain('[post-image]');
    const noImages = await documentAt('posts/post-2/index.html');
    expect(noImages.querySelector('.hero-image')).toBeNull();
    expect(noImages.querySelector('.image-gallery')).toBeNull();
  });

  it('opts only article navigation links into hover prefetch', async () => {
    const home = await documentAt('index.html');
    expect(
      home
        .querySelector('.home-section-heading a')
        ?.getAttribute('data-astro-prefetch')
    ).toBe('hover');
    const articles = await documentAt('articles/index.html');
    const links = articles.querySelectorAll('.post-title a');
    expect(links.length).toBe(2);
    for (const link of links)
      expect(link.getAttribute('data-astro-prefetch')).toBe('hover');
    const post = await documentAt('posts/responsive-image-post/index.html');
    expect(
      post.querySelector('.back-link')?.getAttribute('data-astro-prefetch')
    ).toBe('hover');
    for (const doc of [home, articles, post]) {
      expect(doc.querySelector('script[type="module"]')).not.toBeNull();
      expect(
        doc.querySelector('header.site-header a[data-astro-prefetch]')
      ).toBeNull();
      expect(
        doc.querySelector('a[href^="https:"][data-astro-prefetch]')
      ).toBeNull();
    }
  });
});
