/**
 * 記事ユーティリティ関数のテスト
 *
 * Requirements:
 * - 2.2: 記事一覧ページ実装（抜粋テキスト、日付フォーマット）
 */
import { describe, it, expect } from 'vitest';
import {
  stripHtml,
  generateExcerpt,
  formatDateJa,
  sortPostsByDate,
} from './postUtils';
import type { Post } from './api';

describe('postUtils', () => {
  describe('stripHtml', () => {
    it('should remove HTML tags from content', () => {
      const html = '<p>Hello <strong>World</strong></p>';
      expect(stripHtml(html)).toBe('Hello World');
    });

    it('should handle empty string', () => {
      expect(stripHtml('')).toBe('');
    });

    it('should handle content with no HTML tags', () => {
      expect(stripHtml('Plain text')).toBe('Plain text');
    });

    it('should handle nested HTML tags', () => {
      const html = '<div><p>Nested <span>content</span></p></div>';
      expect(stripHtml(html)).toBe('Nested content');
    });

    it('should trim whitespace', () => {
      const html = '  <p>  Whitespace  </p>  ';
      expect(stripHtml(html)).toBe('Whitespace');
    });
  });

  describe('generateExcerpt', () => {
    it('should generate excerpt from HTML content', () => {
      const html = '<p>This is a test article content.</p>';
      expect(generateExcerpt(html)).toBe('This is a test article content.');
    });

    it('should truncate content longer than maxLength and add ellipsis', () => {
      const html =
        '<p>This is a long article content that exceeds the default maximum length.</p>';
      const excerpt = generateExcerpt(html, 20);
      expect(excerpt).toBe('This is a long artic...');
      expect(excerpt.length).toBe(23); // 20 + 3 for '...'
    });

    it('should use default maxLength of 100', () => {
      const longContent = '<p>' + 'a'.repeat(150) + '</p>';
      const excerpt = generateExcerpt(longContent);
      expect(excerpt.length).toBe(103); // 100 + 3 for '...'
    });

    it('should not add ellipsis if content is shorter than maxLength', () => {
      const html = '<p>Short</p>';
      expect(generateExcerpt(html, 100)).toBe('Short');
    });

    it('should handle empty content', () => {
      expect(generateExcerpt('')).toBe('');
    });
  });

  describe('formatDateJa', () => {
    it('should format date in Japanese format', () => {
      const date = '2024-01-15T00:00:00Z';
      const formatted = formatDateJa(date);
      // Format: 2024年1月15日
      expect(formatted).toContain('2024');
      expect(formatted).toContain('1');
      expect(formatted).toContain('15');
    });

    it('should handle different months', () => {
      const date = '2024-12-25T00:00:00Z';
      const formatted = formatDateJa(date);
      expect(formatted).toContain('2024');
      expect(formatted).toContain('12');
      expect(formatted).toContain('25');
    });
  });

  describe('sortPostsByDate', () => {
    it('should sort posts by createdAt in descending order', () => {
      const posts: Post[] = [
        {
          id: '1',
          title: 'Old Post',
          contentHtml: '<p>Old</p>',
          category: 'tech',
          tags: [],
          publishStatus: 'published',
          authorId: 'author1',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: '2',
          title: 'New Post',
          contentHtml: '<p>New</p>',
          category: 'tech',
          tags: [],
          publishStatus: 'published',
          authorId: 'author1',
          createdAt: '2024-01-10T00:00:00Z',
          updatedAt: '2024-01-10T00:00:00Z',
        },
        {
          id: '3',
          title: 'Middle Post',
          contentHtml: '<p>Middle</p>',
          category: 'tech',
          tags: [],
          publishStatus: 'published',
          authorId: 'author1',
          createdAt: '2024-01-05T00:00:00Z',
          updatedAt: '2024-01-05T00:00:00Z',
        },
      ];

      const sorted = sortPostsByDate(posts);

      expect(sorted[0].id).toBe('2'); // Newest first
      expect(sorted[1].id).toBe('3');
      expect(sorted[2].id).toBe('1'); // Oldest last
    });

    it('should not mutate the original array', () => {
      const posts: Post[] = [
        {
          id: '1',
          title: 'Post 1',
          contentHtml: '<p>Content</p>',
          category: 'tech',
          tags: [],
          publishStatus: 'published',
          authorId: 'author1',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: '2',
          title: 'Post 2',
          contentHtml: '<p>Content</p>',
          category: 'tech',
          tags: [],
          publishStatus: 'published',
          authorId: 'author1',
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
        },
      ];

      const originalFirst = posts[0].id;
      sortPostsByDate(posts);
      expect(posts[0].id).toBe(originalFirst);
    });

    it('should handle empty array', () => {
      const sorted = sortPostsByDate([]);
      expect(sorted).toEqual([]);
    });

    it('should handle single post', () => {
      const posts: Post[] = [
        {
          id: '1',
          title: 'Only Post',
          contentHtml: '<p>Content</p>',
          category: 'tech',
          tags: [],
          publishStatus: 'published',
          authorId: 'author1',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      const sorted = sortPostsByDate(posts);
      expect(sorted).toHaveLength(1);
      expect(sorted[0].id).toBe('1');
    });
  });
});
