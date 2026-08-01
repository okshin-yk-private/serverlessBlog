// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// Deploy builds (CodeBuild / GitHub Actions) must set SITE_URL explicitly:
// the https://example.com fallback would ship broken sitemap / canonical /
// OGP / RSS URLs to production (Issue #463). Local dev keeps the fallback.
const isCI =
  !!process.env.CODEBUILD_BUILD_ID || process.env.GITHUB_ACTIONS === 'true';

// The check must run on `astro build` only. Doing it at module scope fired on
// every config load — including `astro check`, which broke type checking in CI.
/** @type {import('astro').AstroIntegration} */
const requireSiteUrl = {
  name: 'require-site-url',
  hooks: {
    'astro:build:start': () => {
      if (isCI && !process.env.SITE_URL) {
        throw new Error(
          'SITE_URL is not set. Deploy builds must provide the canonical site URL ' +
            '(e.g. https://boneofmyfallacy.net) or every sitemap/canonical/RSS URL ' +
            'will point at https://example.com.'
        );
      }
    },
  },
};

// https://astro.build/config
export default defineConfig({
  // SSG (Static Site Generation) mode - generates static HTML files
  output: 'static',

  // Dev server configuration - bind to 0.0.0.0 for IPv4 access
  server: {
    host: '0.0.0.0',
  },

  // Site URL for sitemap and canonical URLs
  site: process.env.SITE_URL || 'https://example.com',

  // Integrations
  integrations: [
    // Fail a CI/CodeBuild build that forgot SITE_URL (Issue #463)
    requireSiteUrl,
    // Sitemap generation
    sitemap(),
  ],

  // Vite configuration
  vite: {
    plugins: [
      // Tailwind CSS 4.x via Vite plugin
      tailwindcss(),
    ],
  },

  // Build configuration
  build: {
    // Output format for assets
    format: 'directory',
  },
});
