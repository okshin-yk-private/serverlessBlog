/**
 * SEO Utility Functions Tests
 *
 * Task 3.1: SEOメタタグコンポーネント実装
 *
 * TDD - RED Phase: Write failing tests first
 *
 * Requirements:
 * - 3.1: <title> and <meta name="description"> in all pages
 * - 3.2: Open Graph Protocol tags (og:title, og:description, og:image, og:url, og:type)
 * - 3.3: Twitter Card tags (twitter:card, twitter:title, twitter:description, twitter:image)
 * - 3.4: Article pages set og:type to "article"
 * - 3.5: Post's first image as og:image if available
 * - 3.6: Generate description from first 160 characters
 * - 3.7: Canonical URL tag in all pages
 * - 14.3: Japanese characters properly escaped
 */

import { describe, it, expect } from 'vitest';
import {
  type SEOProps,
  buildSiteTitle,
  generateOpenGraphData,
  generateTwitterCardData,
  buildCanonicalUrl,
  escapeHtmlAttribute,
  generateArticleMetaTags,
  generateWebsiteMetaTags,
} from './seoUtils';

const SITE_NAME = 'bone of my fallacy';
const SITE_URL = 'https://example.com';

describe('seoUtils', () => {
  describe('buildSiteTitle', () => {
    it('should build title with site name for non-home pages', () => {
      const result = buildSiteTitle('My Article', SITE_NAME);
      expect(result).toBe('My Article | bone of my fallacy');
    });

    it('should return site name only when title equals site name', () => {
      const result = buildSiteTitle(SITE_NAME, SITE_NAME);
      expect(result).toBe(SITE_NAME);
    });

    it('should handle empty title', () => {
      const result = buildSiteTitle('', SITE_NAME);
      expect(result).toBe(SITE_NAME);
    });

    it('should handle Japanese characters in title', () => {
      const result = buildSiteTitle('日本語タイトル', SITE_NAME);
      expect(result).toBe('日本語タイトル | bone of my fallacy');
    });
  });

  describe('generateOpenGraphData', () => {
    it('should generate OGP data for website type', () => {
      const props: SEOProps = {
        title: 'My Site',
        description: 'Site description',
        canonicalUrl: 'https://example.com/',
        type: 'website',
      };

      const result = generateOpenGraphData(props, SITE_URL);

      expect(result).toEqual({
        title: 'My Site',
        description: 'Site description',
        url: 'https://example.com/',
        type: 'website',
        image: undefined,
      });
    });

    it('should generate OGP data for article type', () => {
      const props: SEOProps = {
        title: 'My Article',
        description: 'Article description',
        canonicalUrl: 'https://example.com/posts/123',
        type: 'article',
        imageUrl: 'https://example.com/images/hero.jpg',
      };

      const result = generateOpenGraphData(props, SITE_URL);

      expect(result).toEqual({
        title: 'My Article',
        description: 'Article description',
        url: 'https://example.com/posts/123',
        type: 'article',
        image: 'https://example.com/images/hero.jpg',
      });
    });

    it('should default to website type if not specified', () => {
      const props: SEOProps = {
        title: 'Page Title',
        description: 'Description',
        canonicalUrl: 'https://example.com/about',
      };

      const result = generateOpenGraphData(props, SITE_URL);

      expect(result.type).toBe('website');
    });

    it('should handle Japanese characters in OGP data', () => {
      const props: SEOProps = {
        title: '日本語タイトル',
        description: 'これは日本語の説明文です。',
        canonicalUrl: 'https://example.com/posts/日本語-slug',
        type: 'article',
      };

      const result = generateOpenGraphData(props, SITE_URL);

      expect(result.title).toBe('日本語タイトル');
      expect(result.description).toBe('これは日本語の説明文です。');
    });
  });

  describe('generateTwitterCardData', () => {
    it('should generate Twitter Card data with image', () => {
      const props: SEOProps = {
        title: 'My Article',
        description: 'Article description',
        canonicalUrl: 'https://example.com/posts/123',
        imageUrl: 'https://example.com/images/hero.jpg',
      };

      const result = generateTwitterCardData(props);

      expect(result).toEqual({
        card: 'summary_large_image',
        title: 'My Article',
        description: 'Article description',
        image: 'https://example.com/images/hero.jpg',
      });
    });

    it('should use summary card type when no image', () => {
      const props: SEOProps = {
        title: 'My Article',
        description: 'Article description',
        canonicalUrl: 'https://example.com/posts/123',
      };

      const result = generateTwitterCardData(props);

      expect(result).toEqual({
        card: 'summary',
        title: 'My Article',
        description: 'Article description',
        image: undefined,
      });
    });

    it('should handle Japanese characters in Twitter Card data', () => {
      const props: SEOProps = {
        title: '日本語タイトル',
        description: 'これは日本語の説明文です。',
        canonicalUrl: 'https://example.com/posts/123',
      };

      const result = generateTwitterCardData(props);

      expect(result.title).toBe('日本語タイトル');
      expect(result.description).toBe('これは日本語の説明文です。');
    });
  });

  describe('buildCanonicalUrl', () => {
    it('should build canonical URL from path', () => {
      const result = buildCanonicalUrl('/posts/123', SITE_URL);
      expect(result).toBe('https://example.com/posts/123');
    });

    it('should handle root path', () => {
      const result = buildCanonicalUrl('/', SITE_URL);
      expect(result).toBe('https://example.com/');
    });

    it('should remove trailing slash from site URL', () => {
      const result = buildCanonicalUrl('/about', 'https://example.com/');
      expect(result).toBe('https://example.com/about');
    });

    it('should handle path without leading slash', () => {
      const result = buildCanonicalUrl('about', SITE_URL);
      expect(result).toBe('https://example.com/about');
    });

    it('should handle already full URL', () => {
      const result = buildCanonicalUrl(
        'https://example.com/posts/123',
        SITE_URL
      );
      expect(result).toBe('https://example.com/posts/123');
    });

    it('should encode Japanese characters in URL path', () => {
      const result = buildCanonicalUrl('/posts/日本語', SITE_URL);
      expect(result).toBe(
        'https://example.com/posts/%E6%97%A5%E6%9C%AC%E8%AA%9E'
      );
    });
  });

  describe('escapeHtmlAttribute', () => {
    it('should escape double quotes', () => {
      const result = escapeHtmlAttribute('He said "Hello"');
      expect(result).toBe('He said &quot;Hello&quot;');
    });

    it('should escape ampersands', () => {
      const result = escapeHtmlAttribute('Tom & Jerry');
      expect(result).toBe('Tom &amp; Jerry');
    });

    it('should escape less than and greater than', () => {
      const result = escapeHtmlAttribute('<script>alert("XSS")</script>');
      expect(result).toBe(
        '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;'
      );
    });

    it('should escape single quotes', () => {
      const result = escapeHtmlAttribute("It's a test");
      expect(result).toBe('It&#39;s a test');
    });

    it('should handle Japanese characters without escaping', () => {
      const result = escapeHtmlAttribute('日本語テスト');
      expect(result).toBe('日本語テスト');
    });

    it('should handle mixed Japanese and special characters', () => {
      const result = escapeHtmlAttribute('日本語 & English "Test"');
      expect(result).toBe('日本語 &amp; English &quot;Test&quot;');
    });

    it('should handle empty string', () => {
      const result = escapeHtmlAttribute('');
      expect(result).toBe('');
    });
  });

  describe('generateArticleMetaTags', () => {
    it('should generate all required article meta tags', () => {
      const props: SEOProps = {
        title: 'My Article',
        description: 'Article description',
        canonicalUrl: 'https://example.com/posts/123',
        type: 'article',
        imageUrl: 'https://example.com/images/hero.jpg',
        publishedAt: '2024-01-15T10:00:00Z',
        modifiedAt: '2024-01-16T12:00:00Z',
      };

      const result = generateArticleMetaTags(props, SITE_NAME, SITE_URL);

      expect(result.title).toBe('My Article | bone of my fallacy');
      expect(result.description).toBe('Article description');
      expect(result.canonicalUrl).toBe('https://example.com/posts/123');
      expect(result.og.type).toBe('article');
      expect(result.og.image).toBe('https://example.com/images/hero.jpg');
      expect(result.twitter.card).toBe('summary_large_image');
      expect(result.twitter.image).toBe('https://example.com/images/hero.jpg');
    });

    it('should handle article without image', () => {
      const props: SEOProps = {
        title: 'My Article',
        description: 'Article description',
        canonicalUrl: 'https://example.com/posts/123',
        type: 'article',
      };

      const result = generateArticleMetaTags(props, SITE_NAME, SITE_URL);

      expect(result.og.image).toBeUndefined();
      expect(result.twitter.card).toBe('summary');
      expect(result.twitter.image).toBeUndefined();
    });

    it('should handle Japanese content', () => {
      const props: SEOProps = {
        title: '日本語タイトル',
        description: 'これは日本語の説明文です。',
        canonicalUrl: 'https://example.com/posts/日本語-slug',
        type: 'article',
      };

      const result = generateArticleMetaTags(props, SITE_NAME, SITE_URL);

      expect(result.title).toBe('日本語タイトル | bone of my fallacy');
      expect(result.description).toBe('これは日本語の説明文です。');
    });
  });

  describe('generateWebsiteMetaTags', () => {
    it('should generate all required website meta tags', () => {
      const props: SEOProps = {
        title: SITE_NAME,
        description: 'Welcome to my blog',
        canonicalUrl: 'https://example.com/',
        type: 'website',
      };

      const result = generateWebsiteMetaTags(props, SITE_NAME, SITE_URL);

      expect(result.title).toBe(SITE_NAME);
      expect(result.description).toBe('Welcome to my blog');
      expect(result.canonicalUrl).toBe('https://example.com/');
      expect(result.og.type).toBe('website');
      expect(result.twitter.card).toBe('summary');
    });

    it('should handle about page', () => {
      const props: SEOProps = {
        title: 'About',
        description: 'About this blog',
        canonicalUrl: 'https://example.com/about',
        type: 'website',
      };

      const result = generateWebsiteMetaTags(props, SITE_NAME, SITE_URL);

      expect(result.title).toBe('About | bone of my fallacy');
      expect(result.og.type).toBe('website');
    });

    it('should handle 404 page', () => {
      const props: SEOProps = {
        title: '404 Not Found',
        description: 'Page not found',
        canonicalUrl: 'https://example.com/404',
        type: 'website',
        noindex: true,
      };

      const result = generateWebsiteMetaTags(props, SITE_NAME, SITE_URL);

      expect(result.title).toBe('404 Not Found | bone of my fallacy');
      expect(result.noindex).toBe(true);
    });
  });
});
