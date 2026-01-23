/**
 * API Service Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchPosts, fetchPost } from './api';
import axios from 'axios';

vi.mock('axios');

describe('API Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchPosts', () => {
    it('フィルタなしで記事一覧を取得する', async () => {
      // Arrange
      const mockResponse = {
        data: {
          items: [],
          count: 0,
        },
      };
      vi.mocked(axios.get).mockResolvedValueOnce(mockResponse);

      // Act
      const result = await fetchPosts();

      // Assert
      expect(axios.get).toHaveBeenCalledWith('/api/posts', {
        params: {},
      });
      expect(result).toEqual(mockResponse.data);
    });

    it('カテゴリフィルタで記事一覧を取得する', async () => {
      // Arrange
      const mockResponse = {
        data: {
          items: [],
          count: 0,
        },
      };
      vi.mocked(axios.get).mockResolvedValueOnce(mockResponse);

      // Act
      const result = await fetchPosts({ category: 'technology' });

      // Assert
      expect(axios.get).toHaveBeenCalledWith('/api/posts', {
        params: { category: 'technology' },
      });
      expect(result).toEqual(mockResponse.data);
    });

    it('limitとnextTokenを指定して記事一覧を取得する', async () => {
      // Arrange
      const mockResponse = {
        data: {
          items: [],
          count: 0,
          nextToken: 'token-456',
        },
      };
      vi.mocked(axios.get).mockResolvedValueOnce(mockResponse);

      // Act
      const result = await fetchPosts({
        limit: 20,
        nextToken: 'token-123',
      });

      // Assert
      expect(axios.get).toHaveBeenCalledWith('/api/posts', {
        params: {
          limit: 20,
          nextToken: 'token-123',
        },
      });
      expect(result).toEqual(mockResponse.data);
    });

    it('qパラメータで直接検索クエリを指定して記事一覧を取得する', async () => {
      // Arrange
      const mockResponse = {
        data: {
          items: [],
          count: 0,
        },
      };
      vi.mocked(axios.get).mockResolvedValueOnce(mockResponse);

      // Act - q parameter is used directly
      const result = await fetchPosts({ q: 'search term' });

      // Assert - q is sent as-is
      expect(axios.get).toHaveBeenCalledWith('/api/posts', {
        params: { q: 'search term' },
      });
      expect(result).toEqual(mockResponse.data);
    });

    it('タグフィルタで記事一覧を取得する（tags→qに変換）', async () => {
      // Arrange
      const mockResponse = {
        data: {
          items: [],
          count: 0,
        },
      };
      vi.mocked(axios.get).mockResolvedValueOnce(mockResponse);

      // Act - tags is converted to q parameter for backward compatibility
      const result = await fetchPosts({ tags: 'react' });

      // Assert - tags is now sent as 'q' parameter
      expect(axios.get).toHaveBeenCalledWith('/api/posts', {
        params: { q: 'react' },
      });
      expect(result).toEqual(mockResponse.data);
    });

    it('カテゴリとタグフィルタで記事一覧を取得する（tags→qに変換）', async () => {
      // Arrange
      const mockResponse = {
        data: {
          items: [],
          count: 0,
        },
      };
      vi.mocked(axios.get).mockResolvedValueOnce(mockResponse);

      // Act - tags is converted to q parameter
      const result = await fetchPosts({
        category: 'technology',
        tags: 'react',
      });

      // Assert - tags is now sent as 'q' parameter
      expect(axios.get).toHaveBeenCalledWith('/api/posts', {
        params: {
          category: 'technology',
          q: 'react',
        },
      });
      expect(result).toEqual(mockResponse.data);
    });

    it('すべてのフィルタを指定して記事一覧を取得する（tags→qに変換）', async () => {
      // Arrange
      const mockResponse = {
        data: {
          items: [],
          count: 0,
        },
      };
      vi.mocked(axios.get).mockResolvedValueOnce(mockResponse);

      // Act - tags is converted to q parameter
      const result = await fetchPosts({
        category: 'life',
        tags: 'nodejs',
        limit: 10,
        nextToken: 'token-abc',
      });

      // Assert - tags is now sent as 'q' parameter
      expect(axios.get).toHaveBeenCalledWith('/api/posts', {
        params: {
          category: 'life',
          q: 'nodejs',
          limit: 10,
          nextToken: 'token-abc',
        },
      });
      expect(result).toEqual(mockResponse.data);
    });

    it('simulateErrorパラメータを指定して記事一覧を取得する', async () => {
      // Arrange
      const mockResponse = {
        data: {
          items: [],
          count: 0,
        },
      };
      vi.mocked(axios.get).mockResolvedValueOnce(mockResponse);

      // Act
      const result = await fetchPosts({
        simulateError: 'network',
      });

      // Assert
      expect(axios.get).toHaveBeenCalledWith('/api/posts', {
        params: {
          simulateError: 'network',
        },
      });
      expect(result).toEqual(mockResponse.data);
    });

    it('simulateRetryパラメータを指定して記事一覧を取得する', async () => {
      // Arrange
      const mockResponse = {
        data: {
          items: [],
          count: 0,
        },
      };
      vi.mocked(axios.get).mockResolvedValueOnce(mockResponse);

      // Act
      const result = await fetchPosts({
        simulateRetry: 'true',
      });

      // Assert
      expect(axios.get).toHaveBeenCalledWith('/api/posts', {
        params: {
          simulateRetry: 'true',
        },
      });
      expect(result).toEqual(mockResponse.data);
    });
  });

  describe('fetchPost', () => {
    it('記事IDを指定して記事詳細を取得する', async () => {
      // Arrange
      const mockPost = {
        id: 'post-123',
        title: 'Test Post',
        contentHtml: '<p>Test content</p>',
        category: 'technology',
        tags: ['react'],
        publishStatus: 'published',
        authorId: 'author-1',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
      };
      const mockResponse = {
        data: mockPost,
      };
      vi.mocked(axios.get).mockResolvedValueOnce(mockResponse);

      // Act
      const result = await fetchPost('post-123');

      // Assert
      expect(axios.get).toHaveBeenCalledWith('/api/posts/post-123');
      expect(result).toEqual(mockPost);
    });
  });
});
