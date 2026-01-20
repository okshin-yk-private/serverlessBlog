/**
 * JSON-LD Utility Functions
 *
 * Task 3.2: JSON-LD構造化データ実装
 *
 * Requirements:
 * - 4.1: JSON-LD structured data with @type: "BlogPosting" schema for post pages
 * - 4.2: Include headline, datePublished, dateModified, and author properties
 * - 4.3: If the post has images, include image property
 * - 4.4: JSON-LD structured data with @type: "WebSite" schema for home page
 */

/**
 * Input data for generating BlogPosting JSON-LD
 */
export interface JsonLdPost {
  /** Post ID */
  id: string;
  /** Post title (headline) */
  title: string;
  /** Post description */
  description: string;
  /** Publication date (ISO 8601) */
  publishedAt: string;
  /** Last modification date (ISO 8601) - optional */
  updatedAt?: string;
  /** Author name */
  authorName: string;
  /** Optional image URL for og:image */
  imageUrl?: string;
}

/**
 * Person schema type
 */
export interface PersonSchema {
  '@type': 'Person';
  name: string;
}

/**
 * WebPage schema type for mainEntityOfPage
 */
export interface WebPageSchema {
  '@type': 'WebPage';
  '@id': string;
}

/**
 * BlogPosting JSON-LD schema
 * https://schema.org/BlogPosting
 */
export interface BlogPostingJsonLd {
  '@context': 'https://schema.org';
  '@type': 'BlogPosting';
  headline: string;
  description: string;
  datePublished: string;
  dateModified: string;
  author: PersonSchema;
  mainEntityOfPage: WebPageSchema;
  image?: string;
}

/**
 * WebSite JSON-LD schema
 * https://schema.org/WebSite
 */
export interface WebSiteJsonLd {
  '@context': 'https://schema.org';
  '@type': 'WebSite';
  name: string;
  url: string;
  description?: string;
  potentialAction?: unknown;
}

/**
 * Maximum headline length for BlogPosting schema
 * Google recommends keeping headlines under 110 characters
 */
const MAX_HEADLINE_LENGTH = 110;

/**
 * Truncate headline to maximum length
 *
 * @param headline - The original headline text
 * @returns Truncated headline with ellipsis if necessary
 */
function truncateHeadline(headline: string): string {
  if (headline.length <= MAX_HEADLINE_LENGTH) {
    return headline;
  }
  return headline.slice(0, MAX_HEADLINE_LENGTH - 3) + '...';
}

/**
 * Normalize site URL by removing trailing slash
 *
 * @param url - The URL to normalize
 * @returns URL without trailing slash
 */
function normalizeUrl(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

/**
 * Build post URL from post ID and site URL
 *
 * @param postId - The post ID
 * @param siteUrl - The base site URL
 * @returns Full post URL
 */
function buildPostUrl(postId: string, siteUrl: string): string {
  const baseUrl = normalizeUrl(siteUrl);
  return `${baseUrl}/posts/${postId}`;
}

/**
 * Generate BlogPosting JSON-LD schema for article pages
 *
 * @param post - Post data for JSON-LD generation
 * @param siteUrl - Base site URL
 * @returns BlogPosting JSON-LD object
 */
export function generateBlogPostingJsonLd(
  post: JsonLdPost,
  siteUrl: string
): BlogPostingJsonLd {
  const postUrl = buildPostUrl(post.id, siteUrl);
  const dateModified = post.updatedAt ?? post.publishedAt;

  const jsonLd: BlogPostingJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: truncateHeadline(post.title),
    description: post.description,
    datePublished: post.publishedAt,
    dateModified: dateModified,
    author: {
      '@type': 'Person',
      name: post.authorName,
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': postUrl,
    },
  };

  // Add image property only if available
  if (post.imageUrl) {
    jsonLd.image = post.imageUrl;
  }

  return jsonLd;
}

/**
 * Generate WebSite JSON-LD schema for home page
 *
 * @param siteName - Name of the website
 * @param siteUrl - Base site URL
 * @param description - Optional site description
 * @returns WebSite JSON-LD object
 */
export function generateWebSiteJsonLd(
  siteName: string,
  siteUrl: string,
  description?: string
): WebSiteJsonLd {
  const normalizedUrl = normalizeUrl(siteUrl);

  const jsonLd: WebSiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteName,
    url: normalizedUrl,
  };

  // Add description only if provided
  if (description) {
    jsonLd.description = description;
  }

  return jsonLd;
}
