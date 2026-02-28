/**
 * SEO・OGP・JSON-LD統合テスト
 *
 * Task 8.2: 統合テスト実装
 *
 * Requirements:
 * - 13.2: SEO implementation shall have tests verifying meta tags, OGP, and JSON-LD in generated HTML
 * - 3.1-3.7: SEOメタタグ
 * - 4.1-4.4: JSON-LD構造化データ
 *
 * Note: このテストは事前にビルドされた dist/ ディレクトリを検証します。
 * ビルドは `tests/build-with-mock.sh` スクリプトで実行してください:
 *   MOCK_PORT=3458 ./tests/build-with-mock.sh
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { mockPosts } from './mock-api-server';

const distDir = join(import.meta.dirname, '../dist');
const SITE_URL = 'https://example.com';
const SITE_NAME = 'bone of my fallacy';

/**
 * HTMLからJSON-LDスクリプトを抽出
 */
function extractJsonLd(html: string): unknown[] {
  const jsonLdRegex =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const results: unknown[] = [];
  let match;
  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      results.push(JSON.parse(match[1]));
    } catch {
      // Skip invalid JSON
    }
  }
  return results;
}

/**
 * HTMLからmeta ogタグを抽出
 */
function extractOgMeta(html: string): Record<string, string> {
  const ogRegex =
    /<meta[^>]*property=["']og:([^"']+)["'][^>]*content=["']([^"']*)["'][^>]*>/gi;
  const ogRegexReverse =
    /<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:([^"']+)["'][^>]*>/gi;
  const result: Record<string, string> = {};

  let match;
  while ((match = ogRegex.exec(html)) !== null) {
    result[match[1]] = match[2];
  }
  while ((match = ogRegexReverse.exec(html)) !== null) {
    result[match[2]] = match[1];
  }

  return result;
}

/**
 * HTMLからTwitterカードタグを抽出
 */
function extractTwitterMeta(html: string): Record<string, string> {
  const twitterRegex =
    /<meta[^>]*name=["']twitter:([^"']+)["'][^>]*content=["']([^"']*)["'][^>]*>/gi;
  const twitterRegexReverse =
    /<meta[^>]*content=["']([^"']*)["'][^>]*name=["']twitter:([^"']+)["'][^>]*>/gi;
  const result: Record<string, string> = {};

  let match;
  while ((match = twitterRegex.exec(html)) !== null) {
    result[match[1]] = match[2];
  }
  while ((match = twitterRegexReverse.exec(html)) !== null) {
    result[match[2]] = match[1];
  }

  return result;
}

/**
 * HTMLからtitleタグを抽出
 */
function extractTitle(html: string): string | null {
  const match = html.match(/<title>([^<]*)<\/title>/);
  return match ? match[1] : null;
}

/**
 * HTMLからmeta descriptionを抽出
 */
function extractMetaDescription(html: string): string | null {
  const match = html.match(
    /<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/
  );
  const matchReverse = html.match(
    /<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/
  );
  return match ? match[1] : matchReverse ? matchReverse[1] : null;
}

/**
 * HTMLからcanonical URLを抽出
 */
function extractCanonical(html: string): string | null {
  const match = html.match(
    /<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["'][^>]*>/
  );
  const matchReverse = html.match(
    /<link[^>]*href=["']([^"']*)["'][^>]*rel=["']canonical["'][^>]*>/
  );
  return match ? match[1] : matchReverse ? matchReverse[1] : null;
}

describe('SEO・OGP・JSON-LD統合テスト (Task 8.2)', () => {
  beforeAll(() => {
    if (!existsSync(distDir)) {
      throw new Error(
        'dist/ directory not found. Run "MOCK_PORT=3458 ./tests/build-with-mock.sh" first.'
      );
    }
  });

  describe('ホームページ SEO検証 (Requirement 3.1-3.7, 4.4)', () => {
    it('should include <title> tag (Requirement 3.1)', () => {
      const indexHtml = readFileSync(join(distDir, 'index.html'), 'utf-8');
      const title = extractTitle(indexHtml);

      expect(title).not.toBeNull();
      expect(title).toContain(SITE_NAME);
    });

    it('should include <meta name="description"> tag (Requirement 3.1)', () => {
      const indexHtml = readFileSync(join(distDir, 'index.html'), 'utf-8');
      const description = extractMetaDescription(indexHtml);

      expect(description).not.toBeNull();
      expect(description!.length).toBeGreaterThan(0);
      expect(description!.length).toBeLessThanOrEqual(160);
    });

    it('should include canonical URL (Requirement 3.7)', () => {
      const indexHtml = readFileSync(join(distDir, 'index.html'), 'utf-8');
      const canonical = extractCanonical(indexHtml);

      expect(canonical).not.toBeNull();
      expect(canonical).toContain(SITE_URL);
    });

    it('should include OGP tags (Requirement 3.2)', () => {
      const indexHtml = readFileSync(join(distDir, 'index.html'), 'utf-8');
      const og = extractOgMeta(indexHtml);

      expect(og.title).toBeDefined();
      expect(og.description).toBeDefined();
      expect(og.url).toBeDefined();
      expect(og.type).toBe('website');
    });

    it('should include Twitter Card tags (Requirement 3.3)', () => {
      const indexHtml = readFileSync(join(distDir, 'index.html'), 'utf-8');
      const twitter = extractTwitterMeta(indexHtml);

      expect(twitter.card).toBeDefined();
      expect(twitter.title).toBeDefined();
      expect(twitter.description).toBeDefined();
    });

    it('should include WebSite JSON-LD (Requirement 4.4)', () => {
      const indexHtml = readFileSync(join(distDir, 'index.html'), 'utf-8');
      const jsonLdArray = extractJsonLd(indexHtml);

      const webSiteJsonLd = jsonLdArray.find(
        (ld: unknown) =>
          typeof ld === 'object' &&
          ld !== null &&
          '@type' in ld &&
          (ld as Record<string, unknown>)['@type'] === 'WebSite'
      );

      expect(webSiteJsonLd).toBeDefined();

      const typedJsonLd = webSiteJsonLd as Record<string, unknown>;
      expect(typedJsonLd['@context']).toBe('https://schema.org');
      expect(typedJsonLd.name).toBeDefined();
      expect(typedJsonLd.url).toBeDefined();
    });
  });

  describe('Aboutページ SEO検証 (Requirement 3.1-3.7)', () => {
    it('should include proper title for About page', () => {
      const aboutHtml = readFileSync(
        join(distDir, 'about', 'index.html'),
        'utf-8'
      );
      const title = extractTitle(aboutHtml);

      expect(title).not.toBeNull();
      expect(title).toContain('About');
      expect(title).toContain(SITE_NAME);
    });

    it('should include meta description for About page', () => {
      const aboutHtml = readFileSync(
        join(distDir, 'about', 'index.html'),
        'utf-8'
      );
      const description = extractMetaDescription(aboutHtml);

      expect(description).not.toBeNull();
      expect(description!.length).toBeGreaterThan(0);
    });

    it('should include canonical URL for About page', () => {
      const aboutHtml = readFileSync(
        join(distDir, 'about', 'index.html'),
        'utf-8'
      );
      const canonical = extractCanonical(aboutHtml);

      expect(canonical).not.toBeNull();
      expect(canonical).toContain(SITE_URL);
      expect(canonical).toContain('/about');
    });

    it('should include OGP tags for About page with type=website', () => {
      const aboutHtml = readFileSync(
        join(distDir, 'about', 'index.html'),
        'utf-8'
      );
      const og = extractOgMeta(aboutHtml);

      expect(og.title).toBeDefined();
      expect(og.type).toBe('website');
      expect(og.url).toContain('/about');
    });
  });

  describe('記事詳細ページ SEO検証 (Requirement 3.1-3.7, 4.1-4.3)', () => {
    const publishedPosts = mockPosts.filter(
      (p) => p.publishStatus === 'published'
    );

    it('should generate post pages for all published posts', () => {
      for (const post of publishedPosts) {
        const postPath = join(distDir, 'posts', post.id, 'index.html');
        expect(existsSync(postPath)).toBe(true);
      }
    });

    it('should include proper title for each post page (Requirement 3.1)', () => {
      for (const post of publishedPosts) {
        const postHtml = readFileSync(
          join(distDir, 'posts', post.id, 'index.html'),
          'utf-8'
        );
        const title = extractTitle(postHtml);

        expect(title).not.toBeNull();
        expect(title).toContain(post.title);
        expect(title).toContain(SITE_NAME);
      }
    });

    it('should include meta description for each post page (Requirement 3.1, 3.6)', () => {
      for (const post of publishedPosts) {
        const postHtml = readFileSync(
          join(distDir, 'posts', post.id, 'index.html'),
          'utf-8'
        );
        const description = extractMetaDescription(postHtml);

        expect(description).not.toBeNull();
        // Description should be max 160 characters
        expect(description!.length).toBeLessThanOrEqual(160);
      }
    });

    it('should include canonical URL for each post page (Requirement 3.7)', () => {
      for (const post of publishedPosts) {
        const postHtml = readFileSync(
          join(distDir, 'posts', post.id, 'index.html'),
          'utf-8'
        );
        const canonical = extractCanonical(postHtml);

        expect(canonical).not.toBeNull();
        expect(canonical).toContain(SITE_URL);
        expect(canonical).toContain(`/posts/${post.id}`);
      }
    });

    it('should include OGP tags with type=article for posts (Requirement 3.2, 3.4)', () => {
      for (const post of publishedPosts) {
        const postHtml = readFileSync(
          join(distDir, 'posts', post.id, 'index.html'),
          'utf-8'
        );
        const og = extractOgMeta(postHtml);

        expect(og.title).toBeDefined();
        expect(og.description).toBeDefined();
        expect(og.url).toContain(`/posts/${post.id}`);
        expect(og.type).toBe('article');
      }
    });

    it('should include og:image for posts with images (Requirement 3.5)', () => {
      const postWithImage = publishedPosts.find(
        (p) => p.imageUrls && p.imageUrls.length > 0
      );

      if (postWithImage) {
        const postHtml = readFileSync(
          join(distDir, 'posts', postWithImage.id, 'index.html'),
          'utf-8'
        );
        const og = extractOgMeta(postHtml);

        expect(og.image).toBeDefined();
        expect(og.image).toContain(postWithImage.imageUrls![0]);
      }
    });

    it('should include Twitter Card tags for posts (Requirement 3.3)', () => {
      for (const post of publishedPosts) {
        const postHtml = readFileSync(
          join(distDir, 'posts', post.id, 'index.html'),
          'utf-8'
        );
        const twitter = extractTwitterMeta(postHtml);

        expect(twitter.card).toBeDefined();
        expect(twitter.title).toBeDefined();
        expect(twitter.description).toBeDefined();
      }
    });

    it('should include BlogPosting JSON-LD for posts (Requirement 4.1-4.3)', () => {
      for (const post of publishedPosts) {
        const postHtml = readFileSync(
          join(distDir, 'posts', post.id, 'index.html'),
          'utf-8'
        );
        const jsonLdArray = extractJsonLd(postHtml);

        const blogPostingJsonLd = jsonLdArray.find(
          (ld: unknown) =>
            typeof ld === 'object' &&
            ld !== null &&
            '@type' in ld &&
            (ld as Record<string, unknown>)['@type'] === 'BlogPosting'
        );

        expect(blogPostingJsonLd).toBeDefined();

        const typedJsonLd = blogPostingJsonLd as Record<string, unknown>;
        // Requirement 4.1: @type: "BlogPosting"
        expect(typedJsonLd['@context']).toBe('https://schema.org');
        expect(typedJsonLd['@type']).toBe('BlogPosting');

        // Requirement 4.2: headline, datePublished, dateModified, author
        expect(typedJsonLd.headline).toBeDefined();
        expect(typedJsonLd.datePublished).toBeDefined();
        expect(typedJsonLd.dateModified).toBeDefined();
        expect(typedJsonLd.author).toBeDefined();

        const author = typedJsonLd.author as Record<string, unknown>;
        expect(author['@type']).toBe('Person');
        expect(author.name).toBeDefined();
      }
    });

    it('should include image in JSON-LD for posts with images (Requirement 4.3)', () => {
      const postWithImage = publishedPosts.find(
        (p) => p.imageUrls && p.imageUrls.length > 0
      );

      if (postWithImage) {
        const postHtml = readFileSync(
          join(distDir, 'posts', postWithImage.id, 'index.html'),
          'utf-8'
        );
        const jsonLdArray = extractJsonLd(postHtml);

        const blogPostingJsonLd = jsonLdArray.find(
          (ld: unknown) =>
            typeof ld === 'object' &&
            ld !== null &&
            '@type' in ld &&
            (ld as Record<string, unknown>)['@type'] === 'BlogPosting'
        );

        expect(blogPostingJsonLd).toBeDefined();

        const typedJsonLd = blogPostingJsonLd as Record<string, unknown>;
        expect(typedJsonLd.image).toBeDefined();
      }
    });
  });

  describe('404ページ SEO検証 (Requirement 15.4)', () => {
    it('should include noindex meta tag', () => {
      const notFoundHtml = readFileSync(join(distDir, '404.html'), 'utf-8');
      expect(notFoundHtml).toMatch(
        /<meta[^>]*name=["']robots["'][^>]*content=["']noindex["'][^>]*>/
      );
    });

    it('should NOT include JSON-LD on 404 page', () => {
      const notFoundHtml = readFileSync(join(distDir, '404.html'), 'utf-8');
      const jsonLdArray = extractJsonLd(notFoundHtml);

      // 404 page should not have any JSON-LD structured data
      expect(jsonLdArray.length).toBe(0);
    });
  });

  describe('日本語対応 SEO検証 (Requirement 14.3)', () => {
    it('should correctly encode Japanese characters in meta tags', () => {
      const japanesePost = mockPosts.find(
        (p) =>
          p.publishStatus === 'published' &&
          /[\u3040-\u30ff\u4e00-\u9faf]/.test(p.title)
      );

      if (japanesePost) {
        const postHtml = readFileSync(
          join(distDir, 'posts', japanesePost.id, 'index.html'),
          'utf-8'
        );
        const title = extractTitle(postHtml);
        const og = extractOgMeta(postHtml);

        // Japanese title should be included
        expect(title).toContain(japanesePost.title);

        // OG title should also include Japanese
        expect(og.title).toContain(japanesePost.title);
      }
    });

    it('should have UTF-8 charset in all pages', () => {
      const pages = [
        join(distDir, 'index.html'),
        join(distDir, 'about', 'index.html'),
        join(distDir, '404.html'),
      ];

      for (const page of pages) {
        const html = readFileSync(page, 'utf-8');
        expect(html).toMatch(/<meta[^>]*charset=["']?UTF-8["']?/i);
      }
    });
  });

  describe('全ページ共通SEO検証', () => {
    it('should have <html lang="ja"> in all pages', () => {
      const pages = [
        join(distDir, 'index.html'),
        join(distDir, 'about', 'index.html'),
        join(distDir, '404.html'),
      ];

      // Add all post pages
      const postsDir = join(distDir, 'posts');
      if (existsSync(postsDir)) {
        const postDirs = readdirSync(postsDir, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => join(postsDir, d.name, 'index.html'));
        pages.push(...postDirs);
      }

      for (const page of pages) {
        if (existsSync(page)) {
          const html = readFileSync(page, 'utf-8');
          expect(html).toMatch(/<html[^>]*lang=["']ja["']/);
        }
      }
    });

    it('should have viewport meta tag in all pages', () => {
      const pages = [
        join(distDir, 'index.html'),
        join(distDir, 'about', 'index.html'),
        join(distDir, '404.html'),
      ];

      for (const page of pages) {
        const html = readFileSync(page, 'utf-8');
        expect(html).toMatch(/<meta[^>]*name=["']viewport["'][^>]*>/);
      }
    });
  });
});
