import { useEffect } from 'react';

export interface SEOHeadProps {
  title: string;
  description: string;
  keywords?: string[];
  url?: string;
  imageUrl?: string;
  type?: 'article' | 'website';
  author?: string;
  publishedDate?: string;
}

export const SEOHead: React.FC<SEOHeadProps> = ({
  title,
  description,
  keywords,
  url,
  imageUrl,
  type = 'article',
  author,
  publishedDate,
}) => {
  useEffect(() => {
    // Set document title
    document.title = title;

    // Create or update meta tags
    const updateMetaTag = (name: string, content: string, attribute: 'name' | 'property' = 'name') => {
      const selector = `meta[${attribute}="${name}"]`;
      let metaTag = document.querySelector(selector);

      if (!metaTag) {
        metaTag = document.createElement('meta');
        metaTag.setAttribute(attribute, name);
        document.head.appendChild(metaTag);
      }

      metaTag.setAttribute('content', content);
    };

    // Basic meta tags
    updateMetaTag('description', description);

    if (keywords !== undefined) {
      updateMetaTag('keywords', keywords.join(', '));
    }

    // Open Graph Protocol (OGP) tags
    updateMetaTag('og:title', title, 'property');
    updateMetaTag('og:description', description, 'property');
    updateMetaTag('og:type', type, 'property');

    if (url) {
      updateMetaTag('og:url', url, 'property');
    }

    if (imageUrl) {
      updateMetaTag('og:image', imageUrl, 'property');
    }

    // Twitter Card tags
    updateMetaTag('twitter:card', 'summary_large_image');
    updateMetaTag('twitter:title', title);
    updateMetaTag('twitter:description', description);

    if (imageUrl) {
      updateMetaTag('twitter:image', imageUrl);
    }

    // Canonical URL
    if (url) {
      let canonicalLink = document.querySelector('link[rel="canonical"]');

      if (!canonicalLink) {
        canonicalLink = document.createElement('link');
        canonicalLink.setAttribute('rel', 'canonical');
        document.head.appendChild(canonicalLink);
      }

      canonicalLink.setAttribute('href', url);
    }

    // JSON-LD structured data
    const structuredData: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: title,
      description: description,
    };

    if (imageUrl) {
      structuredData.image = imageUrl;
    }

    if (author) {
      structuredData.author = {
        '@type': 'Person',
        name: author,
      };
    }

    if (publishedDate) {
      structuredData.datePublished = publishedDate;
    }

    let jsonLdScript = document.querySelector('script[type="application/ld+json"]');

    if (!jsonLdScript) {
      jsonLdScript = document.createElement('script');
      jsonLdScript.setAttribute('type', 'application/ld+json');
      document.head.appendChild(jsonLdScript);
    }

    jsonLdScript.textContent = JSON.stringify(structuredData);

    // Cleanup function to remove added elements when component unmounts
    return () => {
      // Note: In a real application, you might want to keep some meta tags
      // This cleanup is mainly for testing purposes
    };
  }, [title, description, keywords, url, imageUrl, type, author, publishedDate]);

  return null;
};
