import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { SEOHead } from './SEOHead';

describe('SEOHead', () => {
  let originalHead: HTMLHeadElement;

  beforeEach(() => {
    originalHead = document.head;
    document.head.innerHTML = '';
  });

  afterEach(() => {
    document.head.innerHTML = originalHead.innerHTML;
  });

  describe('メタタグ生成', () => {
    it('should render title meta tag', () => {
      render(
        <SEOHead
          title="Test Blog Post"
          description="This is a test blog post"
          keywords={['test', 'blog']}
        />
      );

      const titleElement = document.querySelector('title');
      expect(titleElement).toBeTruthy();
      expect(titleElement?.textContent).toBe('Test Blog Post');
    });

    it('should render description meta tag', () => {
      render(
        <SEOHead
          title="Test Blog Post"
          description="This is a test blog post"
          keywords={['test', 'blog']}
        />
      );

      const descriptionMeta = document.querySelector('meta[name="description"]');
      expect(descriptionMeta).toBeTruthy();
      expect(descriptionMeta?.getAttribute('content')).toBe('This is a test blog post');
    });

    it('should render keywords meta tag', () => {
      render(
        <SEOHead
          title="Test Blog Post"
          description="This is a test blog post"
          keywords={['test', 'blog', 'seo']}
        />
      );

      const keywordsMeta = document.querySelector('meta[name="keywords"]');
      expect(keywordsMeta).toBeTruthy();
      expect(keywordsMeta?.getAttribute('content')).toBe('test, blog, seo');
    });

    it('should render canonical URL meta tag', () => {
      render(
        <SEOHead
          title="Test Blog Post"
          description="This is a test blog post"
          keywords={['test', 'blog']}
          url="https://example.com/posts/123"
        />
      );

      const canonicalLink = document.querySelector('link[rel="canonical"]');
      expect(canonicalLink).toBeTruthy();
      expect(canonicalLink?.getAttribute('href')).toBe('https://example.com/posts/123');
    });
  });

  describe('Open Graph Protocol (OGP) タグ', () => {
    it('should render og:title tag', () => {
      render(
        <SEOHead
          title="Test Blog Post"
          description="This is a test blog post"
          keywords={['test', 'blog']}
        />
      );

      const ogTitle = document.querySelector('meta[property="og:title"]');
      expect(ogTitle).toBeTruthy();
      expect(ogTitle?.getAttribute('content')).toBe('Test Blog Post');
    });

    it('should render og:description tag', () => {
      render(
        <SEOHead
          title="Test Blog Post"
          description="This is a test blog post"
          keywords={['test', 'blog']}
        />
      );

      const ogDescription = document.querySelector('meta[property="og:description"]');
      expect(ogDescription).toBeTruthy();
      expect(ogDescription?.getAttribute('content')).toBe('This is a test blog post');
    });

    it('should render og:image tag when imageUrl is provided', () => {
      render(
        <SEOHead
          title="Test Blog Post"
          description="This is a test blog post"
          keywords={['test', 'blog']}
          imageUrl="https://example.com/image.jpg"
        />
      );

      const ogImage = document.querySelector('meta[property="og:image"]');
      expect(ogImage).toBeTruthy();
      expect(ogImage?.getAttribute('content')).toBe('https://example.com/image.jpg');
    });

    it('should render og:url tag when url is provided', () => {
      render(
        <SEOHead
          title="Test Blog Post"
          description="This is a test blog post"
          keywords={['test', 'blog']}
          url="https://example.com/posts/123"
        />
      );

      const ogUrl = document.querySelector('meta[property="og:url"]');
      expect(ogUrl).toBeTruthy();
      expect(ogUrl?.getAttribute('content')).toBe('https://example.com/posts/123');
    });

    it('should render og:type tag with default value "article"', () => {
      render(
        <SEOHead
          title="Test Blog Post"
          description="This is a test blog post"
          keywords={['test', 'blog']}
        />
      );

      const ogType = document.querySelector('meta[property="og:type"]');
      expect(ogType).toBeTruthy();
      expect(ogType?.getAttribute('content')).toBe('article');
    });

    it('should render og:type tag with custom value when provided', () => {
      render(
        <SEOHead
          title="Test Blog Post"
          description="This is a test blog post"
          keywords={['test', 'blog']}
          type="website"
        />
      );

      const ogType = document.querySelector('meta[property="og:type"]');
      expect(ogType).toBeTruthy();
      expect(ogType?.getAttribute('content')).toBe('website');
    });
  });

  describe('Twitter Card タグ', () => {
    it('should render twitter:card tag', () => {
      render(
        <SEOHead
          title="Test Blog Post"
          description="This is a test blog post"
          keywords={['test', 'blog']}
        />
      );

      const twitterCard = document.querySelector('meta[name="twitter:card"]');
      expect(twitterCard).toBeTruthy();
      expect(twitterCard?.getAttribute('content')).toBe('summary_large_image');
    });

    it('should render twitter:title tag', () => {
      render(
        <SEOHead
          title="Test Blog Post"
          description="This is a test blog post"
          keywords={['test', 'blog']}
        />
      );

      const twitterTitle = document.querySelector('meta[name="twitter:title"]');
      expect(twitterTitle).toBeTruthy();
      expect(twitterTitle?.getAttribute('content')).toBe('Test Blog Post');
    });

    it('should render twitter:description tag', () => {
      render(
        <SEOHead
          title="Test Blog Post"
          description="This is a test blog post"
          keywords={['test', 'blog']}
        />
      );

      const twitterDescription = document.querySelector('meta[name="twitter:description"]');
      expect(twitterDescription).toBeTruthy();
      expect(twitterDescription?.getAttribute('content')).toBe('This is a test blog post');
    });

    it('should render twitter:image tag when imageUrl is provided', () => {
      render(
        <SEOHead
          title="Test Blog Post"
          description="This is a test blog post"
          keywords={['test', 'blog']}
          imageUrl="https://example.com/image.jpg"
        />
      );

      const twitterImage = document.querySelector('meta[name="twitter:image"]');
      expect(twitterImage).toBeTruthy();
      expect(twitterImage?.getAttribute('content')).toBe('https://example.com/image.jpg');
    });
  });

  describe('構造化データ (JSON-LD)', () => {
    it('should render JSON-LD script tag for Article schema', () => {
      render(
        <SEOHead
          title="Test Blog Post"
          description="This is a test blog post"
          keywords={['test', 'blog']}
          url="https://example.com/posts/123"
          imageUrl="https://example.com/image.jpg"
          author="John Doe"
          publishedDate="2025-01-01T00:00:00Z"
        />
      );

      const jsonLdScript = document.querySelector('script[type="application/ld+json"]');
      expect(jsonLdScript).toBeTruthy();

      const jsonLdContent = JSON.parse(jsonLdScript?.textContent || '{}');
      expect(jsonLdContent['@context']).toBe('https://schema.org');
      expect(jsonLdContent['@type']).toBe('Article');
      expect(jsonLdContent.headline).toBe('Test Blog Post');
      expect(jsonLdContent.description).toBe('This is a test blog post');
      expect(jsonLdContent.image).toBe('https://example.com/image.jpg');
      expect(jsonLdContent.author).toEqual({
        '@type': 'Person',
        name: 'John Doe',
      });
      expect(jsonLdContent.datePublished).toBe('2025-01-01T00:00:00Z');
    });

    it('should render JSON-LD without optional fields when not provided', () => {
      render(
        <SEOHead
          title="Test Blog Post"
          description="This is a test blog post"
          keywords={['test', 'blog']}
        />
      );

      const jsonLdScript = document.querySelector('script[type="application/ld+json"]');
      expect(jsonLdScript).toBeTruthy();

      const jsonLdContent = JSON.parse(jsonLdScript?.textContent || '{}');
      expect(jsonLdContent['@context']).toBe('https://schema.org');
      expect(jsonLdContent['@type']).toBe('Article');
      expect(jsonLdContent.headline).toBe('Test Blog Post');
      expect(jsonLdContent.description).toBe('This is a test blog post');
      expect(jsonLdContent.image).toBeUndefined();
      expect(jsonLdContent.author).toBeUndefined();
      expect(jsonLdContent.datePublished).toBeUndefined();
    });
  });

  describe('エッジケース', () => {
    it('should handle empty keywords array', () => {
      render(
        <SEOHead
          title="Test Blog Post"
          description="This is a test blog post"
          keywords={[]}
        />
      );

      const keywordsMeta = document.querySelector('meta[name="keywords"]');
      expect(keywordsMeta).toBeTruthy();
      expect(keywordsMeta?.getAttribute('content')).toBe('');
    });

    it('should handle undefined keywords', () => {
      render(
        <SEOHead
          title="Test Blog Post"
          description="This is a test blog post"
        />
      );

      const keywordsMeta = document.querySelector('meta[name="keywords"]');
      expect(keywordsMeta).toBeFalsy();
    });

    it('should not render canonical link when url is not provided', () => {
      render(
        <SEOHead
          title="Test Blog Post"
          description="This is a test blog post"
          keywords={['test', 'blog']}
        />
      );

      const canonicalLink = document.querySelector('link[rel="canonical"]');
      expect(canonicalLink).toBeFalsy();
    });

    it('should not render og:url when url is not provided', () => {
      render(
        <SEOHead
          title="Test Blog Post"
          description="This is a test blog post"
          keywords={['test', 'blog']}
        />
      );

      const ogUrl = document.querySelector('meta[property="og:url"]');
      expect(ogUrl).toBeFalsy();
    });
  });
});
