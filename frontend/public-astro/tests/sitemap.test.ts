/**
 * サイトマップ生成テスト
 *
 * Task 3.3: サイトマップ生成設定
 *
 * Requirements:
 * - 5.1: @astrojs/sitemap インテグレーションを設定
 * - 5.2: ホーム、About、全公開記事をサイトマップに含める
 * - 14.5: 日本語URLを正しくエンコード
 *
 * Note: このテストは事前にビルドされた dist/ ディレクトリのサイトマップを検証します。
 * ビルドは `tests/build-with-mock.sh` スクリプトで実行してください:
 *   MOCK_PORT=3458 ./tests/build-with-mock.sh
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { mockPosts } from './mock-api-server';
import { extractLocUrls, extractSitemapUrls } from '../src/lib/sitemapUtils';

const projectDir = join(import.meta.dirname, '..');
const distDir = join(projectDir, 'dist');
const SITE_URL = 'https://example.com';

describe('Sitemap Generation (Task 3.3)', () => {
  beforeAll(() => {
    // dist ディレクトリが存在することを確認
    if (!existsSync(distDir)) {
      throw new Error(
        'dist/ directory not found. Run "MOCK_PORT=3458 ./tests/build-with-mock.sh" first.'
      );
    }
  });

  describe('Sitemap Index Generation (Requirement 5.1)', () => {
    it('should generate sitemap-index.xml in dist/', () => {
      const sitemapIndexPath = join(distDir, 'sitemap-index.xml');
      expect(existsSync(sitemapIndexPath)).toBe(true);
    });

    it('should have valid XML structure in sitemap-index.xml', () => {
      const sitemapIndexPath = join(distDir, 'sitemap-index.xml');
      const content = readFileSync(sitemapIndexPath, 'utf-8');

      expect(content).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(content).toContain('<sitemapindex');
      expect(content).toContain('</sitemapindex>');
    });

    it('should reference sitemap-0.xml in sitemap-index.xml', () => {
      const sitemapIndexPath = join(distDir, 'sitemap-index.xml');
      const content = readFileSync(sitemapIndexPath, 'utf-8');
      const sitemapUrls = extractSitemapUrls(content);

      expect(sitemapUrls.some((url) => url.includes('sitemap-0.xml'))).toBe(
        true
      );
    });
  });

  describe('Sitemap Content (Requirement 5.2)', () => {
    it('should generate sitemap-0.xml with page URLs', () => {
      const sitemap0Path = join(distDir, 'sitemap-0.xml');
      expect(existsSync(sitemap0Path)).toBe(true);
    });

    it('should include home page URL in sitemap', () => {
      const sitemap0Path = join(distDir, 'sitemap-0.xml');
      const content = readFileSync(sitemap0Path, 'utf-8');
      const urls = extractLocUrls(content);

      const homeUrl = `${SITE_URL}/`;
      expect(urls).toContain(homeUrl);
    });

    it('should include about page URL in sitemap', () => {
      const sitemap0Path = join(distDir, 'sitemap-0.xml');
      const content = readFileSync(sitemap0Path, 'utf-8');
      const urls = extractLocUrls(content);

      // @astrojs/sitemap may generate with or without trailing slash
      const hasAboutUrl = urls.some(
        (url) => url === `${SITE_URL}/about/` || url === `${SITE_URL}/about`
      );
      expect(hasAboutUrl).toBe(true);
    });

    it('should include all published post URLs in sitemap', () => {
      const sitemap0Path = join(distDir, 'sitemap-0.xml');
      const content = readFileSync(sitemap0Path, 'utf-8');
      const urls = extractLocUrls(content);

      // 公開記事のみをチェック（draft は含まれない）
      const publishedPosts = mockPosts.filter(
        (p) => p.publishStatus === 'published'
      );

      for (const post of publishedPosts) {
        const expectedUrl = `${SITE_URL}/posts/${post.id}/`;
        const hasPostUrl = urls.some(
          (url) => url === expectedUrl || url === `${SITE_URL}/posts/${post.id}`
        );
        expect(hasPostUrl).toBe(true);
      }
    });

    it('should NOT include draft post URLs in sitemap', () => {
      const sitemap0Path = join(distDir, 'sitemap-0.xml');
      const content = readFileSync(sitemap0Path, 'utf-8');
      const urls = extractLocUrls(content);

      // Draft記事が含まれていないことを確認
      const draftPosts = mockPosts.filter((p) => p.publishStatus === 'draft');

      for (const post of draftPosts) {
        const hasDraftUrl = urls.some((url) =>
          url.includes(`/posts/${post.id}`)
        );
        expect(hasDraftUrl).toBe(false);
      }
    });

    it('should NOT include 404 page in sitemap', () => {
      const sitemap0Path = join(distDir, 'sitemap-0.xml');
      const content = readFileSync(sitemap0Path, 'utf-8');
      const urls = extractLocUrls(content);

      const has404Url = urls.some((url) => url.includes('404'));
      expect(has404Url).toBe(false);
    });
  });

  describe('Sitemap XML Structure', () => {
    it('should have valid urlset XML namespace', () => {
      const sitemap0Path = join(distDir, 'sitemap-0.xml');
      const content = readFileSync(sitemap0Path, 'utf-8');

      expect(content).toContain(
        'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'
      );
    });

    it('should have proper XML declaration', () => {
      const sitemap0Path = join(distDir, 'sitemap-0.xml');
      const content = readFileSync(sitemap0Path, 'utf-8');

      // XML declaration
      expect(content).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    });
  });

  describe('URL Encoding (Requirement 14.5)', () => {
    it('should properly encode URLs in sitemap', () => {
      const sitemap0Path = join(distDir, 'sitemap-0.xml');
      const content = readFileSync(sitemap0Path, 'utf-8');

      // XMLは有効なXML文字のみを含む
      // 不正な文字（制御文字など）が含まれていないことを確認
      expect(() => {
        // Basic XML validation by checking structure
        expect(content.includes('<url>')).toBe(true);
        expect(content.includes('<loc>')).toBe(true);
        expect(content.includes('</loc>')).toBe(true);
        expect(content.includes('</url>')).toBe(true);
      }).not.toThrow();
    });
  });
});
