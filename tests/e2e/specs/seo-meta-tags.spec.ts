import { test, expect } from '../fixtures';

/**
 * SEOメタタグのE2Eテスト
 *
 * Requirements:
 * - R45: E2Eテスト（SEOメタタグ）
 * - R40-42: 100%テストカバレッジ
 *
 * TDD Approach:
 * このテストは最初は失敗します（Red）
 * SEOメタタグが実装されたら成功します（Green）
 */

test.describe('SEO Meta Tags - Home Page', () => {
  test.beforeEach(async ({ homePage }) => {
    // ホームページに移動
    await homePage.navigate();
  });

  test('should have correct page title', async ({ page }) => {
    // Arrange & Act: ホームページに移動済み

    // Assert: ページタイトルが設定されていることを確認
    const title = await page.title();
    expect(title).toBeTruthy();
    expect(title.length).toBeGreaterThan(0);
    expect(title.length).toBeLessThanOrEqual(60); // SEOベストプラクティス: 60文字以内
  });

  test('should have meta description tag', async ({ page }) => {
    // Arrange & Act: ホームページに移動済み

    // Assert: meta descriptionタグが存在することを確認
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(description).toBeTruthy();
    expect(description!.length).toBeGreaterThan(50); // 最低50文字
    expect(description!.length).toBeLessThanOrEqual(160); // SEOベストプラクティス: 160文字以内
  });

  test('should have Open Graph meta tags', async ({ page }) => {
    // Arrange & Act: ホームページに移動済み

    // Assert: OGタグが存在することを確認
    const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
    const ogDescription = await page.locator('meta[property="og:description"]').getAttribute('content');
    const ogType = await page.locator('meta[property="og:type"]').getAttribute('content');
    const ogUrl = await page.locator('meta[property="og:url"]').getAttribute('content');

    expect(ogTitle).toBeTruthy();
    expect(ogDescription).toBeTruthy();
    expect(ogType).toBe('website');
    expect(ogUrl).toBeTruthy();
  });

  test('should have Twitter Card meta tags', async ({ page }) => {
    // Arrange & Act: ホームページに移動済み

    // Assert: Twitter Cardタグが存在することを確認
    const twitterCard = await page.locator('meta[name="twitter:card"]').getAttribute('content');
    const twitterTitle = await page.locator('meta[name="twitter:title"]').getAttribute('content');
    const twitterDescription = await page.locator('meta[name="twitter:description"]').getAttribute('content');

    expect(twitterCard).toBeTruthy();
    expect(['summary', 'summary_large_image']).toContain(twitterCard);
    expect(twitterTitle).toBeTruthy();
    expect(twitterDescription).toBeTruthy();
  });

  test('should have canonical URL', async ({ page }) => {
    // Arrange & Act: ホームページに移動済み

    // Assert: canonical linkタグが存在することを確認
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toBeTruthy();
    expect(canonical).toContain('http');
  });

  test('should have viewport meta tag', async ({ page }) => {
    // Arrange & Act: ホームページに移動済み

    // Assert: viewportメタタグが存在することを確認
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).toContain('width=device-width');
    expect(viewport).toContain('initial-scale=1');
  });

  test('should have charset meta tag', async ({ page }) => {
    // Arrange & Act: ホームページに移動済み

    // Assert: charsetメタタグが存在することを確認
    const charset = await page.locator('meta[charset]').getAttribute('charset');
    expect(charset).toBe('UTF-8');
  });

  test('should have language attribute on html tag', async ({ page }) => {
    // Arrange & Act: ホームページに移動済み

    // Assert: htmlタグにlang属性が設定されていることを確認
    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).toBeTruthy();
    expect(['ja', 'en']).toContain(lang); // 日本語または英語
  });
});

