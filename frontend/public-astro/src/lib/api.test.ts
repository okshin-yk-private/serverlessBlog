/**
 * API呼び出しモジュールのテスト
 *
 * Requirements:
 * - 2.1: REST APIから公開記事を取得
 * - 2.5: API_URL環境変数からAPIエンドポイントを取得
 * - 2.6: API不可時は明確なエラーメッセージでビルドを失敗
 * - 2.8: カーソルベースのページネーションで全記事を再帰的に取得
 * - 2.9: API失敗時に指数バックオフで最大3回リトライ
 * - 2.10: 1000件までの記事を処理
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchAllPosts,
  fetchPost,
  fetchAllPublicMindmaps,
  fetchPublicMindmap,
  type Post,
  type PostListResponse,
  type PublicMindmap,
  type MindmapListResponse,
} from './api';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('API Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('API_URL', 'https://api.example.com');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('fetchAllPosts', () => {
    it('should fetch all published posts from API', async () => {
      const mockPosts: Post[] = [
        {
          id: '1',
          title: 'Test Post 1',
          contentHtml: '<p>Content 1</p>',
          category: 'tech',
          tags: ['test'],
          publishStatus: 'published',
          authorId: 'author1',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      const mockResponse: PostListResponse = {
        items: mockPosts,
        count: 1,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await fetchAllPosts();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/posts?publishStatus=published',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
      expect(result).toEqual(mockPosts);
    });

    it('should use API_URL environment variable', async () => {
      vi.stubEnv('API_URL', 'https://custom-api.example.com');

      const mockResponse: PostListResponse = {
        items: [],
        count: 0,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      await fetchAllPosts();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://custom-api.example.com'),
        expect.any(Object)
      );
    });

    it('should handle pagination and fetch all pages', async () => {
      const page1Posts: Post[] = [
        {
          id: '1',
          title: 'Post 1',
          contentHtml: '<p>Content 1</p>',
          category: 'tech',
          tags: [],
          publishStatus: 'published',
          authorId: 'author1',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      const page2Posts: Post[] = [
        {
          id: '2',
          title: 'Post 2',
          contentHtml: '<p>Content 2</p>',
          category: 'tech',
          tags: [],
          publishStatus: 'published',
          authorId: 'author1',
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
        },
      ];

      const page1Response: PostListResponse = {
        items: page1Posts,
        count: 1,
        nextToken: 'token123',
      };

      const page2Response: PostListResponse = {
        items: page2Posts,
        count: 1,
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => page1Response,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => page2Response,
        });

      const result = await fetchAllPosts();

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://api.example.com/posts?publishStatus=published',
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://api.example.com/posts?publishStatus=published&nextToken=token123',
        expect.any(Object)
      );
      expect(result).toEqual([...page1Posts, ...page2Posts]);
    });

    it('should retry with exponential backoff on failure', async () => {
      const mockPosts: Post[] = [
        {
          id: '1',
          title: 'Test Post',
          contentHtml: '<p>Content</p>',
          category: 'tech',
          tags: [],
          publishStatus: 'published',
          authorId: 'author1',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      const mockResponse: PostListResponse = {
        items: mockPosts,
        count: 1,
      };

      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse,
        });

      const result = await fetchAllPosts();

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result).toEqual(mockPosts);
    });

    it('should fail after max retries (3)', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(fetchAllPosts()).rejects.toThrow(
        'Failed to fetch posts after 3 retries'
      );
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should fail with clear error message when API is unavailable', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(fetchAllPosts()).rejects.toThrow(
        'API request failed: 500 Internal Server Error'
      );
    });

    it('should throw error when API_URL is not set', async () => {
      vi.stubEnv('API_URL', '');

      await expect(fetchAllPosts()).rejects.toThrow(
        'API_URL environment variable is not set'
      );
    });

    it('should handle up to 1000 posts without issues', async () => {
      // Generate 1000 mock posts across multiple pages
      const generatePosts = (count: number, startId: number): Post[] =>
        Array.from({ length: count }, (_, i) => ({
          id: String(startId + i),
          title: `Post ${startId + i}`,
          contentHtml: `<p>Content ${startId + i}</p>`,
          category: 'tech',
          tags: [],
          publishStatus: 'published' as const,
          authorId: 'author1',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        }));

      // 10 pages of 100 posts each = 1000 posts
      const pages = 10;
      const postsPerPage = 100;

      for (let i = 0; i < pages; i++) {
        const posts = generatePosts(postsPerPage, i * postsPerPage);
        const response: PostListResponse = {
          items: posts,
          count: postsPerPage,
          nextToken: i < pages - 1 ? `token${i + 1}` : undefined,
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: async () => response,
        });
      }

      const result = await fetchAllPosts();

      expect(result).toHaveLength(1000);
      expect(mockFetch).toHaveBeenCalledTimes(10);
    });
  });

  describe('fetchPost', () => {
    it('should fetch a single post by ID', async () => {
      const mockPost: Post = {
        id: '123',
        title: 'Test Post',
        contentHtml: '<p>Content</p>',
        category: 'tech',
        tags: ['test'],
        publishStatus: 'published',
        authorId: 'author1',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPost,
      });

      const result = await fetchPost('123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/posts/123',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
      expect(result).toEqual(mockPost);
    });

    it('should throw error for non-existent post', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(fetchPost('nonexistent')).rejects.toThrow(
        'API request failed: 404 Not Found'
      );
    });

    it('should retry on failure and succeed', async () => {
      const mockPost: Post = {
        id: '123',
        title: 'Test Post',
        contentHtml: '<p>Content</p>',
        category: 'tech',
        tags: [],
        publishStatus: 'published',
        authorId: 'author1',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockPost,
        });

      const result = await fetchPost('123');

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockPost);
    });
  });

  describe('fetchAllPublicMindmaps', () => {
    it('should fetch all published mindmaps from public API', async () => {
      const mockMindmaps: PublicMindmap[] = [
        {
          id: 'mm-1',
          title: 'Test Mindmap 1',
          nodes: '{"id":"root","text":"Root","children":[]}',
          publishStatus: 'published',
          authorId: 'author1',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      const mockResponse: MindmapListResponse = {
        items: mockMindmaps,
        count: 1,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await fetchAllPublicMindmaps();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/public/mindmaps',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
      expect(result).toEqual(mockMindmaps);
    });

    it('should handle pagination and fetch all pages', async () => {
      const page1Mindmaps: PublicMindmap[] = [
        {
          id: 'mm-1',
          title: 'Mindmap 1',
          nodes: '{"id":"root","text":"Root","children":[]}',
          publishStatus: 'published',
          authorId: 'author1',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      const page2Mindmaps: PublicMindmap[] = [
        {
          id: 'mm-2',
          title: 'Mindmap 2',
          nodes: '{"id":"root","text":"Root2","children":[]}',
          publishStatus: 'published',
          authorId: 'author1',
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
        },
      ];

      const page1Response: MindmapListResponse = {
        items: page1Mindmaps,
        count: 1,
        nextToken: 'mmtoken123',
      };

      const page2Response: MindmapListResponse = {
        items: page2Mindmaps,
        count: 1,
      };

      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => page1Response,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => page2Response,
        });

      const result = await fetchAllPublicMindmaps();

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://api.example.com/public/mindmaps',
        expect.any(Object)
      );
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://api.example.com/public/mindmaps?nextToken=mmtoken123',
        expect.any(Object)
      );
      expect(result).toEqual([...page1Mindmaps, ...page2Mindmaps]);
    });

    it('should retry with exponential backoff on network failure', async () => {
      const mockMindmaps: PublicMindmap[] = [
        {
          id: 'mm-1',
          title: 'Test Mindmap',
          nodes: '{"id":"root","text":"Root","children":[]}',
          publishStatus: 'published',
          authorId: 'author1',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      const mockResponse: MindmapListResponse = {
        items: mockMindmaps,
        count: 1,
      };

      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockResponse,
        });

      const result = await fetchAllPublicMindmaps();

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(result).toEqual(mockMindmaps);
    });

    it('should fail after max retries (3)', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(fetchAllPublicMindmaps()).rejects.toThrow(
        'Failed to fetch posts after 3 retries'
      );
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should fail with clear error message when API returns error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(fetchAllPublicMindmaps()).rejects.toThrow(
        'API request failed: 500 Internal Server Error'
      );
    });

    it('should return empty array when no mindmaps exist', async () => {
      const mockResponse: MindmapListResponse = {
        items: [],
        count: 0,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await fetchAllPublicMindmaps();

      expect(result).toEqual([]);
    });
  });

  describe('fetchPublicMindmap', () => {
    it('should fetch a single published mindmap by ID', async () => {
      const mockMindmap: PublicMindmap = {
        id: 'mm-123',
        title: 'Test Mindmap',
        nodes: '{"id":"root","text":"Root","children":[]}',
        publishStatus: 'published',
        authorId: 'author1',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockMindmap,
      });

      const result = await fetchPublicMindmap('mm-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.example.com/public/mindmaps/mm-123',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
      expect(result).toEqual(mockMindmap);
    });

    it('should throw error for non-existent mindmap', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(fetchPublicMindmap('nonexistent')).rejects.toThrow(
        'API request failed: 404 Not Found'
      );
    });

    it('should retry on network failure and succeed', async () => {
      const mockMindmap: PublicMindmap = {
        id: 'mm-123',
        title: 'Test Mindmap',
        nodes: '{"id":"root","text":"Root","children":[]}',
        publishStatus: 'published',
        authorId: 'author1',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockMindmap,
        });

      const result = await fetchPublicMindmap('mm-123');

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockMindmap);
    });
  });
});
