// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

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
