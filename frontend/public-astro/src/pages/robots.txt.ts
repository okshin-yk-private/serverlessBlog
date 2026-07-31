/**
 * robots.txt エンドポイント
 *
 * ビルド時に呼び出され、dist/robots.txt として生成される。
 * Sitemap の URL は astro.config.mjs の site (= SITE_URL) から動的に組み立てる。
 * sitemap-index.xml は @astrojs/sitemap インテグレーションの出力名。
 */
import type { APIContext } from 'astro';

export function GET(context: APIContext) {
  const siteUrl = (context.site?.toString() ?? 'https://example.com').replace(
    /\/$/,
    ''
  );

  const body = [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${siteUrl}/sitemap-index.xml`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
