import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { LoaderContext } from 'astro/loaders';
import { fetchAllPosts } from '../lib/api';
import { publishedPostsLoader } from './posts';

vi.mock('../lib/api', () => ({ fetchAllPosts: vi.fn() }));
const post = {
  id: 'one',
  title: 'Title',
  contentHtml: '<p>Body</p>',
  category: 'tech',
  tags: [],
  publishStatus: 'published' as const,
  authorId: 'author',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};
function context() {
  const store = { clear: vi.fn(), set: vi.fn() };
  const parseData = vi.fn(async ({ data }) => data);
  // Only the loader-facing portion of Astro's context is needed by this fixture.
  return { store, parseData } as unknown as LoaderContext;
}
beforeEach(() => {
  vi.mocked(fetchAllPosts).mockReset();
  vi.stubEnv('BLOG_CONTENT_PHASE', 'build');
});
afterEach(() => vi.unstubAllEnvs());

it('leaves the old store untouched and rejects when fetching fails', async () => {
  const ctx = context();
  vi.mocked(fetchAllPosts).mockRejectedValue(new Error('Unavailable'));
  await expect(publishedPostsLoader().load(ctx)).rejects.toThrow('Unavailable');
  expect(ctx.store.clear).not.toHaveBeenCalled();
  expect(ctx.store.set).not.toHaveBeenCalled();
});
it('validates every entry before replacing the store', async () => {
  const ctx = context();
  vi.mocked(fetchAllPosts).mockResolvedValue([post, { ...post, id: 'two' }]);
  vi.mocked(ctx.parseData)
    .mockResolvedValueOnce(post)
    .mockRejectedValueOnce(new Error('Invalid data'));
  await expect(publishedPostsLoader().load(ctx)).rejects.toThrow(
    'Invalid data'
  );
  expect(ctx.store.clear).not.toHaveBeenCalled();
  expect(ctx.store.set).not.toHaveBeenCalled();
});
it('rejects duplicate IDs before touching the previous snapshot', async () => {
  const ctx = context();
  vi.mocked(fetchAllPosts).mockResolvedValue([post, post]);
  await expect(publishedPostsLoader().load(ctx)).rejects.toThrow(
    'Duplicate post ID: one'
  );
  expect(ctx.store.clear).not.toHaveBeenCalled();
});
it('replaces the snapshot and excludes drafts', async () => {
  const ctx = context();
  vi.mocked(fetchAllPosts).mockResolvedValue([
    post,
    { ...post, id: 'draft', publishStatus: 'draft' },
  ]);
  await publishedPostsLoader().load(ctx);
  expect(ctx.store.clear).toHaveBeenCalledOnce();
  expect(ctx.store.set).toHaveBeenCalledExactlyOnceWith({
    id: post.id,
    data: post,
  });
});
it('sync clears stale content without contacting the API', async () => {
  vi.stubEnv('BLOG_CONTENT_PHASE', 'sync');
  const ctx = context();
  await publishedPostsLoader().load(ctx);
  expect(fetchAllPosts).not.toHaveBeenCalled();
  expect(ctx.store.clear).toHaveBeenCalledOnce();
});
it('an absent phase define still requires the API', async () => {
  vi.stubEnv('BLOG_CONTENT_PHASE', undefined);
  const ctx = context();
  vi.mocked(fetchAllPosts).mockRejectedValue(new Error('API_URL missing'));
  await expect(publishedPostsLoader().load(ctx)).rejects.toThrow(
    'API_URL missing'
  );
});
