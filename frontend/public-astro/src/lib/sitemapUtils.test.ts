/**
 * サイトマップユーティリティのテスト
 *
 * Task 3.3: サイトマップ生成設定 (TDD)
 *
 * Requirements:
 * - 5.1: @astrojs/sitemap インテグレーションを設定
 * - 5.2: ホーム、About、全公開記事をサイトマップに含める
 * - 14.5: 日本語URLを正しくエンコード
 */
import { describe, it, expect } from 'vitest';
import {
  getStaticPagePaths,
  getPostPagePath,
  buildFullUrl,
  encodeUrlPath,
  generateAllPageUrls,
  validateSitemapUrls,
  extractLocUrls,
  extractSitemapUrls,
} from './sitemapUtils';

describe('Sitemap Utils', () => {
  describe('getStaticPagePaths', () => {
    it('should return array containing home page path', () => {
      const paths = getStaticPagePaths();
      expect(paths).toContain('/');
    });

    it('should return array containing about page path', () => {
      const paths = getStaticPagePaths();
      expect(paths).toContain('/about/');
    });

    it('should return array with exactly 2 static pages', () => {
      const paths = getStaticPagePaths();
      expect(paths).toHaveLength(2);
    });
  });

  describe('getPostPagePath', () => {
    it('should generate correct path for post ID', () => {
      const path = getPostPagePath('post-123');
      expect(path).toBe('/posts/post-123/');
    });

    it('should handle numeric post ID', () => {
      const path = getPostPagePath('12345');
      expect(path).toBe('/posts/12345/');
    });

    it('should handle UUID-style post ID', () => {
      const path = getPostPagePath('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      expect(path).toBe('/posts/a1b2c3d4-e5f6-7890-abcd-ef1234567890/');
    });
  });

  describe('buildFullUrl', () => {
    it('should build full URL from site URL and path', () => {
      const url = buildFullUrl('https://example.com', '/about/');
      expect(url).toBe('https://example.com/about/');
    });

    it('should handle site URL with trailing slash', () => {
      const url = buildFullUrl('https://example.com/', '/about/');
      expect(url).toBe('https://example.com/about/');
    });

    it('should handle path without leading slash', () => {
      const url = buildFullUrl('https://example.com', 'about/');
      expect(url).toBe('https://example.com/about/');
    });

    it('should handle root path', () => {
      const url = buildFullUrl('https://example.com', '/');
      expect(url).toBe('https://example.com/');
    });
  });

  describe('encodeUrlPath (Requirement 14.5)', () => {
    it('should encode Japanese characters in path', () => {
      const encoded = encodeUrlPath('/posts/日本語記事/');
      expect(encoded).toBe(
        '/posts/%E6%97%A5%E6%9C%AC%E8%AA%9E%E8%A8%98%E4%BA%8B/'
      );
    });

    it('should not modify ASCII-only paths', () => {
      const encoded = encodeUrlPath('/posts/my-article/');
      expect(encoded).toBe('/posts/my-article/');
    });

    it('should handle mixed Japanese and ASCII characters', () => {
      const encoded = encodeUrlPath('/posts/2024年の記事/');
      expect(encoded).toContain('%E5%B9%B4'); // 年
      expect(encoded).toContain('2024');
    });

    it('should preserve slashes', () => {
      const encoded = encodeUrlPath('/a/b/c/');
      expect(encoded).toBe('/a/b/c/');
    });
  });

  describe('generateAllPageUrls', () => {
    it('should generate URLs for static pages', () => {
      const urls = generateAllPageUrls('https://example.com', []);
      expect(urls).toContain('https://example.com/');
      expect(urls).toContain('https://example.com/about/');
    });

    it('should generate URLs for posts', () => {
      const urls = generateAllPageUrls('https://example.com', [
        'post-1',
        'post-2',
      ]);
      expect(urls).toContain('https://example.com/posts/post-1/');
      expect(urls).toContain('https://example.com/posts/post-2/');
    });

    it('should generate all URLs including static and post pages', () => {
      const urls = generateAllPageUrls('https://example.com', ['post-1']);
      expect(urls).toHaveLength(3); // home, about, post-1
    });
  });

  describe('validateSitemapUrls', () => {
    const sampleSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc></url>
  <url><loc>https://example.com/about/</loc></url>
  <url><loc>https://example.com/posts/post-1/</loc></url>
</urlset>`;

    it('should return valid=true when all URLs are present', () => {
      const result = validateSitemapUrls(sampleSitemap, [
        'https://example.com/',
        'https://example.com/about/',
      ]);
      expect(result.valid).toBe(true);
      expect(result.missingUrls).toHaveLength(0);
    });

    it('should return valid=false with missing URLs', () => {
      const result = validateSitemapUrls(sampleSitemap, [
        'https://example.com/',
        'https://example.com/missing/',
      ]);
      expect(result.valid).toBe(false);
      expect(result.missingUrls).toContain('https://example.com/missing/');
    });

    it('should handle XML-encoded ampersands', () => {
      const sitemapWithAmpersand = `<urlset>
        <url><loc>https://example.com/search?a=1&amp;b=2</loc></url>
      </urlset>`;
      const result = validateSitemapUrls(sitemapWithAmpersand, [
        'https://example.com/search?a=1&b=2',
      ]);
      expect(result.valid).toBe(true);
    });
  });

  describe('extractLocUrls', () => {
    it('should extract all loc URLs from sitemap', () => {
      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset>
  <url><loc>https://example.com/</loc></url>
  <url><loc>https://example.com/about/</loc></url>
</urlset>`;
      const urls = extractLocUrls(sitemap);
      expect(urls).toHaveLength(2);
      expect(urls).toContain('https://example.com/');
      expect(urls).toContain('https://example.com/about/');
    });

    it('should decode XML-encoded ampersands', () => {
      const sitemap = `<urlset>
        <url><loc>https://example.com/search?a=1&amp;b=2</loc></url>
      </urlset>`;
      const urls = extractLocUrls(sitemap);
      expect(urls[0]).toBe('https://example.com/search?a=1&b=2');
    });

    it('should return empty array for sitemap without loc elements', () => {
      const sitemap = `<urlset></urlset>`;
      const urls = extractLocUrls(sitemap);
      expect(urls).toHaveLength(0);
    });
  });

  describe('extractSitemapUrls', () => {
    it('should extract sitemap URLs from sitemap-index', () => {
      const sitemapIndex = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/sitemap-0.xml</loc></sitemap>
</sitemapindex>`;
      const urls = extractSitemapUrls(sitemapIndex);
      expect(urls).toContain('https://example.com/sitemap-0.xml');
    });
  });
});
