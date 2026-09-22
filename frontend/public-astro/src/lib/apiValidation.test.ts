import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAllPosts } from './api';

const post = {
  id: 'post-1',
  title: '記事',
  contentHtml: '<p>本文</p>',
  category: 'tech',
  tags: [],
  publishStatus: 'published',
  authorId: 'author',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
};
const fetchMock = vi.fn();
const response = (body: unknown) => ({ ok: true, json: async () => body });

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('API_URL', 'https://api.example.com');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('public API validation', () => {
  it('accepts public responses without count and preserves unknown date text', async () => {
    fetchMock.mockResolvedValue(
      response({ items: [{ ...post, publishedAt: 'unknown' }] })
    );
    expect(await fetchAllPosts()).toEqual([
      { ...post, publishedAt: 'unknown' },
    ]);
  });
  it.each([
    { items: null },
    { items: [{ ...post, id: '' }] },
    { items: [{ ...post, contentHtml: null }] },
    { items: [{ ...post, tags: 'invalid' }] },
    { items: [{ ...post, publishStatus: 'private' }] },
    { items: [], nextToken: 42 },
  ])('rejects malformed response %j', async (body) => {
    fetchMock
      .mockResolvedValueOnce(response(body))
      .mockResolvedValue(response({ items: [] }));
    await expect(fetchAllPosts()).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('encodes opaque cursors without changing their value', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ items: [post], nextToken: 'a+/=' }))
      .mockResolvedValueOnce(response({ items: [] }));
    await fetchAllPosts();
    const url = new URL(fetchMock.mock.calls[1][0]);
    expect(url.searchParams.get('nextToken')).toBe('a+/=');
  });
  it('rejects a repeated cursor instead of scanning indefinitely', async () => {
    fetchMock
      .mockResolvedValueOnce(response({ items: [], nextToken: 'loop' }))
      .mockResolvedValueOnce(response({ items: [], nextToken: 'loop' }))
      .mockResolvedValueOnce(response({ items: [] }));
    await expect(fetchAllPosts()).rejects.toThrow('Repeated pagination token');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
