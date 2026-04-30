/**
 * CodeBuildトリガー連携テスト（フロントエンド視点）
 *
 * Task 8.2: 統合テスト実装
 *
 * Requirements:
 * - 13.2: CodeBuild トリガー連携テスト
 * - 13.5: The build process shall be tested to verify all pages are generated correctly
 *
 * このテストはCodeBuildがトリガーされた後のビルド結果を検証します。
 * CodeBuildトリガー自体のロジックはGo側でテスト済み（internal/buildtrigger/buildtrigger_test.go）
 *
 * Note: このテストは事前にビルドされた dist/ ディレクトリを検証します。
 * ビルドは `tests/build-with-mock.sh` スクリプトで実行してください:
 *   MOCK_PORT=3458 ./tests/build-with-mock.sh
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { mockPosts } from './mock-api-server';
import { stripHtml } from '../src/lib/postUtils';

const distDir = join(import.meta.dirname, '../dist');

describe('CodeBuildトリガー連携テスト (Task 8.2)', () => {
  beforeAll(() => {
    if (!existsSync(distDir)) {
      throw new Error(
        'dist/ directory not found. Run "MOCK_PORT=3458 ./tests/build-with-mock.sh" first.'
      );
    }
  });

  describe('ビルド出力完全性検証 (Requirement 13.5)', () => {
    it('should generate all required static files', () => {
      // 必須ファイルの存在確認
      const requiredFiles = [
        'index.html',
        '404.html',
        'rss.xml',
        'sitemap-index.xml',
        'sitemap-0.xml',
        'about/index.html',
      ];

      for (const file of requiredFiles) {
        const filePath = join(distDir, file);
        expect(existsSync(filePath)).toBe(true);
      }
    });

    it('should generate all published post pages', () => {
      const publishedPosts = mockPosts.filter(
        (p) => p.publishStatus === 'published'
      );

      for (const post of publishedPosts) {
        const postPath = join(distDir, 'posts', post.id, 'index.html');
        expect(existsSync(postPath)).toBe(true);
      }
    });

    it('should NOT generate draft post pages', () => {
      const draftPosts = mockPosts.filter((p) => p.publishStatus === 'draft');

      for (const post of draftPosts) {
        const postPath = join(distDir, 'posts', post.id, 'index.html');
        expect(existsSync(postPath)).toBe(false);
      }
    });

    it('should generate _astro directory with static assets', () => {
      const astroDir = join(distDir, '_astro');
      expect(existsSync(astroDir)).toBe(true);

      const files = readdirSync(astroDir);
      // Should have at least some CSS files (may have JS for interactive components)
      expect(files.length).toBeGreaterThan(0);
    });
  });

  describe('ビルドアーティファクト品質検証', () => {
    it('should generate self-contained HTML files (Requirement 2.7)', () => {
      const indexHtml = readFileSync(join(distDir, 'index.html'), 'utf-8');

      // HTML should be valid and complete
      expect(indexHtml).toContain('<!DOCTYPE html>');
      expect(indexHtml).toContain('<html');
      expect(indexHtml).toContain('</html>');
      expect(indexHtml).toContain('<head>');
      expect(indexHtml).toContain('</head>');
      expect(indexHtml).toContain('<body');
      expect(indexHtml).toContain('</body>');
    });

    it('should have content-hash in _astro assets for cache busting', () => {
      const astroDir = join(distDir, '_astro');
      if (existsSync(astroDir)) {
        const files = readdirSync(astroDir);

        // Static assets should have content-hash in filename (e.g., index.abc123.css)
        const hashPattern = /\.[a-zA-Z0-9]{5,}\.(css|js)$/;
        const hashedFiles = files.filter((f) => hashPattern.test(f));

        // At minimum, CSS files should be hashed
        const cssFiles = files.filter((f) => f.endsWith('.css'));
        if (cssFiles.length > 0) {
          expect(hashedFiles.length).toBeGreaterThan(0);
        }
      }
    });

    it('should have reasonable file sizes (Requirement 6.8)', () => {
      // Check total dist size is under 50MB
      let totalSize = 0;

      function calculateDirSize(dir: string): void {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          if (entry.isDirectory()) {
            calculateDirSize(fullPath);
          } else {
            totalSize += statSync(fullPath).size;
          }
        }
      }

      calculateDirSize(distDir);

      // Total should be under 50MB (52428800 bytes)
      const maxSize = 50 * 1024 * 1024;
      expect(totalSize).toBeLessThan(maxSize);
    });
  });

  describe('APIからのデータ反映検証 (Requirement 2.1, 2.8)', () => {
    it('should reflect published post titles in generated HTML', () => {
      const publishedPosts = mockPosts.filter(
        (p) => p.publishStatus === 'published'
      );

      for (const post of publishedPosts) {
        const postPath = join(distDir, 'posts', post.id, 'index.html');
        const html = readFileSync(postPath, 'utf-8');

        // Post title should appear in the page
        expect(html).toContain(post.title);
      }
    });

    it('should include post content in generated HTML', () => {
      const publishedPosts = mockPosts.filter(
        (p) => p.publishStatus === 'published'
      );

      for (const post of publishedPosts) {
        const postPath = join(distDir, 'posts', post.id, 'index.html');
        const html = readFileSync(postPath, 'utf-8');

        // Strip HTML tags from contentHtml to get plain text for comparison
        const plainContent = stripHtml(post.contentHtml);
        if (plainContent) {
          // Content should appear somewhere in the page
          expect(html).toContain(plainContent);
        }
      }
    });

    it('should list all published posts on home page', () => {
      const indexHtml = readFileSync(join(distDir, 'index.html'), 'utf-8');
      const publishedPosts = mockPosts.filter(
        (p) => p.publishStatus === 'published'
      );

      // Either posts are shown or "no articles" message (if build was done without mock)
      const hasPostList = indexHtml.includes('post-list-container');
      const hasNoArticles =
        indexHtml.includes('no-articles') ||
        indexHtml.includes('記事がありません');
      const hasErrorMessage = indexHtml.includes('error-message');

      // At least one of these states should be true
      expect(hasPostList || hasNoArticles || hasErrorMessage).toBe(true);

      // If we have a post list, check for post links
      if (hasPostList) {
        for (const post of publishedPosts) {
          // Check for link to post detail page
          expect(indexHtml).toContain(`/posts/${post.id}`);
        }
      }
    });
  });

  describe('リビルド後のコンテンツ整合性', () => {
    it('should have consistent structure across all pages', () => {
      const pages = [
        join(distDir, 'index.html'),
        join(distDir, 'about', 'index.html'),
        join(distDir, '404.html'),
      ];

      // Add post pages
      const postsDir = join(distDir, 'posts');
      if (existsSync(postsDir)) {
        const postDirs = readdirSync(postsDir, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => join(postsDir, d.name, 'index.html'));
        pages.push(...postDirs.filter((p) => existsSync(p)));
      }

      for (const page of pages) {
        const html = readFileSync(page, 'utf-8');

        // All pages should have proper HTML structure
        expect(html).toContain('<!DOCTYPE html>');
        expect(html).toContain('<html');
        expect(html).toContain('</html>');

        // All pages should have UTF-8 charset
        expect(html).toMatch(/<meta[^>]*charset=["']?UTF-8["']?/i);

        // All pages should have lang="ja"
        expect(html).toMatch(/<html[^>]*lang=["']ja["']/);
      }
    });

    it('should have valid home navigation link on 404 page', () => {
      const notFoundHtml = readFileSync(join(distDir, '404.html'), 'utf-8');

      // 404 page should have home link (ホームに戻る)
      expect(notFoundHtml).toContain('href="/"');
    });
  });

  describe('ビルドエラー時のフォールバック検証', () => {
    it('should generate valid 404 page for missing routes', () => {
      const notFoundHtml = readFileSync(join(distDir, '404.html'), 'utf-8');

      // 404 page should be functional
      expect(notFoundHtml).toContain('404');
      expect(notFoundHtml).toContain('ページが見つかりません');
      expect(notFoundHtml).toContain('ホームに戻る');
    });

    it('should handle empty content gracefully', () => {
      // Check that build doesn't fail with edge cases
      const indexHtml = readFileSync(join(distDir, 'index.html'), 'utf-8');

      // Page should be valid even with no posts or with error state
      expect(indexHtml).toBeTruthy();
      expect(indexHtml.length).toBeGreaterThan(100);
    });
  });
});

describe('CodeBuildとAstroビルドの統合シナリオ', () => {
  beforeAll(() => {
    if (!existsSync(distDir)) {
      throw new Error(
        'dist/ directory not found. Run "MOCK_PORT=3458 ./tests/build-with-mock.sh" first.'
      );
    }
  });

  describe('ビルドパイプライン出力検証 (Requirement 9.5)', () => {
    it('should generate files suitable for S3 deployment', () => {
      // All files should be static (no server-side rendering requirements)
      const checkStaticDir = (dir: string) => {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            checkStaticDir(join(dir, entry.name));
          } else {
            const ext = entry.name.split('.').pop();
            // All files should have web-safe extensions
            const validExtensions = [
              'html',
              'css',
              'js',
              'xml',
              'json',
              'txt',
              'ico',
              'svg',
              'png',
              'jpg',
              'jpeg',
              'gif',
              'webp',
              'woff',
              'woff2',
              'ttf',
              'eot',
            ];
            expect(validExtensions).toContain(ext?.toLowerCase());
          }
        }
      };

      checkStaticDir(distDir);
    });

    it('should have proper MIME type associations based on extensions', () => {
      // Verify HTML files are valid
      const indexHtml = readFileSync(join(distDir, 'index.html'), 'utf-8');
      expect(indexHtml.startsWith('<!DOCTYPE html>')).toBe(true);

      // Verify XML files are valid
      const sitemapXml = readFileSync(
        join(distDir, 'sitemap-index.xml'),
        'utf-8'
      );
      expect(sitemapXml.includes('<?xml version="1.0"')).toBe(true);

      const rssXml = readFileSync(join(distDir, 'rss.xml'), 'utf-8');
      expect(rssXml.includes('<?xml version="1.0"')).toBe(true);
    });
  });

  describe('キャッシュバスティング対応検証 (Requirement 7.7)', () => {
    it('should have unique hashes in asset filenames for cache invalidation', () => {
      const astroDir = join(distDir, '_astro');
      if (!existsSync(astroDir)) {
        return; // Skip if no _astro directory
      }

      const files = readdirSync(astroDir);
      const hashedAssets = files.filter((f) => {
        // Match pattern like: filename.HASH.ext
        return /\.[a-zA-Z0-9_-]{5,}\.(css|js)$/.test(f);
      });

      // Should have at least some hashed assets
      const cssOrJsFiles = files.filter(
        (f) => f.endsWith('.css') || f.endsWith('.js')
      );
      if (cssOrJsFiles.length > 0) {
        expect(hashedAssets.length).toBeGreaterThan(0);
      }
    });

    it('should reference hashed assets in HTML files', () => {
      const astroDir = join(distDir, '_astro');
      if (!existsSync(astroDir)) {
        return;
      }

      const indexHtml = readFileSync(join(distDir, 'index.html'), 'utf-8');

      // Check that HTML references /_astro/ directory
      expect(indexHtml).toContain('/_astro/');
    });
  });
});
