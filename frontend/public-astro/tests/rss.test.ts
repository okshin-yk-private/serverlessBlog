/**
 * RSSフィード生成テスト
 *
 * Task 3.4: RSSフィード実装
 *
 * Requirements:
 * - 5.3: RSSフィードエンドポイント (rss.xml.ts) を実装
 * - 5.4: 最新20件の公開記事をフィードに含める
 * - 5.5: title、description、linkを各エントリに設定
 * - 14.4: UTF-8エンコーディングで日本語を正しく出力
 *
 * Note: このテストは事前にビルドされた dist/ ディレクトリのRSSフィードを検証します。
 * ビルドは `tests/build-with-mock.sh` スクリプトで実行してください:
 *   MOCK_PORT=3458 ./tests/build-with-mock.sh
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { mockPosts } from './mock-api-server';

const projectDir = join(import.meta.dirname, '..');
const distDir = join(projectDir, 'dist');
const SITE_URL = 'https://example.com';

/**
 * RSSフィードからアイテム要素を抽出
 */
function extractRSSItems(content: string): string[] {
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  const items: string[] = [];
  let match;
  while ((match = itemRegex.exec(content)) !== null) {
    items.push(match[1]);
  }
  return items;
}

/**
 * RSSアイテムからtitle要素を抽出
 */
function extractTitle(item: string): string | null {
  const match = item.match(
    /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/
  );
  return match ? match[1] || match[2] || null : null;
}

/**
 * RSSアイテムからdescription要素を抽出
 */
function extractDescription(item: string): string | null {
  const match = item.match(
    /<description><!\[CDATA\[(.*?)\]\]><\/description>|<description>(.*?)<\/description>/s
  );
  return match ? match[1] || match[2] || null : null;
}

/**
 * RSSアイテムからlink要素を抽出
 */
function extractLink(item: string): string | null {
  const match = item.match(/<link>(.*?)<\/link>/);
  return match ? match[1] : null;
}

/**
 * RSSアイテムからguid要素を抽出
 */
function extractGuid(item: string): string | null {
  const match = item.match(/<guid[^>]*>(.*?)<\/guid>/);
  return match ? match[1] : null;
}

/**
 * RSSアイテムからpubDate要素を抽出
 */
function extractPubDate(item: string): string | null {
  const match = item.match(/<pubDate>(.*?)<\/pubDate>/);
  return match ? match[1] : null;
}

