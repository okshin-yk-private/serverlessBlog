/**
 * RSS ユーティリティ関数のテスト
 *
 * Task 3.4: RSSフィード実装
 *
 * Requirements:
 * - 5.3: RSSフィードエンドポイント (rss.xml.ts) を実装
 * - 5.4: 最新20件の公開記事をフィードに含める
 * - 5.5: title、description、linkを各エントリに設定
 * - 14.4: UTF-8エンコーディングで日本語を正しく出力
 */

import { describe, expect, it } from 'vitest';
import type { Post } from './api';
import {
  postToRSSItem,
  generateRSSDescription,
  buildPostUrl,
  getLatestPostsForRSS,
  postsToRSSItems,
  escapeXml,
  formatRFC2822,
  createDefaultRSSConfig,
  MAX_RSS_ITEMS,
  MAX_DESCRIPTION_LENGTH,
} from './rssUtils';

// テスト用のモックPost生成関数
function createMockPost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'test-post-1',
    title: 'テスト記事タイトル',
    contentHtml:
      '<p>これはテスト記事の本文です。日本語コンテンツを含みます。</p>',
    category: 'テクノロジー',
    tags: ['JavaScript', 'TypeScript'],
    publishStatus: 'published',
    authorId: 'author-1',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T12:00:00Z',
    publishedAt: '2024-01-15T10:30:00Z',
    imageUrls: ['https://example.com/images/test.jpg'],
    ...overrides,
  };
}

