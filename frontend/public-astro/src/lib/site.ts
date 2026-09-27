/**
 * Site-wide constants shared across layouts, SEO, and structured data.
 *
 * Issue #683: the site name literal was duplicated across Layout.astro,
 * SEO.astro, and staticPageUtils.ts. This module is the single source of
 * truth; other modules import SITE_NAME from here instead of redeclaring it.
 */

export const SITE_NAME = 'bone of my fallacy';