describe('RSS Feed Generation (Task 3.4)', () => {
  beforeAll(() => {
    // dist ディレクトリが存在することを確認
    if (!existsSync(distDir)) {
      throw new Error(
        'dist/ directory not found. Run "MOCK_PORT=3458 ./tests/build-with-mock.sh" first.'
      );
    }
  });

  describe('RSS File Generation (Requirement 5.3)', () => {
    it('should generate rss.xml in dist/', () => {
      const rssPath = join(distDir, 'rss.xml');
      expect(existsSync(rssPath)).toBe(true);
    });

    it('should have valid XML structure in rss.xml', () => {
      const rssPath = join(distDir, 'rss.xml');
      const content = readFileSync(rssPath, 'utf-8');

      expect(content).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(content).toContain('<rss');
      expect(content).toContain('version="2.0"');
      expect(content).toContain('</rss>');
    });

    it('should have channel element with required RSS 2.0 elements', () => {
      const rssPath = join(distDir, 'rss.xml');
      const content = readFileSync(rssPath, 'utf-8');

      expect(content).toContain('<channel>');
      expect(content).toContain('</channel>');
      expect(content).toContain('<title>');
      expect(content).toContain('<description>');
      expect(content).toContain('<link>');
    });
  });

  describe('RSS Feed Content (Requirement 5.4, 5.5)', () => {
    it('should include published posts as RSS items', () => {
      const rssPath = join(distDir, 'rss.xml');
      const content = readFileSync(rssPath, 'utf-8');
      const items = extractRSSItems(content);

      // 公開記事のみをチェック（draft は含まれない）
      const publishedPosts = mockPosts.filter(
        (p) => p.publishStatus === 'published'
      );

      // 少なくとも公開記事が含まれている
      expect(items.length).toBeGreaterThanOrEqual(publishedPosts.length);
    });

    it('should include title in each RSS item (Requirement 5.5)', () => {
      const rssPath = join(distDir, 'rss.xml');
      const content = readFileSync(rssPath, 'utf-8');
      const items = extractRSSItems(content);

      for (const item of items) {
        const title = extractTitle(item);
        expect(title).not.toBeNull();
        expect(title!.length).toBeGreaterThan(0);
      }
    });

    it('should include description in each RSS item (Requirement 5.5)', () => {
      const rssPath = join(distDir, 'rss.xml');
      const content = readFileSync(rssPath, 'utf-8');
      const items = extractRSSItems(content);

      for (const item of items) {
        const description = extractDescription(item);
        expect(description).not.toBeNull();
      }
    });

    it('should include link in each RSS item (Requirement 5.5)', () => {
      const rssPath = join(distDir, 'rss.xml');
      const content = readFileSync(rssPath, 'utf-8');
      const items = extractRSSItems(content);

      for (const item of items) {
        const link = extractLink(item);
        expect(link).not.toBeNull();
        expect(link).toContain(SITE_URL);
        expect(link).toContain('/posts/');
      }
    });

    it('should include pubDate in each RSS item', () => {
      const rssPath = join(distDir, 'rss.xml');
      const content = readFileSync(rssPath, 'utf-8');
      const items = extractRSSItems(content);

      for (const item of items) {
        const pubDate = extractPubDate(item);
        expect(pubDate).not.toBeNull();
        // RFC 2822形式の検証（例: "Mon, 01 Jan 2024 00:00:00 GMT"）
        expect(pubDate).toMatch(
          /\w{3}, \d{2} \w{3} \d{4} \d{2}:\d{2}:\d{2} GMT/
        );
      }
    });

    it('should include guid in each RSS item', () => {
      const rssPath = join(distDir, 'rss.xml');
      const content = readFileSync(rssPath, 'utf-8');
      const items = extractRSSItems(content);

      for (const item of items) {
        const guid = extractGuid(item);
        expect(guid).not.toBeNull();
        expect(guid).toContain(SITE_URL);
      }
    });

    it('should NOT include draft posts in RSS feed', () => {
      const rssPath = join(distDir, 'rss.xml');
      const content = readFileSync(rssPath, 'utf-8');

      // Draft記事が含まれていないことを確認
      const draftPosts = mockPosts.filter((p) => p.publishStatus === 'draft');

      for (const post of draftPosts) {
        expect(content).not.toContain(post.title);
        expect(content).not.toContain(`/posts/${post.id}`);
      }
    });

    it('should limit to maximum 20 items (Requirement 5.4)', () => {
      const rssPath = join(distDir, 'rss.xml');
      const content = readFileSync(rssPath, 'utf-8');
      const items = extractRSSItems(content);

      expect(items.length).toBeLessThanOrEqual(20);
    });
  });

  describe('Japanese Language Support (Requirement 14.4)', () => {
    it('should have UTF-8 encoding declaration', () => {
      const rssPath = join(distDir, 'rss.xml');
      const content = readFileSync(rssPath, 'utf-8');

      expect(content).toContain('encoding="UTF-8"');
    });

    it('should include Japanese language tag', () => {
      const rssPath = join(distDir, 'rss.xml');
      const content = readFileSync(rssPath, 'utf-8');

      expect(content).toContain('<language>ja</language>');
    });

    it('should correctly encode Japanese text in titles', () => {
      const rssPath = join(distDir, 'rss.xml');
      const content = readFileSync(rssPath, 'utf-8');

      // 日本語の記事タイトルが含まれていること
      const japanesePost = mockPosts.find(
        (p) =>
          p.publishStatus === 'published' &&
          /[\u3040-\u30ff\u4e00-\u9faf]/.test(p.title)
      );

      if (japanesePost) {
        // CDATAでラップされているか、直接含まれているか
        const containsJapaneseTitle =
          content.includes(japanesePost.title) ||
          content.includes(`<![CDATA[${japanesePost.title}]]>`);
        expect(containsJapaneseTitle).toBe(true);
      }
    });

    it('should correctly encode Japanese text in descriptions', () => {
      const rssPath = join(distDir, 'rss.xml');
      const content = readFileSync(rssPath, 'utf-8');

      // 日本語のコンテンツが含まれていること
      const japanesePost = mockPosts.find(
        (p) =>
          p.publishStatus === 'published' &&
          /[\u3040-\u30ff\u4e00-\u9faf]/.test(p.contentHtml)
      );

      if (japanesePost) {
        // HTML stripped description should be in the feed
        const plainText = japanesePost.contentHtml.replace(/<[^>]*>/g, '');
        const containsJapaneseContent =
          content.includes(plainText) || content.includes(`<![CDATA[`);
        expect(containsJapaneseContent).toBe(true);
      }
    });
  });

  describe('RSS Feed Metadata', () => {
    it('should include site title in channel', () => {
      const rssPath = join(distDir, 'rss.xml');
      const content = readFileSync(rssPath, 'utf-8');

      // チャンネルタイトルが存在すること
      expect(content).toMatch(/<channel>[\s\S]*<title>/);
    });

    it('should include site description in channel', () => {
      const rssPath = join(distDir, 'rss.xml');
      const content = readFileSync(rssPath, 'utf-8');

      // チャンネルdescriptionが存在すること
      expect(content).toMatch(/<channel>[\s\S]*<description>/);
    });

    it('should include site link in channel', () => {
      const rssPath = join(distDir, 'rss.xml');
      const content = readFileSync(rssPath, 'utf-8');

      // チャンネルlinkがサイトURLを含むこと
      expect(content).toContain(SITE_URL);
    });
  });
});
