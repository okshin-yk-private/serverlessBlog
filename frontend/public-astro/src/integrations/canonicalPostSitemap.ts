import type { AstroIntegration } from 'astro';
import sitemap from '@astrojs/sitemap';
import { readFile } from 'node:fs/promises';
import { parse } from 'parse5';

/** Read canonical links from the generated head, not article content or URL shape. */
function canonicalUrl(html: string): string | undefined {
  const document = parse(html);
  const root = document.childNodes.find((node) => node.nodeName === 'html');
  if (!root || !('childNodes' in root)) return;
  const head = root.childNodes.find((node) => node.nodeName === 'head');
  if (!head || !('childNodes' in head)) return;
  for (const node of head.childNodes) {
    if (!('tagName' in node) || node.tagName !== 'link') continue;
    const rel = node.attrs.find((attr) => attr.name === 'rel')?.value;
    if (rel?.split(/\s+/).includes('canonical')) {
      return node.attrs.find((attr) => attr.name === 'href')?.value;
    }
  }
}

/** Only exclude aliases whose canonical target was generated in the same build. */
export async function findPostAliases(
  dir: URL,
  pages: { pathname: string }[],
  site: URL
): Promise<Set<string>> {
  const posts = pages
    .map(({ pathname }) => pathname.replace(/^\//, '').replace(/\/$/, ''))
    .filter((pathname) => /^posts\/[^/]+$/.test(pathname));
  const urls = new Set(posts.map((path) => new URL(`${path}/`, site).href));
  const aliases = new Set<string>();
  for (const path of posts) {
    const html = await readFile(new URL(`${path}/index.html`, dir), 'utf8');
    const canonical = canonicalUrl(html);
    const url = new URL(`${path}/`, site).href;
    if (canonical && canonical !== url && urls.has(canonical)) {
      aliases.add(url);
    }
  }
  return aliases;
}

/** Keep all compatibility pages, but advertise only canonical post URLs. */
export function canonicalPostSitemap(site: URL): AstroIntegration[] {
  let aliases = new Set<string>();
  return [
    {
      name: 'canonical-post-sitemap',
      hooks: {
        // Runs before @astrojs/sitemap's build:done hook, using this build's
        // actual HTML and content snapshot. No second API fetch or UUID heuristic.
        'astro:build:done': async ({ dir, pages }) => {
          aliases = await findPostAliases(dir, pages, site);
        },
      },
    },
    sitemap({ filter: (url) => !aliases.has(url) }),
  ];
}
