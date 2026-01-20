/**
 * サイトマップ関連ユーティリティ
 *
 * Task 3.3: サイトマップ生成設定
 *
 * Requirements:
 * - 5.1: @astrojs/sitemap インテグレーションを設定
 * - 5.2: ホーム、About、全公開記事をサイトマップに含める
 * - 14.5: 日本語URLを正しくエンコード
 *
 * Note: @astrojs/sitemap が自動生成するため、このファイルは
 * URL生成のユーティリティ関数とテスト用の検証関数を提供する
 */

/**
 * サイトURL設定
 */
export interface SiteConfig {
  siteUrl: string;
}

/**
 * 静的ページのURLパスを取得
 */
export function getStaticPagePaths(): string[] {
  return [
    '/', // ホームページ
    '/about/', // Aboutページ
  ];
}

/**
 * 記事詳細ページのURLパスを生成
 */
export function getPostPagePath(postId: string): string {
  return `/posts/${postId}/`;
}

/**
 * 完全なURLを生成
 */
export function buildFullUrl(siteUrl: string, path: string): string {
  // 末尾のスラッシュを正規化
  const normalizedSiteUrl = siteUrl.endsWith('/')
    ? siteUrl.slice(0, -1)
    : siteUrl;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedSiteUrl}${normalizedPath}`;
}

/**
 * 日本語文字を含むURLをエンコード
 * (サイトマップはURLエンコードされた状態で保存される)
 */
export function encodeUrlPath(path: string): string {
  // パスの各セグメントをエンコード
  const segments = path.split('/');
  return segments.map((segment) => encodeURIComponent(segment)).join('/');
}

/**
 * 全ページのURLを生成（サイトマップ用）
 */
export function generateAllPageUrls(
  siteUrl: string,
  postIds: string[]
): string[] {
  const staticPaths = getStaticPagePaths();
  const postPaths = postIds.map((id) => getPostPagePath(id));
  const allPaths = [...staticPaths, ...postPaths];
  return allPaths.map((path) => buildFullUrl(siteUrl, path));
}

/**
 * サイトマップXMLに含まれるべきURLを検証
 */
export function validateSitemapUrls(
  sitemapContent: string,
  expectedUrls: string[]
): { valid: boolean; missingUrls: string[] } {
  const missingUrls: string[] = [];

  for (const url of expectedUrls) {
    // XMLエンコードされた状態でも検索
    const encodedUrl = url.replace(/&/g, '&amp;');
    if (!sitemapContent.includes(url) && !sitemapContent.includes(encodedUrl)) {
      missingUrls.push(url);
    }
  }

  return {
    valid: missingUrls.length === 0,
    missingUrls,
  };
}

/**
 * サイトマップXMLから<loc>要素を抽出
 */
export function extractLocUrls(sitemapContent: string): string[] {
  const locRegex = /<loc>([^<]+)<\/loc>/g;
  const urls: string[] = [];
  let match;

  while ((match = locRegex.exec(sitemapContent)) !== null) {
    // XMLエンコードをデコード
    const url = match[1].replace(/&amp;/g, '&');
    urls.push(url);
  }

  return urls;
}

/**
 * sitemap-index.xmlからサイトマップURLを抽出
 */
export function extractSitemapUrls(sitemapIndexContent: string): string[] {
  return extractLocUrls(sitemapIndexContent);
}
