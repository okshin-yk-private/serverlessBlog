/**
 * JSON-LD Utility Functions Tests
 *
 * Task 3.2: JSON-LD構造化データ実装
 *
 * TDD - RED Phase: Write failing tests first
 *
 * Requirements:
 * - 4.1: JSON-LD structured data with @type: "BlogPosting" schema for post pages
 * - 4.2: Include headline, datePublished, dateModified, and author properties
 * - 4.3: If the post has images, include image property
 * - 4.4: JSON-LD structured data with @type: "WebSite" schema for home page
 */

import { describe, it, expect } from 'vitest';
import {
  generateBlogPostingJsonLd,
  generateWebSiteJsonLd,
  type BlogPostingJsonLd,
  type WebSiteJsonLd,
  type JsonLdPost,
} from './jsonLdUtils';

const SITE_NAME = 'bone of my fallacy';
const SITE_URL = 'https://example.com';

describe('jsonLdUtils', () => {
  describe('generateBlogPostingJsonLd', () => {
    it('should generate BlogPosting schema with required fields', () => {
      const post: JsonLdPost = {
        id: '123',
        title: 'My First Blog Post',
        description: 'This is my first blog post about programming.',
        publishedAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-16T12:00:00Z',
        authorName: 'John Doe',
      };

      const result = generateBlogPostingJsonLd(post, SITE_URL);

      expect(result['@context']).toBe('https://schema.org');
      expect(result['@type']).toBe('BlogPosting');
      expect(result.headline).toBe('My First Blog Post');
      expect(result.description).toBe(
        'This is my first blog post about programming.'
      );
      expect(result.datePublished).toBe('2024-01-15T10:00:00Z');
      expect(result.dateModified).toBe('2024-01-16T12:00:00Z');
    });

    it('should include author as Person type', () => {
      const post: JsonLdPost = {
        id: '123',
        title: 'My First Blog Post',
        description: 'Description',
        publishedAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-16T12:00:00Z',
        authorName: 'John Doe',
      };

      const result = generateBlogPostingJsonLd(post, SITE_URL);

      expect(result.author).toEqual({
        '@type': 'Person',
        name: 'John Doe',
      });
    });

    it('should include mainEntityOfPage with correct URL', () => {
      const post: JsonLdPost = {
        id: '123',
        title: 'My First Blog Post',
        description: 'Description',
        publishedAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-16T12:00:00Z',
        authorName: 'John Doe',
      };

      const result = generateBlogPostingJsonLd(post, SITE_URL);

      expect(result.mainEntityOfPage).toEqual({
        '@type': 'WebPage',
        '@id': 'https://example.com/posts/123',
      });
    });

    it('should include image property when post has images', () => {
      const post: JsonLdPost = {
        id: '123',
        title: 'My First Blog Post',
        description: 'Description',
        publishedAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-16T12:00:00Z',
        authorName: 'John Doe',
        imageUrl: 'https://example.com/images/hero.jpg',
      };

      const result = generateBlogPostingJsonLd(post, SITE_URL);

      expect(result.image).toBe('https://example.com/images/hero.jpg');
    });

    it('should NOT include image property when post has no images', () => {
      const post: JsonLdPost = {
        id: '123',
        title: 'My First Blog Post',
        description: 'Description',
        publishedAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-16T12:00:00Z',
        authorName: 'John Doe',
      };

      const result = generateBlogPostingJsonLd(post, SITE_URL);

      expect(result.image).toBeUndefined();
    });

    it('should handle Japanese characters in headline and description', () => {
      const post: JsonLdPost = {
        id: '456',
        title: '日本語タイトル',
        description: 'これは日本語の説明文です。',
        publishedAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-16T12:00:00Z',
        authorName: '山田太郎',
      };

      const result = generateBlogPostingJsonLd(post, SITE_URL);

      expect(result.headline).toBe('日本語タイトル');
      expect(result.description).toBe('これは日本語の説明文です。');
      expect(result.author).toEqual({
        '@type': 'Person',
        name: '山田太郎',
      });
    });

    it('should use publishedAt as dateModified when updatedAt is not provided', () => {
      const post: JsonLdPost = {
        id: '123',
        title: 'My First Blog Post',
        description: 'Description',
        publishedAt: '2024-01-15T10:00:00Z',
        authorName: 'John Doe',
      };

      const result = generateBlogPostingJsonLd(post, SITE_URL);

      expect(result.dateModified).toBe('2024-01-15T10:00:00Z');
    });

    it('should truncate headline longer than 110 characters', () => {
      const post: JsonLdPost = {
        id: '123',
        title: 'A'.repeat(150),
        description: 'Description',
        publishedAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-16T12:00:00Z',
        authorName: 'John Doe',
      };

      const result = generateBlogPostingJsonLd(post, SITE_URL);

      expect(result.headline.length).toBeLessThanOrEqual(110);
      expect(result.headline.endsWith('...')).toBe(true);
    });

    it('should handle special characters in title', () => {
      const post: JsonLdPost = {
        id: '123',
        title: 'Test "Title" with <special> & characters',
        description: 'Description with "quotes" and <tags>',
        publishedAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-16T12:00:00Z',
        authorName: 'John Doe',
      };

      const result = generateBlogPostingJsonLd(post, SITE_URL);

      // JSON-LD should preserve the characters as-is (JSON encoding handles escaping)
      expect(result.headline).toBe('Test "Title" with <special> & characters');
      expect(result.description).toBe('Description with "quotes" and <tags>');
    });

    it('should handle site URL with trailing slash', () => {
      const post: JsonLdPost = {
        id: '123',
        title: 'My First Blog Post',
        description: 'Description',
        publishedAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-16T12:00:00Z',
        authorName: 'John Doe',
      };

      const result = generateBlogPostingJsonLd(post, 'https://example.com/');

      expect(result.mainEntityOfPage['@id']).toBe(
        'https://example.com/posts/123'
      );
    });
  });

  describe('generateWebSiteJsonLd', () => {
    it('should generate WebSite schema with required fields', () => {
      const result = generateWebSiteJsonLd(SITE_NAME, SITE_URL);

      expect(result['@context']).toBe('https://schema.org');
      expect(result['@type']).toBe('WebSite');
      expect(result.name).toBe('bone of my fallacy');
      expect(result.url).toBe('https://example.com');
    });

    it('should include description when provided', () => {
      const description = 'A blog about programming and technology';

      const result = generateWebSiteJsonLd(SITE_NAME, SITE_URL, description);

      expect(result.description).toBe(
        'A blog about programming and technology'
      );
    });

    it('should NOT include description when not provided', () => {
      const result = generateWebSiteJsonLd(SITE_NAME, SITE_URL);

      expect(result.description).toBeUndefined();
    });

    it('should handle Japanese site name and description', () => {
      const result = generateWebSiteJsonLd(
        '私のブログ',
        SITE_URL,
        'プログラミングと技術に関するブログです'
      );

      expect(result.name).toBe('私のブログ');
      expect(result.description).toBe('プログラミングと技術に関するブログです');
    });

    it('should handle site URL with trailing slash', () => {
      const result = generateWebSiteJsonLd(SITE_NAME, 'https://example.com/');

      expect(result.url).toBe('https://example.com');
    });

    it('should NOT include potentialAction for search (simplified implementation)', () => {
      const result = generateWebSiteJsonLd(SITE_NAME, SITE_URL);

      expect(result.potentialAction).toBeUndefined();
    });
  });

  describe('JSON-LD schema validation', () => {
    it('should generate valid JSON string for BlogPosting', () => {
      const post: JsonLdPost = {
        id: '123',
        title: 'Test Post',
        description: 'Test description',
        publishedAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-16T12:00:00Z',
        authorName: 'John Doe',
        imageUrl: 'https://example.com/image.jpg',
      };

      const jsonLd = generateBlogPostingJsonLd(post, SITE_URL);
      const jsonString = JSON.stringify(jsonLd);

      // Should be valid JSON
      expect(() => JSON.parse(jsonString)).not.toThrow();

      // Should contain required schema.org fields
      const parsed = JSON.parse(jsonString);
      expect(parsed['@context']).toBe('https://schema.org');
      expect(parsed['@type']).toBe('BlogPosting');
    });

    it('should generate valid JSON string for WebSite', () => {
      const jsonLd = generateWebSiteJsonLd(
        SITE_NAME,
        SITE_URL,
        'Site description'
      );
      const jsonString = JSON.stringify(jsonLd);

      // Should be valid JSON
      expect(() => JSON.parse(jsonString)).not.toThrow();

      // Should contain required schema.org fields
      const parsed = JSON.parse(jsonString);
      expect(parsed['@context']).toBe('https://schema.org');
      expect(parsed['@type']).toBe('WebSite');
    });

    it('should handle emoji in content', () => {
      const post: JsonLdPost = {
        id: '123',
        title: '🚀 My Awesome Post',
        description: 'Description with emoji 👍',
        publishedAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-16T12:00:00Z',
        authorName: 'John 🌟',
      };

      const jsonLd = generateBlogPostingJsonLd(post, SITE_URL);
      const jsonString = JSON.stringify(jsonLd);

      expect(() => JSON.parse(jsonString)).not.toThrow();
      expect(jsonLd.headline).toBe('🚀 My Awesome Post');
    });
  });

  describe('Type exports', () => {
    it('should export BlogPostingJsonLd type', () => {
      const blogPosting: BlogPostingJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: 'Test',
        description: 'Test',
        datePublished: '2024-01-15T10:00:00Z',
        dateModified: '2024-01-15T10:00:00Z',
        author: { '@type': 'Person', name: 'Test' },
        mainEntityOfPage: {
          '@type': 'WebPage',
          '@id': 'https://example.com/posts/1',
        },
      };

      expect(blogPosting['@type']).toBe('BlogPosting');
    });

    it('should export WebSiteJsonLd type', () => {
      const webSite: WebSiteJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'Test Site',
        url: 'https://example.com',
      };

      expect(webSite['@type']).toBe('WebSite');
    });
  });
});
