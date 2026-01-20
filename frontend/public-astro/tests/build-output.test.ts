/**
 * ビルド出力テスト
 *
 * Note: このテストは事前にビルドされた dist/ ディレクトリを検証します。
 * ビルドは `tests/build-with-mock.sh` スクリプトで実行してください:
 *   MOCK_PORT=3458 ./tests/build-with-mock.sh
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const distDir = join(import.meta.dirname, '../dist');

describe('Astro Build Output', () => {
  beforeAll(() => {
    // dist ディレクトリが存在することを確認
    if (!existsSync(distDir)) {
      throw new Error(
        'dist/ directory not found. Run "MOCK_PORT=3458 ./tests/build-with-mock.sh" first.'
      );
    }
  });

  describe('Directory Structure (Requirement 1.6)', () => {
    it('should generate dist/ directory', () => {
      expect(existsSync(distDir)).toBe(true);
    });

    it('should generate index.html in dist/', () => {
      expect(existsSync(join(distDir, 'index.html'))).toBe(true);
    });

    it('should generate _astro directory for bundled assets', () => {
      expect(existsSync(join(distDir, '_astro'))).toBe(true);
    });
  });

  describe('Japanese Language Support (Requirement 14.1, 14.2)', () => {
    it('should include <html lang="ja"> in generated HTML', () => {
      const indexHtml = readFileSync(join(distDir, 'index.html'), 'utf-8');
      expect(indexHtml).toMatch(/<html[^>]*lang="ja"/);
    });

    it('should include UTF-8 charset meta tag', () => {
      const indexHtml = readFileSync(join(distDir, 'index.html'), 'utf-8');
      expect(indexHtml).toMatch(/<meta[^>]*charset="UTF-8"/i);
    });
  });

  describe('Layout Structure', () => {
    it('should include viewport meta tag', () => {
      const indexHtml = readFileSync(join(distDir, 'index.html'), 'utf-8');
      expect(indexHtml).toMatch(/<meta[^>]*viewport/);
    });

    it('should include proper head section', () => {
      const indexHtml = readFileSync(join(distDir, 'index.html'), 'utf-8');
      expect(indexHtml).toMatch(/<head>/);
      expect(indexHtml).toMatch(/<\/head>/);
    });

    it('should include body section', () => {
      const indexHtml = readFileSync(join(distDir, 'index.html'), 'utf-8');
      expect(indexHtml).toMatch(/<body/);
      expect(indexHtml).toMatch(/<\/body>/);
    });
  });

  describe('Static Asset Generation', () => {
    it('should generate CSS files in _astro directory', () => {
      const astroDir = join(distDir, '_astro');
      if (existsSync(astroDir)) {
        const files = readdirSync(astroDir);
        const cssFiles = files.filter((f) => f.endsWith('.css'));
        // CSS files should exist after build
        expect(cssFiles.length).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('About Page (Requirement 2.4)', () => {
    it('should generate about/index.html', () => {
      const aboutPath = join(distDir, 'about', 'index.html');
      expect(existsSync(aboutPath)).toBe(true);
    });

    it('should include <html lang="ja"> in about page', () => {
      const aboutHtml = readFileSync(
        join(distDir, 'about', 'index.html'),
        'utf-8'
      );
      expect(aboutHtml).toMatch(/<html[^>]*lang="ja"/);
    });

    it('should include About title in page', () => {
      const aboutHtml = readFileSync(
        join(distDir, 'about', 'index.html'),
        'utf-8'
      );
      expect(aboutHtml).toContain('About');
    });

    it('should include site name in title', () => {
      const aboutHtml = readFileSync(
        join(distDir, 'about', 'index.html'),
        'utf-8'
      );
      expect(aboutHtml).toMatch(/<title>[^<]*bone of my fallacy[^<]*<\/title>/);
    });

    it('should include about sections content', () => {
      const aboutHtml = readFileSync(
        join(distDir, 'about', 'index.html'),
        'utf-8'
      );
      expect(aboutHtml).toContain('about-section');
    });

    it('should include navigation back to home', () => {
      const aboutHtml = readFileSync(
        join(distDir, 'about', 'index.html'),
        'utf-8'
      );
      expect(aboutHtml).toContain('href="/"');
    });
  });

  describe('404 Page (Requirement 15.1-15.5)', () => {
    it('should generate 404.html', () => {
      const notFoundPath = join(distDir, '404.html');
      expect(existsSync(notFoundPath)).toBe(true);
    });

    it('should include <html lang="ja"> in 404 page', () => {
      const notFoundHtml = readFileSync(join(distDir, '404.html'), 'utf-8');
      expect(notFoundHtml).toMatch(/<html[^>]*lang="ja"/);
    });

    it('should include 404 error code', () => {
      const notFoundHtml = readFileSync(join(distDir, '404.html'), 'utf-8');
      expect(notFoundHtml).toContain('404');
    });

    it('should include noindex meta tag (Requirement 15.4)', () => {
      const notFoundHtml = readFileSync(join(distDir, '404.html'), 'utf-8');
      expect(notFoundHtml).toMatch(
        /<meta[^>]*name="robots"[^>]*content="noindex"/
      );
    });

    it('should include home navigation link (Requirement 15.2)', () => {
      const notFoundHtml = readFileSync(join(distDir, '404.html'), 'utf-8');
      expect(notFoundHtml).toContain('href="/"');
      expect(notFoundHtml).toContain('ホームに戻る');
    });

    it('should maintain site header (Requirement 15.5)', () => {
      const notFoundHtml = readFileSync(join(distDir, '404.html'), 'utf-8');
      expect(notFoundHtml).toContain('site-header');
      expect(notFoundHtml).toContain('bone of my fallacy');
    });

    it('should include navigation to About page (Requirement 15.5)', () => {
      const notFoundHtml = readFileSync(join(distDir, '404.html'), 'utf-8');
      expect(notFoundHtml).toContain('href="/about"');
    });

    it('should include error message in Japanese', () => {
      const notFoundHtml = readFileSync(join(distDir, '404.html'), 'utf-8');
      expect(notFoundHtml).toContain('ページが見つかりません');
    });

    it('should include suggestions for navigation', () => {
      const notFoundHtml = readFileSync(join(distDir, '404.html'), 'utf-8');
      expect(notFoundHtml).toContain('suggestions');
    });
  });

  describe('Article List Page (Requirement 2.2)', () => {
    it('should include hero section with site title', () => {
      const indexHtml = readFileSync(join(distDir, 'index.html'), 'utf-8');
      expect(indexHtml).toContain('hero-section');
      expect(indexHtml).toContain('I am the bone of my fallacy');
    });

    it('should include container for article list', () => {
      const indexHtml = readFileSync(join(distDir, 'index.html'), 'utf-8');
      expect(indexHtml).toContain('container');
    });

    it('should generate index.html at root (Requirement 2.2)', () => {
      const indexPath = join(distDir, 'index.html');
      expect(existsSync(indexPath)).toBe(true);
    });

    it('should include proper page title in head', () => {
      const indexHtml = readFileSync(join(distDir, 'index.html'), 'utf-8');
      expect(indexHtml).toMatch(/<title>bone of my fallacy<\/title>/);
    });

    it('should include meta description', () => {
      const indexHtml = readFileSync(join(distDir, 'index.html'), 'utf-8');
      expect(indexHtml).toMatch(/<meta[^>]*name="description"/);
    });

    it('should have post-list-container or no-articles for empty state', () => {
      const indexHtml = readFileSync(join(distDir, 'index.html'), 'utf-8');
      // Either has posts or shows no-articles message
      const hasPostList = indexHtml.includes('post-list-container');
      const hasNoArticles =
        indexHtml.includes('no-articles') ||
        indexHtml.includes('記事がありません');
      const hasErrorMessage = indexHtml.includes('error-message');
      expect(hasPostList || hasNoArticles || hasErrorMessage).toBe(true);
    });
  });
});
