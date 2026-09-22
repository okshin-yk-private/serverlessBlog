import type { Loader } from 'astro/loaders';
import { fetchAllPosts } from '../lib/api';

/** A complete public API snapshot, shared by all statically generated routes. */
export function publishedPostsLoader(): Loader {
  return {
    name: 'published-posts',
    async load({ store, parseData }) {
      // astro check/sync only generate types. Build/dev must fetch even if this
      // define is absent: a missing API_URL must never publish an empty site.
      if (import.meta.env.BLOG_CONTENT_PHASE === 'sync') {
        store.clear();
        return;
      }

      const posts = await fetchAllPosts();
      const seen = new Set<string>();
      const entries = [];
      for (const post of posts) {
        if (seen.has(post.id)) throw new Error(`Duplicate post ID: ${post.id}`);
        seen.add(post.id);
        const data = await parseData({ id: post.id, data: post });
        if (post.publishStatus === 'published') {
          entries.push({ id: post.id, data });
        }
      }

      // Replace only after every page and entry passes validation. Clearing also
      // removes deleted/unpublished posts from Astro's persisted content store.
      // Fetch/parse failures propagate and stop the build; never use stale data.
      store.clear();
      for (const entry of entries) store.set(entry);
    },
  };
}
