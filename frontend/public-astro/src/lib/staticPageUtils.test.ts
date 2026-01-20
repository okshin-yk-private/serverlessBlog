/**
 * Static Page Utility Functions Tests
 *
 * Task 2.4: Aboutページと404ページ実装
 *
 * Requirements:
 * - 2.4: Aboutページを静的に生成
 * - 15.1: カスタム404ページを作成
 * - 15.2: 404ページにホームへのナビゲーションを含める
 * - 15.4: 404ページに `<meta name="robots" content="noindex">` を設定
 * - 15.5: 404ページでもサイトヘッダーとナビゲーションを維持
 */
import { describe, it, expect } from 'vitest';
import {
  getSiteMetadata,
  getAboutPageContent,
  get404PageContent,
} from './staticPageUtils';

describe('staticPageUtils', () => {
  describe('getSiteMetadata', () => {
    it('should return site metadata with title and description', () => {
      const metadata = getSiteMetadata();
      expect(metadata.siteName).toBe('bone of my fallacy');
      expect(metadata.siteDescription).toBeDefined();
      expect(metadata.author).toBeDefined();
    });

    it('should include author information', () => {
      const metadata = getSiteMetadata();
      expect(metadata.author.name).toBeDefined();
      expect(typeof metadata.author.name).toBe('string');
    });
  });

  describe('getAboutPageContent', () => {
    it('should return about page content with title', () => {
      const content = getAboutPageContent();
      expect(content.title).toBeDefined();
      expect(typeof content.title).toBe('string');
    });

    it('should return about page description', () => {
      const content = getAboutPageContent();
      expect(content.description).toBeDefined();
      expect(content.description.length).toBeGreaterThan(0);
    });

    it('should return sections array with content', () => {
      const content = getAboutPageContent();
      expect(content.sections).toBeDefined();
      expect(Array.isArray(content.sections)).toBe(true);
      expect(content.sections.length).toBeGreaterThan(0);
    });

    it('should have sections with heading and content', () => {
      const content = getAboutPageContent();
      content.sections.forEach((section) => {
        expect(section.heading).toBeDefined();
        expect(section.content).toBeDefined();
      });
    });
  });

  describe('get404PageContent', () => {
    it('should return 404 page content with title', () => {
      const content = get404PageContent();
      expect(content.title).toBeDefined();
      expect(content.title).toContain('404');
    });

    it('should return noindex meta for SEO', () => {
      const content = get404PageContent();
      expect(content.noindex).toBe(true);
    });

    it('should include home link path', () => {
      const content = get404PageContent();
      expect(content.homeLink).toBe('/');
    });

    it('should return error message in Japanese', () => {
      const content = get404PageContent();
      expect(content.message).toBeDefined();
      expect(typeof content.message).toBe('string');
    });

    it('should include navigation suggestions', () => {
      const content = get404PageContent();
      expect(content.suggestions).toBeDefined();
      expect(Array.isArray(content.suggestions)).toBe(true);
    });

    it('should have navigation button text', () => {
      const content = get404PageContent();
      expect(content.homeButtonText).toBeDefined();
      expect(typeof content.homeButtonText).toBe('string');
    });
  });
});
