import { createRequire } from 'node:module';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { afterEach, describe, expect, it } from 'vitest';
import SearchBar from './SearchBar.astro';
import type { SearchablePost } from '../lib/searchUtils';

// Keep Astro rendering in the Node/SSR environment and parse its output with
// the existing jsdom dependency, whose optional TypeScript types are not installed.
const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
  JSDOM: new (html: string) => {
    window: { document: Document; close(): void };
  };
};

describe('SearchBar embedded search data', () => {
  let dom: InstanceType<typeof JSDOM> | undefined;
  afterEach(() => dom?.window.close());

  const payloads = [
    '</script><script id=injected>globalThis.injected = true</script>',
    '</ScRiPt><img id=injected src=x onerror=globalThis.injected=true>',
    '<!--<script>日本語 & "quotes" \\ backslash',
  ];

  for (const field of ['title', 'category', 'tags'] as const) {
    it.each(payloads)(
      `keeps hostile ${field} inside the JSON data: %s`,
      async (payload) => {
        const post: SearchablePost = {
          id: 'post-1',
          title: '記事タイトル',
          category: '技術',
          tags: ['通常のタグ'],
          publicationDay: '2026-10-24',
          [field]: field === 'tags' ? [payload] : payload,
        };
        // A second category also exercises Astro escaping in category buttons.
        const posts = [post, { ...post, id: 'post-2', category: '別カテゴリ' }];
        const container = await AstroContainer.create();
        const html = await container.renderToString(SearchBar, {
          props: { posts, asOfDay: '2026-10-24' },
        });
        // Parse actual component output using HTML script/raw-text parsing rules.
        dom = new JSDOM(html);
        const { document } = dom.window;
        expect(document.getElementById('injected')).toBeNull();
        const data = document.querySelector('#search-data');
        expect(data).not.toBeNull();
        expect(JSON.parse(data!.textContent!)).toEqual(posts);
        expect(
          document.querySelector('#publication-date')?.getAttribute('max')
        ).toBe('2026-10-24');
        expect(document.querySelectorAll('[data-category]')).toHaveLength(3);
        expect(
          document.querySelectorAll('script:not([src]):not(#search-data)')
        ).toHaveLength(0);
      }
    );
  }

  it('renders an empty search index as valid JSON', async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(SearchBar, {
      props: { posts: [] },
    });
    dom = new JSDOM(html);
    const { document } = dom.window;
    expect(
      JSON.parse(document.querySelector('#search-data')!.textContent!)
    ).toEqual([]);
  });
});
