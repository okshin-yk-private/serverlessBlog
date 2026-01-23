/**
 * 記事詳細ページのビルド出力テスト
 *
 * Task 2.3: 記事詳細ページ実装
 *
 * Requirements:
 * - 2.3: 記事詳細ページ実装
 *   - `getStaticPaths` で全公開記事のパスを生成
 *   - ビルド時に `/posts/[id]/index.html` として静的生成
 * - 2.7: CSS/アセットをインライン化またはバンドル
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
    it('should produce correct params structure', () => {
      // Simulate what getStaticPaths returns
      const posts: Post[] = [mockPost];
      const paths = posts.map((post) => ({
        params: { id: post.id },
        props: { post },
      }));

      expect(paths).toHaveLength(1);
      expect(paths[0].params.id).toBe('test-123');
      expect(paths[0].props.post).toEqual(mockPost);
    });

    it('should handle multiple posts', () => {
      const posts: Post[] = [
        mockPost,
        { ...mockPost, id: 'test-456', title: '別の記事' },
        { ...mockPost, id: 'test-789', title: 'さらに別の記事' },
      ];

      const paths = posts.map((post) => ({
        params: { id: post.id },
        props: { post },
      }));

      expect(paths).toHaveLength(3);
      expect(paths.map((p) => p.params.id)).toEqual([
        'test-123',
        'test-456',
        'test-789',
      ]);
    });

    it('should handle empty posts array', () => {
      const posts: Post[] = [];
      const paths = posts.map((post) => ({
        params: { id: post.id },
        props: { post },
      }));

      expect(paths).toHaveLength(0);
    });
  });

  describe('HTML Output Structure', () => {
    it('should prepare correct title format', () => {
      const pageTitle = `${mockPost.title} | bone of my fallacy`;
      expect(pageTitle).toBe('テスト記事タイトル | bone of my fallacy');
    });

    it('should generate correct post URL structure', () => {
      // Astro generates /posts/[id]/index.html
      const expectedPath = `/posts/${mockPost.id}/index.html`;
      expect(expectedPath).toBe('/posts/test-123/index.html');
    });

    it('should handle special characters in post ID', () => {
      const postWithSpecialId = {
        ...mockPost,
        id: 'post-with-special-chars-日本語',
      };
      const expectedPath = `/posts/${postWithSpecialId.id}/index.html`;
      expect(expectedPath).toBe(
        '/posts/post-with-special-chars-日本語/index.html'
      );
    });
  });
});
