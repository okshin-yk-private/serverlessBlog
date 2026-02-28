/**
 * SEO Utility Functions
 *
 * Task 3.1: SEOメタタグコンポーネント実装
 *
 * Requirements:
 * - 3.1: <title> and <meta name="description"> in all pages
 * - 3.2: Open Graph Protocol tags (og:title, og:description, og:image, og:url, og:type)
 * - 3.3: Twitter Card tags (twitter:card, twitter:title, twitter:description, twitter:image)
 * - 3.4: Article pages set og:type to "article"
 * - 3.5: Post's first image as og:image if available
 * - 3.6: Generate description from first 160 characters (see postDetailUtils.ts)
 * - 3.7: Canonical URL tag in all pages
 * - 14.3: Japanese characters properly escaped
 */

/**
 * SEO Props interface for page-level SEO configuration
 */
export interface SEOProps {
  /** Page title */
  title: string;
  /** Meta description (max 160 characters) */
  description: string;
  /** Canonical URL for the page */
  canonicalUrl: string;
  /** Open Graph type (website or article) */
  type?: 'website' | 'article';
  /** OG/Twitter image URL */
  imageUrl?: string;
  /** Article published date (ISO 8601) */
  publishedAt?: string;
  /** Article modified date (ISO 8601) */
  modifiedAt?: string;
  /** Whether to add noindex directive */
  noindex?: boolean;
}

/**
 * Open Graph data structure
 */
export interface OpenGraphData {
  title: string;
  description: string;
  url: string;
  type: 'website' | 'article';
  image?: string;
}

/**
 * Twitter Card data structure
 */
export interface TwitterCardData {
  card: 'summary' | 'summary_large_image';
  title: string;
  description: string;
  image?: string;
}

/**
 * Complete meta tags structure
 */
export interface MetaTagsData {
  title: string;
  description: string;
  canonicalUrl: string;
  og: OpenGraphData;
  twitter: TwitterCardData;
  noindex?: boolean;
}

/**
 * Build site title with site name suffix
 *
 * @param pageTitle - The page-specific title
 * @param siteName - The site name to append
 * @returns Formatted title with site name
 */
export function buildSiteTitle(pageTitle: string, siteName: string): string {
  // If page title is empty or equals site name, return site name only
  if (!pageTitle || pageTitle === siteName) {
    return siteName;
  }
  return `${pageTitle} | ${siteName}`;
}

/**
 * Generate Open Graph Protocol data
 *
 * @param props - SEO properties
 * @param _siteUrl - Base site URL (reserved for future use)
 * @returns Open Graph data object
 */
export function generateOpenGraphData(
  props: SEOProps,
  _siteUrl: string
): OpenGraphData {
  return {
    title: props.title,
    description: props.description,
    url: props.canonicalUrl,
    type: props.type ?? 'website',
    image: props.imageUrl,
  };
}

/**
 * Generate Twitter Card data
 *
 * @param props - SEO properties
 * @returns Twitter Card data object
 */
export function generateTwitterCardData(props: SEOProps): TwitterCardData {
  // Use summary_large_image when image is present, summary otherwise
  const card = props.imageUrl ? 'summary_large_image' : 'summary';

  return {
    card,
    title: props.title,
    description: props.description,
    image: props.imageUrl,
  };
}

/**
 * Build canonical URL from path and site URL
 *
 * @param path - The page path (e.g., "/posts/123" or full URL)
 * @param siteUrl - Base site URL
 * @returns Full canonical URL
 */
export function buildCanonicalUrl(path: string, siteUrl: string): string {
  // If path is already a full URL, return it
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  // Remove trailing slash from site URL
  const baseUrl = siteUrl.endsWith('/') ? siteUrl.slice(0, -1) : siteUrl;

  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  // Encode Japanese characters in the path
  const encodedPath = encodeURI(normalizedPath);

  return `${baseUrl}${encodedPath}`;
}

/**
 * Escape special characters for HTML attributes
 *
 * Prevents XSS and ensures proper rendering of special characters
 *
 * @param str - String to escape
 * @returns Escaped string safe for HTML attributes
 */
export function escapeHtmlAttribute(str: string): string {
  if (!str) return '';

  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Generate complete meta tags data for article pages
 *
 * @param props - SEO properties
 * @param siteName - Site name for title suffix
 * @param siteUrl - Base site URL
 * @returns Complete meta tags data
 */
export function generateArticleMetaTags(
  props: SEOProps,
  siteName: string,
  siteUrl: string
): MetaTagsData {
  // Force type to article
  const articleProps: SEOProps = { ...props, type: 'article' };

  return {
    title: buildSiteTitle(props.title, siteName),
    description: props.description,
    canonicalUrl: props.canonicalUrl,
    og: generateOpenGraphData(articleProps, siteUrl),
    twitter: generateTwitterCardData(articleProps),
    noindex: props.noindex,
  };
}

/**
 * Generate complete meta tags data for website pages (home, about, etc.)
 *
 * @param props - SEO properties
 * @param siteName - Site name for title suffix
 * @param siteUrl - Base site URL
 * @returns Complete meta tags data
 */
export function generateWebsiteMetaTags(
  props: SEOProps,
  siteName: string,
  siteUrl: string
): MetaTagsData {
  // Force type to website
  const websiteProps: SEOProps = { ...props, type: 'website' };

  return {
    title: buildSiteTitle(props.title, siteName),
    description: props.description,
    canonicalUrl: props.canonicalUrl,
    og: generateOpenGraphData(websiteProps, siteUrl),
    twitter: generateTwitterCardData(websiteProps),
    noindex: props.noindex,
  };
}
