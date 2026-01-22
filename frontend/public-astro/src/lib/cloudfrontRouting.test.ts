/**
 * CloudFront Function Routing Logic Tests
 * Requirements: 7.8, 7.9, 5.6
 *
 * Tests for Astro SSG URL rewriting:
 * - Extensionless URLs to {path}/index.html
 * - Exclusion patterns for specific paths
 * - ECMAScript 5.1 compatible logic
 */
import { describe, it, expect } from 'vitest';
import {
  rewriteUri,
  hasFileExtension,
  isExcludedPath,
  generateCloudFrontFunctionCode,
} from './cloudfrontRouting';

describe('cloudfrontRouting', () => {
  describe('hasFileExtension', () => {
    it('should return true for paths with file extensions', () => {
      expect(hasFileExtension('/index.html')).toBe(true);
      expect(hasFileExtension('/about.html')).toBe(true);
      expect(hasFileExtension('/_astro/styles.abc123.css')).toBe(true);
      expect(hasFileExtension('/_astro/index.def456.js')).toBe(true);
      expect(hasFileExtension('/images/photo.jpg')).toBe(true);
      expect(hasFileExtension('/sitemap-index.xml')).toBe(true);
      expect(hasFileExtension('/rss.xml')).toBe(true);
      expect(hasFileExtension('/robots.txt')).toBe(true);
    });

    it('should return false for paths without file extensions', () => {
      expect(hasFileExtension('/')).toBe(false);
      expect(hasFileExtension('/posts/123')).toBe(false);
      expect(hasFileExtension('/about')).toBe(false);
      expect(hasFileExtension('/posts/123/')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(hasFileExtension('/path.with.dots/noextension')).toBe(false);
      expect(hasFileExtension('/path.with.dots/file.html')).toBe(true);
      expect(hasFileExtension('')).toBe(false);
    });
  });

  describe('isExcludedPath', () => {
    describe('should exclude /_astro/* paths', () => {
      it('should exclude /_astro/styles.css', () => {
        expect(isExcludedPath('/_astro/styles.abc123.css')).toBe(true);
      });

      it('should exclude /_astro/index.js', () => {
        expect(isExcludedPath('/_astro/index.def456.js')).toBe(true);
      });

      it('should exclude nested /_astro paths', () => {
        expect(isExcludedPath('/_astro/chunks/module.abc.js')).toBe(true);
      });
    });

    describe('should exclude /api/* paths', () => {
      it('should exclude /api/posts', () => {
        expect(isExcludedPath('/api/posts')).toBe(true);
      });

      it('should exclude /api/posts/123', () => {
        expect(isExcludedPath('/api/posts/123')).toBe(true);
      });

      it('should exclude /api/auth/login', () => {
        expect(isExcludedPath('/api/auth/login')).toBe(true);
      });
    });

    describe('should exclude /admin/* paths', () => {
      it('should exclude /admin', () => {
        expect(isExcludedPath('/admin')).toBe(true);
      });

      it('should exclude /admin/', () => {
        expect(isExcludedPath('/admin/')).toBe(true);
      });

      it('should exclude /admin/dashboard', () => {
        expect(isExcludedPath('/admin/dashboard')).toBe(true);
      });

      it('should exclude /admin/posts/create', () => {
        expect(isExcludedPath('/admin/posts/create')).toBe(true);
      });
    });

    describe('should exclude /images/* paths', () => {
      it('should exclude /images/photo.jpg', () => {
        expect(isExcludedPath('/images/photo.jpg')).toBe(true);
      });

      it('should exclude /images/uploads/2024/img.png', () => {
        expect(isExcludedPath('/images/uploads/2024/img.png')).toBe(true);
      });
    });

    describe('should exclude sitemap paths', () => {
      it('should exclude /sitemap-index.xml', () => {
        expect(isExcludedPath('/sitemap-index.xml')).toBe(true);
      });

      it('should exclude /sitemap-0.xml', () => {
        expect(isExcludedPath('/sitemap-0.xml')).toBe(true);
      });

      it('should exclude /sitemap-1.xml', () => {
        expect(isExcludedPath('/sitemap-1.xml')).toBe(true);
      });
    });

    describe('should exclude RSS and robots paths', () => {
      it('should exclude /rss.xml', () => {
        expect(isExcludedPath('/rss.xml')).toBe(true);
      });

      it('should exclude /robots.txt', () => {
        expect(isExcludedPath('/robots.txt')).toBe(true);
      });
    });

    describe('should NOT exclude regular paths', () => {
      it('should not exclude /', () => {
        expect(isExcludedPath('/')).toBe(false);
      });

      it('should not exclude /posts/123', () => {
        expect(isExcludedPath('/posts/123')).toBe(false);
      });

      it('should not exclude /about', () => {
        expect(isExcludedPath('/about')).toBe(false);
      });

      it('should not exclude /category/tech', () => {
        expect(isExcludedPath('/category/tech')).toBe(false);
      });
    });
  });

  describe('rewriteUri', () => {
    describe('should NOT rewrite paths with file extensions', () => {
      it('should not rewrite /index.html', () => {
        expect(rewriteUri('/index.html')).toBe('/index.html');
      });

      it('should not rewrite /_astro/styles.css', () => {
        expect(rewriteUri('/_astro/styles.abc123.css')).toBe(
          '/_astro/styles.abc123.css'
        );
      });

      it('should not rewrite /rss.xml', () => {
        expect(rewriteUri('/rss.xml')).toBe('/rss.xml');
      });
    });

    describe('should NOT rewrite excluded paths', () => {
      it('should not rewrite /api/posts', () => {
        expect(rewriteUri('/api/posts')).toBe('/api/posts');
      });

      it('should not rewrite /admin/dashboard', () => {
        expect(rewriteUri('/admin/dashboard')).toBe('/admin/dashboard');
      });

      it('should not rewrite /images/photo.jpg', () => {
        expect(rewriteUri('/images/photo.jpg')).toBe('/images/photo.jpg');
      });

      it('should not rewrite /sitemap-index.xml', () => {
        expect(rewriteUri('/sitemap-index.xml')).toBe('/sitemap-index.xml');
      });
    });

    describe('should rewrite extensionless paths to index.html', () => {
      it('should rewrite / to /index.html', () => {
        expect(rewriteUri('/')).toBe('/index.html');
      });

      it('should rewrite /posts/123 to /posts/123/index.html', () => {
        expect(rewriteUri('/posts/123')).toBe('/posts/123/index.html');
      });

      it('should rewrite /about to /about/index.html', () => {
        expect(rewriteUri('/about')).toBe('/about/index.html');
      });

      it('should rewrite /category/tech to /category/tech/index.html', () => {
        expect(rewriteUri('/category/tech')).toBe('/category/tech/index.html');
      });
    });

    describe('should handle trailing slashes correctly', () => {
      it('should rewrite /posts/123/ to /posts/123/index.html', () => {
        expect(rewriteUri('/posts/123/')).toBe('/posts/123/index.html');
      });

      it('should rewrite /about/ to /about/index.html', () => {
        expect(rewriteUri('/about/')).toBe('/about/index.html');
      });
    });

    describe('edge cases', () => {
      it('should handle empty string', () => {
        expect(rewriteUri('')).toBe('/index.html');
      });

      it('should handle deep nested paths', () => {
        expect(rewriteUri('/a/b/c/d/e')).toBe('/a/b/c/d/e/index.html');
      });

      it('should handle paths with dots but no extension', () => {
        expect(rewriteUri('/posts/2024.01.15')).toBe(
          '/posts/2024.01.15/index.html'
        );
      });
    });
  });

  describe('generateCloudFrontFunctionCode', () => {
    it('should generate valid ES5 JavaScript code', () => {
      const code = generateCloudFrontFunctionCode();

      // Should contain the handler function
      expect(code).toContain('function handler(event)');

      // Should use var (ES5) not let/const
      expect(code).toContain('var request');
      expect(code).toContain('var uri');
      expect(code).not.toContain('let ');
      expect(code).not.toContain('const ');

      // Should not use arrow functions
      expect(code).not.toContain('=>');
    });

    it('should include known extensions array', () => {
      const code = generateCloudFrontFunctionCode();

      expect(code).toContain('knownExtensions');
      expect(code).toContain("'html'");
      expect(code).toContain("'js'");
      expect(code).toContain("'css'");
      expect(code).toContain("'xml'");
    });

    it('should include all excluded path patterns', () => {
      const code = generateCloudFrontFunctionCode();

      expect(code).toContain("'/_astro/'");
      expect(code).toContain("'/api/'");
      expect(code).toContain("'/admin'");
      expect(code).toContain("'/admin/'");
      expect(code).toContain("'/images/'");
      expect(code).toContain("'/sitemap'");
      expect(code).toContain("'/rss.xml'");
      expect(code).toContain("'/robots.txt'");
    });

    it('should include URL rewriting logic', () => {
      const code = generateCloudFrontFunctionCode();

      expect(code).toContain('request.uri = uri');
      expect(code).toContain("'index.html'");
    });

    it('should be syntactically valid JavaScript', () => {
      const code = generateCloudFrontFunctionCode();

      // This should not throw an error
      expect(() => new Function(code)).not.toThrow();
    });
  });
});