describe('rssUtils', () => {
  describe('postToRSSItem', () => {
    it('should convert a post to RSS item with all properties', () => {
      const post = createMockPost();
      const siteUrl = 'https://example.com';

      const item = postToRSSItem(post, siteUrl);

      expect(item.title).toBe('テスト記事タイトル');
      expect(item.description).toBe(
        'これはテスト記事の本文です。日本語コンテンツを含みます。'
      );
      expect(item.link).toBe('https://example.com/posts/test-post-1/');
      expect(item.guid).toBe('https://example.com/posts/test-post-1/');
      expect(item.pubDate).toEqual(new Date('2024-01-15T10:30:00Z'));
      expect(item.category).toBe('テクノロジー');
      expect(item.author).toBe('author-1');
    });

    it('should use createdAt when publishedAt is not available', () => {
      const post = createMockPost({ publishedAt: undefined });
      const siteUrl = 'https://example.com';

      const item = postToRSSItem(post, siteUrl);

      expect(item.pubDate).toEqual(new Date('2024-01-15T10:00:00Z'));
    });

    it('should handle posts without category', () => {
      const post = createMockPost({ category: '' });
      const siteUrl = 'https://example.com';

      const item = postToRSSItem(post, siteUrl);

      expect(item.category).toBeUndefined();
    });

    it('should handle posts without author', () => {
      const post = createMockPost({ authorId: '' });
      const siteUrl = 'https://example.com';

      const item = postToRSSItem(post, siteUrl);

      expect(item.author).toBeUndefined();
    });
  });

  describe('generateRSSDescription', () => {
    it('should strip HTML tags and return plain text', () => {
      const html = '<p>Hello <strong>World</strong></p>';
      const description = generateRSSDescription(html);
      expect(description).toBe('Hello World');
    });

    it('should truncate long text to MAX_DESCRIPTION_LENGTH characters', () => {
      // 250文字以上の長いコンテンツ
      const longContent = '<p>' + 'あ'.repeat(250) + '</p>';
      const description = generateRSSDescription(longContent);

      expect(description.length).toBe(MAX_DESCRIPTION_LENGTH + 3); // +3 for "..."
      expect(description.endsWith('...')).toBe(true);
    });

    it('should not truncate text shorter than MAX_DESCRIPTION_LENGTH', () => {
      const shortContent = '<p>短いテキスト</p>';
      const description = generateRSSDescription(shortContent);

      expect(description).toBe('短いテキスト');
      expect(description.endsWith('...')).toBe(false);
    });

    it('should handle Japanese text correctly (Requirement 14.4)', () => {
      const japaneseHtml =
        '<h1>日本語タイトル</h1><p>これは日本語のテスト記事です。</p>';
      const description = generateRSSDescription(japaneseHtml);

      expect(description).toBe('日本語タイトルこれは日本語のテスト記事です。');
    });

    it('should handle empty content', () => {
      const description = generateRSSDescription('');
      expect(description).toBe('');
    });

    it('should handle nested HTML tags', () => {
      const nestedHtml = '<div><p>外側<span>内側</span></p></div>';
      const description = generateRSSDescription(nestedHtml);
      expect(description).toBe('外側内側');
    });
  });

  describe('buildPostUrl', () => {
    it('should build correct URL with trailing slash', () => {
      const url = buildPostUrl('post-123', 'https://example.com');
      expect(url).toBe('https://example.com/posts/post-123/');
    });

    it('should handle site URL with trailing slash', () => {
      const url = buildPostUrl('post-456', 'https://example.com/');
      expect(url).toBe('https://example.com/posts/post-456/');
    });

    it('should handle Japanese post IDs', () => {
      const url = buildPostUrl('日本語記事', 'https://example.com');
      expect(url).toBe('https://example.com/posts/日本語記事/');
    });
  });

  describe('getLatestPostsForRSS', () => {
    it('should return maximum MAX_RSS_ITEMS posts', () => {
      // 25件の記事を作成
      const posts = Array.from({ length: 25 }, (_, i) =>
        createMockPost({
          id: `post-${i}`,
          createdAt: `2024-01-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
        })
      );

      const result = getLatestPostsForRSS(posts);

      expect(result.length).toBe(MAX_RSS_ITEMS);
    });

    it('should sort by publishedAt in descending order', () => {
      const posts = [
        createMockPost({ id: 'old', publishedAt: '2024-01-01T10:00:00Z' }),
        createMockPost({ id: 'new', publishedAt: '2024-01-20T10:00:00Z' }),
        createMockPost({ id: 'mid', publishedAt: '2024-01-10T10:00:00Z' }),
      ];

      const result = getLatestPostsForRSS(posts);

      expect(result[0].id).toBe('new');
      expect(result[1].id).toBe('mid');
      expect(result[2].id).toBe('old');
    });

    it('should use createdAt when publishedAt is not available', () => {
      const posts = [
        createMockPost({
          id: 'old',
          publishedAt: undefined,
          createdAt: '2024-01-01T10:00:00Z',
        }),
        createMockPost({
          id: 'new',
          publishedAt: undefined,
          createdAt: '2024-01-20T10:00:00Z',
        }),
      ];

      const result = getLatestPostsForRSS(posts);

      expect(result[0].id).toBe('new');
      expect(result[1].id).toBe('old');
    });

    it('should return all posts when fewer than MAX_RSS_ITEMS', () => {
      const posts = [
        createMockPost({ id: 'post-1' }),
        createMockPost({ id: 'post-2' }),
      ];

      const result = getLatestPostsForRSS(posts);

      expect(result.length).toBe(2);
    });

    it('should handle empty post list', () => {
      const result = getLatestPostsForRSS([]);
      expect(result).toEqual([]);
    });
  });

  describe('postsToRSSItems', () => {
    it('should convert posts to RSS items', () => {
      const posts = [
        createMockPost({ id: 'post-1', title: '記事1' }),
        createMockPost({ id: 'post-2', title: '記事2' }),
      ];
      const siteUrl = 'https://example.com';

      const items = postsToRSSItems(posts, siteUrl);

      expect(items.length).toBe(2);
      expect(items[0].title).toBe('記事1');
      expect(items[1].title).toBe('記事2');
    });

    it('should limit to MAX_RSS_ITEMS (Requirement 5.4)', () => {
      const posts = Array.from({ length: 30 }, (_, i) =>
        createMockPost({ id: `post-${i}` })
      );
      const siteUrl = 'https://example.com';

      const items = postsToRSSItems(posts, siteUrl);

      expect(items.length).toBe(MAX_RSS_ITEMS);
    });

    it('should include title, description, and link (Requirement 5.5)', () => {
      const posts = [createMockPost()];
      const siteUrl = 'https://example.com';

      const items = postsToRSSItems(posts, siteUrl);

      expect(items[0]).toHaveProperty('title');
      expect(items[0]).toHaveProperty('description');
      expect(items[0]).toHaveProperty('link');
      expect(items[0].title).toBeTruthy();
      expect(items[0].description).toBeTruthy();
      expect(items[0].link).toBeTruthy();
    });
  });

  describe('escapeXml', () => {
    it('should escape ampersand', () => {
      expect(escapeXml('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    it('should escape less than', () => {
      expect(escapeXml('a < b')).toBe('a &lt; b');
    });

    it('should escape greater than', () => {
      expect(escapeXml('a > b')).toBe('a &gt; b');
    });

    it('should escape double quotes', () => {
      expect(escapeXml('"quoted"')).toBe('&quot;quoted&quot;');
    });

    it('should escape single quotes', () => {
      expect(escapeXml("it's")).toBe('it&#39;s');
    });

    it('should escape multiple special characters', () => {
      expect(escapeXml('<a href="test">&</a>')).toBe(
        '&lt;a href=&quot;test&quot;&gt;&amp;&lt;/a&gt;'
      );
    });

    it('should handle empty string', () => {
      expect(escapeXml('')).toBe('');
    });

    it('should handle string without special characters', () => {
      expect(escapeXml('Hello World 日本語')).toBe('Hello World 日本語');
    });
  });

  describe('formatRFC2822', () => {
    it('should format date in RFC 2822 format', () => {
      const date = new Date('2024-01-15T10:30:00Z');
      const formatted = formatRFC2822(date);

      // RFC 2822形式の検証（例: "Mon, 15 Jan 2024 10:30:00 GMT"）
      expect(formatted).toMatch(
        /\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} GMT/
      );
    });

    it('should return UTC time string', () => {
      const date = new Date('2024-06-15T14:30:00Z');
      const formatted = formatRFC2822(date);

      expect(formatted).toContain('14:30:00 GMT');
    });
  });

  describe('createDefaultRSSConfig', () => {
    it('should create RSS config with site name', () => {
      const config = createDefaultRSSConfig('https://example.com', 'My Blog');

      expect(config.title).toBe('My Blog');
      expect(config.siteUrl).toBe('https://example.com');
      expect(config.language).toBe('ja');
    });

    it('should include default description', () => {
      const config = createDefaultRSSConfig(
        'https://example.com',
        'テストブログ'
      );

      expect(config.description).toBe('テストブログの最新記事をお届けします');
    });

    it('should set language to Japanese', () => {
      const config = createDefaultRSSConfig('https://example.com', 'Blog');

      expect(config.language).toBe('ja');
    });
  });

  describe('Constants', () => {
    it('should have MAX_RSS_ITEMS set to 20 (Requirement 5.4)', () => {
      expect(MAX_RSS_ITEMS).toBe(20);
    });

    it('should have MAX_DESCRIPTION_LENGTH set to 200', () => {
      expect(MAX_DESCRIPTION_LENGTH).toBe(200);
    });
  });
});
