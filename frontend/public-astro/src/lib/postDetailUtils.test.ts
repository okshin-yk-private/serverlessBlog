/**
 * 記事詳細ページ用ユーティリティ関数のテスト
 *
 * Task 2.3: 記事詳細ページ実装
 *
 * Requirements:
 * - 2.3: 記事詳細ページ実装
 * - 2.7: CSS/アセットのバンドル（ユーティリティレベル）
 */
import { describe, it, expect } from 'vitest';
import {
  generateDescription,
  formatPublishedDate,
  getFirstImage,
  formatPostDate,
  getPostImageUrls,
} from './postDetailUtils';
import type { Post } from './api';

describe('postDetailUtils', () => {
  describe('generateDescription', () => {
    it('should generate description from HTML content with max 160 characters', () => {
      const html = '<p>This is a test article about software development.</p>';
      const description = generateDescription(html);
      expect(description).toBe(
        'This is a test article about software development.'
      );
    });

    it('should truncate description to 160 characters and add ellipsis', () => {
      const html = '<p>' + 'a'.repeat(200) + '</p>';
      const description = generateDescription(html);
      expect(description.length).toBe(163); // 160 + 3 for '...'
    });

    it('should strip HTML tags from content', () => {
      const html = '<p>Hello <strong>World</strong> and <em>Universe</em></p>';
      const description = generateDescription(html);
      expect(description).toBe('Hello World and Universe');
    });

    it('should handle empty content', () => {
      expect(generateDescription('')).toBe('');
    });

    it('should not add ellipsis if content is shorter than 160', () => {
      const html = '<p>Short content</p>';
      const description = generateDescription(html);
      expect(description).toBe('Short content');
      expect(description.endsWith('...')).toBe(false);
    });

    it('should handle Japanese content correctly', () => {
      const html =
        '<p>これは日本語のテスト記事です。ソフトウェア開発について書いています。</p>';
      const description = generateDescription(html);
      expect(description).toBe(
        'これは日本語のテスト記事です。ソフトウェア開発について書いています。'
      );
    });

    it('should handle long Japanese content', () => {
      const html = '<p>' + 'あ'.repeat(200) + '</p>';
      const description = generateDescription(html);
      expect(description.length).toBe(163); // 160 + 3 for '...'
    });
  });

  describe('formatPublishedDate', () => {
    it('should format publishedAt date if available', () => {
      const post: Post = {
        id: '1',
        title: 'Test',
        contentHtml: '<p>Content</p>',
        category: 'tech',
        tags: [],
        publishStatus: 'published',
        authorId: 'author1',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-10T00:00:00Z',
        publishedAt: '2024-01-05T00:00:00Z',
      };
      const date = formatPublishedDate(post);
      expect(date).toContain('2024');
      expect(date).toContain('1');
      expect(date).toContain('5');
    });

    it('should fallback to createdAt if publishedAt is not available', () => {
      const post: Post = {
        id: '1',
        title: 'Test',
        contentHtml: '<p>Content</p>',
        category: 'tech',
        tags: [],
        publishStatus: 'published',
        authorId: 'author1',
        createdAt: '2024-03-15T00:00:00Z',
        updatedAt: '2024-03-20T00:00:00Z',
      };
      const date = formatPublishedDate(post);
      expect(date).toContain('2024');
      expect(date).toContain('3');
      expect(date).toContain('15');
    });
  });

  describe('getFirstImage', () => {
    it('should return the first image URL if available', () => {
      const imageUrls = [
        'https://example.com/image1.jpg',
        'https://example.com/image2.jpg',
      ];
      expect(getFirstImage(imageUrls)).toBe('https://example.com/image1.jpg');
    });

    it('should return undefined if imageUrls is empty', () => {
      expect(getFirstImage([])).toBeUndefined();
    });

    it('should return undefined if imageUrls is undefined', () => {
      expect(getFirstImage(undefined)).toBeUndefined();
    });
  });

  describe('formatPostDate', () => {
    it('should format ISO date to Japanese format', () => {
      const date = formatPostDate('2024-06-20T12:30:00Z');
      expect(date).toContain('2024');
      expect(date).toContain('6');
      expect(date).toContain('20');
    });
  });

  describe('getPostImageUrls', () => {
    it('should return imageUrls array if available', () => {
      const post: Post = {
        id: '1',
        title: 'Test',
        contentHtml: '<p>Content</p>',
        category: 'tech',
        tags: [],
        publishStatus: 'published',
        authorId: 'author1',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        imageUrls: [
          'https://example.com/img1.jpg',
          'https://example.com/img2.jpg',
        ],
      };
      expect(getPostImageUrls(post)).toEqual([
        'https://example.com/img1.jpg',
        'https://example.com/img2.jpg',
      ]);
    });

    it('should return empty array if imageUrls is undefined', () => {
      const post: Post = {
        id: '1',
        title: 'Test',
        contentHtml: '<p>Content</p>',
        category: 'tech',
        tags: [],
        publishStatus: 'published',
        authorId: 'author1',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };
      expect(getPostImageUrls(post)).toEqual([]);
    });

    it('should return empty array if imageUrls is empty', () => {
      const post: Post = {
        id: '1',
        title: 'Test',
        contentHtml: '<p>Content</p>',
        category: 'tech',
        tags: [],
        publishStatus: 'published',
        authorId: 'author1',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        imageUrls: [],
      };
      expect(getPostImageUrls(post)).toEqual([]);
    });
  });
});
