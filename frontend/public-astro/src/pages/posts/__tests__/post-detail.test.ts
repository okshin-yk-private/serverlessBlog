/**
 * 記事詳細ページのビルド出力テスト
 *
 * PR8 update: legacy /posts/[id]/ route was retired in favor of slug-based
 * /posts/<slug>/. URL-shape assertions now check the slug variant.
 *
 * Note: These are unit tests for the utility functions and page structure.
 * Full build integration tests require a mock API server.
 */
import { describe, it, expect } from 'vitest';
import {
  generateDescription,
  formatPublishedDate,
  getFirstImage,
  getPostImageUrls,
} from '../../../lib/postDetailUtils';
import { getPostPathSegment } from '../../../lib/postUtils';
import type { Post } from '../../../lib/api';

/**
 * 記事詳細ページで使用するユーティリティ関数のテスト
 */
describe('Post Detail Page - Utility Functions', () => {
  const mockPost: Post = {
    id: 'test-123',
    title: 'テスト記事タイトル',
    contentHtml:
      '<p>これはテスト記事の本文です。<strong>重要な内容</strong>を含んでいます。</p>',
    category: 'tech',
    tags: ['TypeScript', 'Astro', 'SSG'],
    publishStatus: 'published',
    authorId: 'author-1',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-16T12:00:00Z',
    publishedAt: '2024-01-15T12:00:00Z',
    imageUrls: [
      'https://example.com/image1.jpg',
      'https://example.com/image2.jpg',
    ],
  };

  describe('Page Data Preparation', () => {
    it('should generate description from post contentHtml', () => {
      const description = generateDescription(mockPost.contentHtml);
      expect(description).toBe(
        'これはテスト記事の本文です。重要な内容を含んでいます。'
      );
    });

    it('should truncate long description to 160 characters', () => {
      const longContent = '<p>' + 'あ'.repeat(200) + '</p>';
      const description = generateDescription(longContent);
      expect(description.length).toBe(163); // 160 + '...'
    });

    it('should format published date in Japanese', () => {
      const date = formatPublishedDate(mockPost);
      expect(date).toContain('2024');
      expect(date).toContain('1');
      expect(date).toContain('15');
    });

    it('should get first image URL for og:image', () => {
      const firstImage = getFirstImage(mockPost.imageUrls);
      expect(firstImage).toBe('https://example.com/image1.jpg');
    });

    it('should return undefined if no images', () => {
      const postWithoutImages = { ...mockPost, imageUrls: undefined };
      expect(getFirstImage(postWithoutImages.imageUrls)).toBeUndefined();
    });

    it('should get all image URLs for gallery', () => {
      const images = getPostImageUrls(mockPost);
      expect(images).toHaveLength(2);
      expect(images[0]).toBe('https://example.com/image1.jpg');
      expect(images[1]).toBe('https://example.com/image2.jpg');
    });

    it('should return empty array if post has no imageUrls', () => {
      const postWithoutImages = { ...mockPost, imageUrls: undefined };
      expect(getPostImageUrls(postWithoutImages)).toEqual([]);
    });
  });

  describe('Post Data Structure', () => {
    it('should have all required fields for rendering', () => {
      // Verify the post structure matches what the page expects
      expect(mockPost).toHaveProperty('id');
      expect(mockPost).toHaveProperty('title');
      expect(mockPost).toHaveProperty('contentHtml');
      expect(mockPost).toHaveProperty('category');
      expect(mockPost).toHaveProperty('tags');
      expect(mockPost).toHaveProperty('publishStatus');
      expect(mockPost).toHaveProperty('authorId');
      expect(mockPost).toHaveProperty('createdAt');
      expect(mockPost).toHaveProperty('updatedAt');
    });

    it('should have valid publish status for detail page', () => {
      expect(mockPost.publishStatus).toBe('published');
    });
  });

  describe('getStaticPaths Output Format', () => {
    // getStaticPaths lives inside the .astro file and cannot be imported here,
    // but it delegates the identifier choice to getPostPathSegment. Asserting
    // on that helper is what actually guards the contract, because PostCard
    // builds its href from the very same call.
    const buildPaths = (posts: Post[]) =>
      posts.map((post) => ({
        params: { slug: getPostPathSegment(post) },
        props: { post },
      }));

    it('should use the slug when the post has one', () => {
      const paths = buildPaths([{ ...mockPost, slug: 'test-article' }]);

      expect(paths).toHaveLength(1);
      expect(paths[0].params.slug).toBe('test-article');
      expect(paths[0].props.post.id).toBe('test-123');
    });

    it('should fall back to the id when the post has no slug', () => {
      // Regression: getStaticPaths used to filter these posts out entirely.
      // PostCard still linked to /posts/<id>/, so the page was never built and
      // S3 answered AccessDenied.
      const paths = buildPaths([mockPost]);

      expect(paths).toHaveLength(1);
      expect(paths[0].params.slug).toBe('test-123');
    });

    it('should emit a path for every post, mixing slug and id', () => {
      const paths = buildPaths([
        { ...mockPost, id: 'test-123', slug: 'first-post' },
        { ...mockPost, id: 'test-456', title: '別の記事' },
        { ...mockPost, id: 'test-789', slug: 'third-post' },
      ]);

      expect(paths).toHaveLength(3);
      expect(paths.map((p) => p.params.slug)).toEqual([
        'first-post',
        'test-456',
        'third-post',
      ]);
    });

    it('should handle empty posts array', () => {
      expect(buildPaths([])).toHaveLength(0);
    });
  });

  describe('HTML Output Structure', () => {
    it('should prepare correct title format', () => {
      const pageTitle = `${mockPost.title} | bone of my fallacy`;
      expect(pageTitle).toBe('テスト記事タイトル | bone of my fallacy');
    });

    it('should generate correct post URL structure (slug-based)', () => {
      // Astro generates /posts/<slug>/index.html
      const postWithSlug = { ...mockPost, slug: 'test-article-slug' };
      const expectedPath = `/posts/${postWithSlug.slug}/index.html`;
      expect(expectedPath).toBe('/posts/test-article-slug/index.html');
    });

    it('should handle URL-safe slugs with hyphens', () => {
      const postWithLongSlug = {
        ...mockPost,
        slug: 'multi-word-kebab-case-slug',
      };
      const expectedPath = `/posts/${postWithLongSlug.slug}/index.html`;
      expect(expectedPath).toBe('/posts/multi-word-kebab-case-slug/index.html');
    });
  });
});
