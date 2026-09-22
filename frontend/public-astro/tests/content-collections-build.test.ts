import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { mockPosts } from './mock-api-server';

const project = resolve(import.meta.dirname, '..');
const workspace = resolve(project, 'test-results/content-collections');
const dist = resolve(workspace, 'dist');
const config = resolve(workspace, 'astro.config.mjs');
const exec = promisify(execFile);
let items: unknown[] = [];
let requests: URL[] = [];
let status = 200;
let origin = '';
const server = createServer((req, res) => {
  const url = new URL(req.url!, origin);
  requests.push(url);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  // Force pagination, with a cursor that must survive URL encoding.
  res.end(
    JSON.stringify(
      url.searchParams.has('nextToken')
        ? { items: items.slice(1) }
        : { items: items.slice(0, 1), nextToken: 'page+/=' }
    )
  );
});
function run(command: 'check' | 'build', withApi = true) {
  return exec(
    'bun',
    ['run', 'astro', command, '--config', relative(project, config)],
    {
      cwd: project,
      env: {
        ...process.env,
        API_URL: withApi ? origin : '',
        SITE_URL: 'https://example.com',
      },
      timeout: 60000,
      maxBuffer: 5 * 1024 * 1024,
    }
  );
}
const output = (path: string) => readFile(resolve(dist, path), 'utf8');
const article = { ...mockPosts[0], imageUrls: [], slug: 'original-slug' };

beforeAll(async () => {
  await rm(workspace, { recursive: true, force: true });
  await mkdir(workspace, { recursive: true });
  await writeFile(
    config,
    `import base from ${JSON.stringify(pathToFileURL(resolve(project, 'astro.config.mjs')).href)};\nexport default { ...base, cacheDir: ${JSON.stringify(resolve(workspace, 'cache'))}, outDir: ${JSON.stringify(dist)} };\n`
  );
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing fixture port');
  origin = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
});

describe.sequential('Content Collections build lifecycle', () => {
  it('checks offline, then shares one paginated snapshot across every route and RSS', async () => {
    items = [
      article,
      mockPosts[1],
      { ...mockPosts[2], publishStatus: 'published', title: 'Deleted article' },
    ];
    requests = [];
    await run('check');
    expect(requests).toHaveLength(0);
    await run('build');
    expect(requests).toHaveLength(2);
    expect(requests[1].searchParams.get('nextToken')).toBe('page+/=');
    for (const request of requests)
      expect(request.searchParams.get('publishStatus')).toBe('published');
    expect(await output('index.html')).toContain(mockPosts[1].title);
    for (const path of ['articles/index.html', 'rss.xml']) {
      expect(await output(path)).toContain(article.title);
    }
    expect(await output('posts/post-3/index.html')).toContain(
      'Deleted article'
    );
    expect(await output('posts/original-slug/index.html')).toContain(
      article.contentHtml
    );
    expect(await output('posts/post-1/index.html')).toContain(
      '/posts/original-slug/'
    );
  }, 90000);

  it('replaces cached posts after deletion, unpublishing and a slug change', async () => {
    items = [
      { ...article, slug: 'renamed-slug' },
      { ...mockPosts[1], publishStatus: 'draft' },
    ];
    requests = [];
    await run('build');
    expect(requests).toHaveLength(2);
    expect((await readdir(resolve(dist, 'posts'))).sort()).toEqual([
      'post-1',
      'renamed-slug',
    ]);
    for (const path of [
      'index.html',
      'articles/index.html',
      'rss.xml',
      'sitemap-0.xml',
    ]) {
      const html = await output(path);
      expect(html).toContain('/posts/renamed-slug/');
      expect(html).not.toContain('/posts/original-slug/');
      expect(html).not.toContain(mockPosts[1].title);
      expect(html).not.toContain('/posts/post-3/');
    }
  }, 90000);

  it('fails with cached content when the API is unavailable', async () => {
    status = 503;
    try {
      await expect(run('build')).rejects.toMatchObject({
        code: 1,
        stderr: expect.stringContaining('503'),
      });
    } finally {
      status = 200;
    }
  }, 90000);

  it('fails rather than silently overwriting a duplicate ID across pages', async () => {
    items = [article, { ...article, title: 'conflicting version' }];
    await expect(run('build')).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('Duplicate post ID'),
    });
  }, 90000);

  it('fails if the later page contains malformed article data', async () => {
    items = [article, { ...mockPosts[1], contentHtml: null }];
    await expect(run('build')).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining('contentHtml'),
    });
  }, 90000);

  it('clears cached content when a successful response has no posts', async () => {
    items = [];
    await run('build');
    expect(await output('rss.xml')).not.toContain('<item>');
    expect(await output('articles/index.html')).not.toContain(article.title);
    await expect(readdir(resolve(dist, 'posts'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  }, 90000);

  it('allows checking without API_URL but requires it for a real build', async () => {
    await run('check', false);
    await expect(run('build', false)).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining(
        'API_URL environment variable is not set'
      ),
    });
  }, 90000);
});