test.describe('SEO Meta Tags - Article Page', () => {
  test.beforeEach(async ({ homePage, articlePage }) => {
    // ホームページに移動して記事をクリック
    await homePage.navigate();
    const articles = homePage.getArticles();
    const count = await articles.count();

    if (count > 0) {
      await articles.first().click();
      await articlePage.waitForPageLoad();
    } else {
      test.skip();
    }
  });

  test('should have article-specific page title', async ({ page }) => {
    // Arrange & Act: 記事ページに移動済み

    // Assert: 記事タイトルがページタイトルに含まれていることを確認
    const title = await page.title();
    expect(title).toBeTruthy();
    expect(title.length).toBeLessThanOrEqual(60);
  });

  test('should have article-specific meta description', async ({ page }) => {
    // Arrange & Act: 記事ページに移動済み

    // Assert: 記事の抜粋がmeta descriptionに設定されていることを確認
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    expect(description).toBeTruthy();
    expect(description!.length).toBeGreaterThan(50);
    expect(description!.length).toBeLessThanOrEqual(160);
  });

  test('should have article Open Graph meta tags', async ({ page }) => {
    // Arrange & Act: 記事ページに移動済み

    // Assert: 記事用のOGタグが存在することを確認
    const ogType = await page.locator('meta[property="og:type"]').getAttribute('content');
    const ogTitle = await page.locator('meta[property="og:title"]').getAttribute('content');
    const ogDescription = await page.locator('meta[property="og:description"]').getAttribute('content');
    const ogUrl = await page.locator('meta[property="og:url"]').getAttribute('content');

    expect(ogType).toBe('article');
    expect(ogTitle).toBeTruthy();
    expect(ogDescription).toBeTruthy();
    expect(ogUrl).toBeTruthy();
  });

  test('should have article published time meta tag', async ({ page }) => {
    // Arrange & Act: 記事ページに移動済み

    // Assert: 公開日時のメタタグが存在することを確認
    const publishedTime = await page.locator('meta[property="article:published_time"]').getAttribute('content');
    expect(publishedTime).toBeTruthy();

    // ISO 8601形式の日時文字列であることを確認
    const date = new Date(publishedTime!);
    expect(date.toString()).not.toBe('Invalid Date');
  });

  test('should have article modified time meta tag', async ({ page }) => {
    // Arrange & Act: 記事ページに移動済み

    // Assert: 更新日時のメタタグが存在することを確認
    const modifiedTime = await page.locator('meta[property="article:modified_time"]').getAttribute('content');

    // 更新日時は必須ではないが、存在する場合は有効な日時であること
    if (modifiedTime) {
      const date = new Date(modifiedTime);
      expect(date.toString()).not.toBe('Invalid Date');
    }
  });

  test('should have article author meta tag', async ({ page }) => {
    // Arrange & Act: 記事ページに移動済み

    // Assert: 著者のメタタグが存在することを確認
    const author = await page.locator('meta[property="article:author"]').getAttribute('content');
    expect(author).toBeTruthy();
  });

  test('should have article canonical URL', async ({ page }) => {
    // Arrange & Act: 記事ページに移動済み

    // Assert: 記事固有のcanonical URLが設定されていることを確認
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(canonical).toBeTruthy();
    expect(canonical).toContain('http');

    // URLに記事IDまたはスラッグが含まれていることを確認
    expect(canonical!.length).toBeGreaterThan(20);
  });

  test('should have article image for Open Graph', async ({ page }) => {
    // Arrange & Act: 記事ページに移動済み

    // Assert: OG画像タグが存在することを確認
    const ogImageCount = await page.locator('meta[property="og:image"]').count();
    const ogImage = ogImageCount > 0 ? await page.locator('meta[property="og:image"]').getAttribute('content') : null;

    // 画像は任意だが、存在する場合は有効なURLであること
    if (ogImage) {
      expect(ogImage).toContain('http');

      // 画像の幅と高さのメタタグも確認
      const ogImageWidthCount = await page.locator('meta[property="og:image:width"]').count();
      const ogImageWidth = ogImageWidthCount > 0 ? await page.locator('meta[property="og:image:width"]').getAttribute('content') : null;

      const ogImageHeightCount = await page.locator('meta[property="og:image:height"]').count();
      const ogImageHeight = ogImageHeightCount > 0 ? await page.locator('meta[property="og:image:height"]').getAttribute('content') : null;

      if (ogImageWidth && ogImageHeight) {
        expect(parseInt(ogImageWidth)).toBeGreaterThan(0);
        expect(parseInt(ogImageHeight)).toBeGreaterThan(0);
      }
    }
  });
});

