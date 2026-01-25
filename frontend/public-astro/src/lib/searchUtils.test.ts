/**
 * 検索ユーティリティ関数のテスト
 *
 * Requirements:
 * - クライアントサイド検索機能
 * - タイトル、カテゴリー、タグの部分一致検索
 * - 大文字小文字を区別しない
 * - 日本語対応
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchPosts, debounce, type SearchablePost } from './searchUtils';

describe('searchUtils', () => {
  describe('searchPosts', () => {
    const testPosts: SearchablePost[] = [
      {
        id: '1',
        title: 'AWSでサーバーレスアプリを構築する',
        category: 'Technology',
        tags: ['AWS', 'serverless', 'Lambda'],
      },
      {
        id: '2',
        title: 'React入門ガイド',
        category: 'Programming',
        tags: ['React', 'JavaScript', 'frontend'],
      },
      {
        id: '3',
        title: 'TypeScriptの基礎',
        category: 'Programming',
        tags: ['TypeScript', 'JavaScript'],
      },
      {
        id: '4',
        title: '日常のライフハック',
        category: 'Lifestyle',
        tags: ['life', 'tips'],
      },
    ];

    describe('empty query', () => {
      it('should return all post IDs when query is empty', () => {
        const result = searchPosts(testPosts, '');
        expect(result).toEqual(['1', '2', '3', '4']);
      });

      it('should return all post IDs when query is only whitespace', () => {
        const result = searchPosts(testPosts, '   ');
        expect(result).toEqual(['1', '2', '3', '4']);
      });
    });

    describe('title matching', () => {
      it('should match posts by partial title (English)', () => {
        const result = searchPosts(testPosts, 'AWS');
        expect(result).toContain('1');
        expect(result).not.toContain('2');
      });

      it('should match posts by partial title (Japanese)', () => {
        const result = searchPosts(testPosts, 'サーバーレス');
        expect(result).toContain('1');
        expect(result.length).toBe(1);
      });

      it('should match posts by partial title case-insensitively', () => {
        const result = searchPosts(testPosts, 'react');
        expect(result).toContain('2');
      });

      it('should match multiple posts with same keyword in title', () => {
        // "入門" or "ガイド" in different posts
        const result = searchPosts(testPosts, '入門');
        expect(result).toContain('2');
      });
    });

    describe('category matching', () => {
      it('should match posts by exact category', () => {
        const result = searchPosts(testPosts, 'Technology');
        expect(result).toContain('1');
        expect(result.length).toBe(1);
      });

      it('should match posts by partial category', () => {
        const result = searchPosts(testPosts, 'Tech');
        expect(result).toContain('1');
      });

      it('should match posts by category case-insensitively', () => {
        const result = searchPosts(testPosts, 'programming');
        expect(result).toContain('2');
        expect(result).toContain('3');
        expect(result.length).toBe(2);
      });

      it('should match posts by partial category (Japanese)', () => {
        const result = searchPosts(testPosts, 'Life');
        expect(result).toContain('4');
      });
    });

    describe('tag matching', () => {
      it('should match posts by exact tag', () => {
        const result = searchPosts(testPosts, 'Lambda');
        expect(result).toContain('1');
        expect(result.length).toBe(1);
      });

      it('should match posts by partial tag', () => {
        const result = searchPosts(testPosts, 'server');
        expect(result).toContain('1'); // matches 'serverless' tag
      });

      it('should match posts by tag case-insensitively', () => {
        const result = searchPosts(testPosts, 'javascript');
        expect(result).toContain('2');
        expect(result).toContain('3');
      });

      it('should match multiple posts sharing the same tag', () => {
        const result = searchPosts(testPosts, 'JavaScript');
        expect(result).toContain('2');
        expect(result).toContain('3');
        expect(result.length).toBe(2);
      });
    });

    describe('combined matching', () => {
      it('should match posts by title, category, or tags', () => {
        // "front" matches tag "frontend" in post 2
        const result = searchPosts(testPosts, 'front');
        expect(result).toContain('2');
      });

      it('should return unique results when query matches multiple fields', () => {
        // TypeScript appears in both title and tags of post 3
        const result = searchPosts(testPosts, 'TypeScript');
        expect(result).toContain('3');
        // Should not have duplicates
        expect(result.filter((id) => id === '3').length).toBe(1);
      });
    });

    describe('edge cases', () => {
      it('should return empty array when no posts match', () => {
        const result = searchPosts(testPosts, 'nonexistent');
        expect(result).toEqual([]);
      });

      it('should handle empty posts array', () => {
        const result = searchPosts([], 'AWS');
        expect(result).toEqual([]);
      });

      it('should handle posts with empty tags array', () => {
        const postsWithEmptyTags: SearchablePost[] = [
          { id: '1', title: 'Test', category: 'Test', tags: [] },
        ];
        const result = searchPosts(postsWithEmptyTags, 'tag');
        expect(result).toEqual([]);
      });

      it('should trim query whitespace', () => {
        const result = searchPosts(testPosts, '  AWS  ');
        expect(result).toContain('1');
      });
    });
  });

  describe('debounce', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should delay function execution', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 200);

      debouncedFn();
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(200);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should only execute once for multiple rapid calls', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 200);

      debouncedFn();
      debouncedFn();
      debouncedFn();

      vi.advanceTimersByTime(200);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should reset timer on each call', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 200);

      debouncedFn();
      vi.advanceTimersByTime(100);
      debouncedFn();
      vi.advanceTimersByTime(100);
      debouncedFn();
      vi.advanceTimersByTime(100);

      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should pass arguments to the debounced function', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 200);

      debouncedFn('arg1', 'arg2');
      vi.advanceTimersByTime(200);

      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should use the latest arguments when called multiple times', () => {
      const fn = vi.fn();
      const debouncedFn = debounce(fn, 200);

      debouncedFn('first');
      debouncedFn('second');
      debouncedFn('third');

      vi.advanceTimersByTime(200);
      expect(fn).toHaveBeenCalledWith('third');
    });
  });
});
