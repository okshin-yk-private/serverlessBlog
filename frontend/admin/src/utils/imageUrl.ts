/**
 * 画像URL検証ユーティリティ
 *
 * セキュリティ上の考慮:
 * - 許可されたドメインからの画像のみ表示
 * - data: URLやjavascript: URLを拒否
 * - HTTPSのみ許可（外部URLの場合）
 */

/**
 * 許可されたドメインパターン
 * - CloudFront配信URL
 * - S3バケットURL
 * - 同一オリジン（相対パス）
 */
const ALLOWED_PATTERNS: RegExp[] = [
  // CloudFront URLs
  /^https:\/\/[a-z0-9-]+\.cloudfront\.net\//i,
  // S3 URLs (path-style)
  /^https:\/\/s3\.[a-z0-9-]+\.amazonaws\.com\/[a-z0-9-]+\//i,
  // S3 URLs (virtual-hosted style)
  /^https:\/\/[a-z0-9-]+\.s3\.[a-z0-9-]+\.amazonaws\.com\//i,
  // S3 URLs (legacy style)
  /^https:\/\/[a-z0-9-]+\.s3\.amazonaws\.com\//i,
];

/**
 * 危険なURLスキームのパターン
 */
const DANGEROUS_SCHEMES = [
  /^javascript:/i,
  /^data:/i,
  /^vbscript:/i,
  /^file:/i,
];

/**
 * 画像URLが許可されたソースかどうかを検証
 *
 * @param url - 検証する画像URL
 * @param allowedCloudFrontUrl - 環境変数で設定されたCloudFront URL（オプション）
 * @returns 許可されたURLかどうか
 */
export const isAllowedImageUrl = (
  url: string,
  allowedCloudFrontUrl?: string
): boolean => {
  // 空のURLは許可しない
  if (!url || typeof url !== 'string') {
    return false;
  }

  const trimmedUrl = url.trim();

  // 危険なスキームを拒否
  for (const pattern of DANGEROUS_SCHEMES) {
    if (pattern.test(trimmedUrl)) {
      return false;
    }
  }

  // 相対URLは許可（同一オリジンからの読み込み）
  if (trimmedUrl.startsWith('/') && !trimmedUrl.startsWith('//')) {
    return true;
  }

  // プロトコル相対URL（//example.com）は拒否
  if (trimmedUrl.startsWith('//')) {
    return false;
  }

  // HTTPは拒否（HTTPSのみ許可）
  if (trimmedUrl.startsWith('http://')) {
    return false;
  }

  // 環境変数で設定されたCloudFront URLをチェック
  if (allowedCloudFrontUrl && trimmedUrl.startsWith(allowedCloudFrontUrl)) {
    return true;
  }

  // 許可されたパターンをチェック
  for (const pattern of ALLOWED_PATTERNS) {
    if (pattern.test(trimmedUrl)) {
      return true;
    }
  }

  // 同一オリジンのチェック（ブラウザ環境の場合）
  if (typeof window !== 'undefined') {
    try {
      const urlObj = new URL(trimmedUrl, window.location.origin);
      if (urlObj.origin === window.location.origin) {
        return true;
      }
    } catch {
      // 無効なURLは拒否
      return false;
    }
  }

  return false;
};

/**
 * 画像URLをサニタイズ
 * 許可されていないURLの場合はプレースホルダーを返す
 *
 * @param url - サニタイズする画像URL
 * @param allowedCloudFrontUrl - 環境変数で設定されたCloudFront URL（オプション）
 * @returns サニタイズされたURL
 */
export const sanitizeImageUrl = (
  url: string,
  allowedCloudFrontUrl?: string
): string | null => {
  if (isAllowedImageUrl(url, allowedCloudFrontUrl)) {
    return url;
  }
  return null;
};

/**
 * 画像ファイル拡張子の検証
 */
const ALLOWED_IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.svg',
  '.avif',
];

/**
 * URLが画像ファイルの拡張子を持つかチェック
 *
 * @param url - チェックするURL
 * @returns 画像拡張子を持つかどうか
 */
export const hasImageExtension = (url: string): boolean => {
  if (!url) return false;

  try {
    const urlObj = new URL(
      url,
      window?.location?.origin || 'https://example.com'
    );
    const pathname = urlObj.pathname.toLowerCase();
    return ALLOWED_IMAGE_EXTENSIONS.some((ext) => pathname.endsWith(ext));
  } catch {
    return false;
  }
};