test.describe('SEO Meta Tags - Structured Data', () => {
  test.beforeEach(async ({ homePage }) => {
    await homePage.navigate();
  });

  test('should have JSON-LD structured data for website', async ({ page }) => {
    // Arrange & Act: ホームページに移動済み

    // Assert: JSON-LD構造化データが存在することを確認
    const jsonLd = await page.locator('script[type="application/ld+json"]').first().textContent();
    expect(jsonLd).toBeTruthy();

    // JSONとしてパースできることを確認
    const data = JSON.parse(jsonLd!);
    expect(data['@context']).toBe('https://schema.org');
    expect(data['@type']).toBeTruthy();
  });

  test('should have breadcrumb structured data on article page', async ({ homePage, articlePage, page }) => {
    // Arrange: 記事ページに移動
    await homePage.navigate();
    const articles = homePage.getArticles();
    const count = await articles.count();

    if (count === 0) {
      test.skip();
    }

    await articles.first().click();
    await articlePage.waitForPageLoad();

    // Act & Assert: パンくずリストの構造化データが存在することを確認
    const scripts = await page.locator('script[type="application/ld+json"]').all();
    let hasBreadcrumb = false;

    for (const script of scripts) {
      const content = await script.textContent();
      if (content) {
        const data = JSON.parse(content);
        if (data['@type'] === 'BreadcrumbList') {
          hasBreadcrumb = true;
          expect(data.itemListElement).toBeTruthy();
          expect(Array.isArray(data.itemListElement)).toBeTruthy();
          break;
        }
      }
    }

    expect(hasBreadcrumb).toBeTruthy();
  });

  test('should have article structured data', async ({ homePage, articlePage, page }) => {
    // Arrange: 記事ページに移動
    await homePage.navigate();
    const articles = homePage.getArticles();
    const count = await articles.count();

    if (count === 0) {
      test.skip();
    }

    await articles.first().click();
    await articlePage.waitForPageLoad();

    // Act & Assert: 記事の構造化データが存在することを確認
    const scripts = await page.locator('script[type="application/ld+json"]').all();
    let hasArticle = false;

    for (const script of scripts) {
      const content = await script.textContent();
      if (content) {
        const data = JSON.parse(content);
        if (['Article', 'BlogPosting', 'NewsArticle'].includes(data['@type'])) {
          hasArticle = true;
          expect(data.headline).toBeTruthy();
          expect(data.datePublished).toBeTruthy();
          expect(data.author).toBeTruthy();
          break;
        }
      }
    }

    expect(hasArticle).toBeTruthy();
  });
});

test.describe('SEO Meta Tags - Robots and Indexing', () => {
  test('should have robots meta tag on home page', async ({ homePage, page }) => {
    // Arrange & Act: ホームページに移動
    await homePage.navigate();

    // Assert: robotsメタタグが適切に設定されていることを確認
    const robotsCount = await page.locator('meta[name="robots"]').count();
    const robots = robotsCount > 0 ? await page.locator('meta[name="robots"]').getAttribute('content') : null;

    // robotsタグは任意だが、存在する場合は適切な値であること
    if (robots) {
      const validValues = ['index', 'follow', 'noindex', 'nofollow', 'all', 'none'];
      const robotsValues = robots.split(',').map(v => v.trim());
      robotsValues.forEach(value => {
        expect(validValues).toContain(value);
      });
    }
  });

  test('should have sitemap reference in robots.txt', async ({ page }) => {
    // Arrange & Act: robots.txtにアクセス
    const response = await page.goto('/robots.txt');

    // Assert: robots.txtが存在し、sitemapへの参照があることを確認
    if (response && response.ok()) {
      const content = await response.text();
      expect(content).toContain('Sitemap:');
    }
  });
});

test.describe('SEO Meta Tags - Social Media Optimization', () => {
  test('should have Facebook domain verification meta tag', async ({ homePage, page }) => {
    // Arrange & Act: ホームページに移動
    await homePage.navigate();

    // Assert: Facebook検証タグ（任意）
    const fbVerificationCount = await page.locator('meta[name="facebook-domain-verification"]').count();
    const fbVerification = fbVerificationCount > 0 ? await page.locator('meta[name="facebook-domain-verification"]').getAttribute('content') : null;

    // 任意なので存在しない場合もOK
    if (fbVerification) {
      expect(fbVerification.length).toBeGreaterThan(0);
    }
  });

  test('should have appropriate Twitter card type for articles', async ({ homePage, articlePage, page }) => {
    // Arrange: 記事ページに移動
    await homePage.navigate();
    const articles = homePage.getArticles();
    const count = await articles.count();

    if (count === 0) {
      test.skip();
    }

    await articles.first().click();
    await articlePage.waitForPageLoad();

    // Act & Assert: Twitter Cardタイプが記事に適していることを確認
    const twitterCard = await page.locator('meta[name="twitter:card"]').getAttribute('content');
    expect(twitterCard).toBeTruthy();

    // 記事の場合は summary_large_image が推奨
    expect(['summary', 'summary_large_image']).toContain(twitterCard);
  });
});
