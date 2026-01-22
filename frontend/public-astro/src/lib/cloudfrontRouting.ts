/**
 * CloudFront Function Routing Logic
 * Requirements: 7.8, 7.9, 5.6
 *
 * This module implements the URL rewriting logic for Astro SSG.
 * The logic is designed to be compatible with CloudFront Functions (ECMAScript 5.1).
 *
 * Key behaviors:
 * - Rewrites extensionless URLs to {path}/index.html for static pages
 * - Excludes specific paths from rewriting (API, admin, images, sitemap, RSS)
 */

/**
 * Known file extensions for web assets.
 * These are common extensions that CloudFront should serve directly.
 */
const KNOWN_EXTENSIONS = [
  'html',
  'htm',
  'js',
  'mjs',
  'cjs',
  'css',
  'json',
  'xml',
  'txt',
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'svg',
  'ico',
  'avif',
  'woff',
  'woff2',
  'ttf',
  'eot',
  'otf',
  'pdf',
  'mp3',
  'mp4',
  'webm',
  'ogg',
  'map',
  'wasm',
];

/**
 * Check if a URI has a file extension in its last segment.
 * This is used to determine if the path is a file request or a route request.
 *
 * Only known web file extensions are recognized to avoid false positives
 * with paths like /posts/2024.01.15 (which looks like a date, not a file).
 *
 * @param uri - The request URI
 * @returns true if the last segment has a known file extension
 */
export function hasFileExtension(uri: string): boolean {
  if (!uri || uri === '/') {
    return false;
  }

  // Get the last segment of the path
  const segments = uri.split('/');
  const lastSegment = segments[segments.length - 1];

  // If the last segment is empty (trailing slash), no extension
  if (lastSegment === '') {
    return false;
  }

  // Find the last dot in the segment
  const lastDotIndex = lastSegment.lastIndexOf('.');

  // No dot or dot at the beginning (hidden file)
  if (lastDotIndex <= 0) {
    return false;
  }

  // Get the extension (part after the last dot), lowercased
  const extension = lastSegment.substring(lastDotIndex + 1).toLowerCase();

  // Check if it's a known extension
  return KNOWN_EXTENSIONS.indexOf(extension) > -1;
}

/**
 * Check if a URI matches any of the excluded path patterns.
 * These paths should NOT be rewritten as they are handled by other origins
 * or are static files that should be served as-is.
 *
 * Excluded patterns (Requirement 7.9, 5.6):
 * - /_astro/* - Astro static assets
 * - /api/* - API Gateway routes
 * - /admin/* - Admin SPA routes
 * - /images/* - Image bucket
 * - /sitemap*.xml - Sitemap files
 * - /rss.xml - RSS feed
 * - /robots.txt - Robots file
 *
 * @param uri - The request URI
 * @returns true if the path should be excluded from rewriting
 */
export function isExcludedPath(uri: string): boolean {
  // Check for /_astro/* prefix
  if (uri.indexOf('/_astro/') === 0) {
    return true;
  }

  // Check for /api/* prefix
  if (uri.indexOf('/api/') === 0) {
    return true;
  }

  // Check for /admin prefix (including /admin, /admin/, /admin/*)
  if (uri === '/admin' || uri.indexOf('/admin/') === 0) {
    return true;
  }

  // Check for /images/* prefix
  if (uri.indexOf('/images/') === 0) {
    return true;
  }

  // Check for sitemap files (/sitemap*.xml pattern)
  // This includes /sitemap-index.xml, /sitemap-0.xml, etc.
  if (uri.indexOf('/sitemap') === 0 && uri.indexOf('.xml') > -1) {
    return true;
  }

  // Check for RSS feed
  if (uri === '/rss.xml') {
    return true;
  }

  // Check for robots.txt
  if (uri === '/robots.txt') {
    return true;
  }

  return false;
}

/**
 * Rewrite a URI according to Astro SSG routing rules (Requirement 7.8).
 *
 * Rules:
 * 1. If the URI has a file extension, pass through unchanged
 * 2. If the URI matches an excluded pattern, pass through unchanged
 * 3. Otherwise, rewrite to {path}/index.html
 *
 * Examples:
 * - / → /index.html
 * - /about → /about/index.html
 * - /posts/123 → /posts/123/index.html
 * - /posts/123/ → /posts/123/index.html
 * - /api/posts → /api/posts (excluded)
 * - /_astro/styles.css → /_astro/styles.css (has extension)
 *
 * @param uri - The request URI
 * @returns The rewritten URI
 */
export function rewriteUri(uri: string): string {
  // Handle empty string
  if (!uri || uri === '') {
    return '/index.html';
  }

  // If the URI has a file extension, pass through unchanged
  if (hasFileExtension(uri)) {
    return uri;
  }

  // If the URI matches an excluded pattern, pass through unchanged
  if (isExcludedPath(uri)) {
    return uri;
  }

  // Rewrite to {path}/index.html
  // Handle trailing slash: /posts/123/ → /posts/123/index.html
  if (uri.charAt(uri.length - 1) === '/') {
    return uri + 'index.html';
  }

  // No trailing slash: /posts/123 → /posts/123/index.html
  return uri + '/index.html';
}

/**
 * Generate CloudFront Function code from the routing logic.
 * This creates ES5.1 compatible code for deployment.
 *
 * Note: The CloudFront Function uses a known extensions list for accurate detection
 * of file requests vs route requests. This prevents false positives with paths
 * like /posts/2024.01.15 which look like dates, not files.
 *
 * @returns CloudFront Function code as a string
 */
export function generateCloudFrontFunctionCode(): string {
  // Generate the known extensions array for ES5
  const extensionsArray = KNOWN_EXTENSIONS.map((ext) => `'${ext}'`).join(',');

  return `function handler(event) {
  var request = event.request;
  var uri = request.uri;

  // Known file extensions for web assets
  var knownExtensions = [${extensionsArray}];

  // Check for file extension in last segment
  var segments = uri.split('/');
  var lastSegment = segments[segments.length - 1];

  if (lastSegment !== '') {
    var lastDotIndex = lastSegment.lastIndexOf('.');
    if (lastDotIndex > 0) {
      var ext = lastSegment.substring(lastDotIndex + 1).toLowerCase();
      for (var i = 0; i < knownExtensions.length; i++) {
        if (knownExtensions[i] === ext) {
          return request;
        }
      }
    }
  }

  // Check for excluded paths
  if (uri.indexOf('/_astro/') === 0 ||
      uri.indexOf('/api/') === 0 ||
      uri === '/admin' ||
      uri.indexOf('/admin/') === 0 ||
      uri.indexOf('/images/') === 0 ||
      (uri.indexOf('/sitemap') === 0 && uri.indexOf('.xml') > -1) ||
      uri === '/rss.xml' ||
      uri === '/robots.txt') {
    return request;
  }

  // Rewrite to index.html
  if (uri.charAt(uri.length - 1) === '/') {
    request.uri = uri + 'index.html';
  } else {
    request.uri = uri + '/index.html';
  }

  return request;
}`;
}
