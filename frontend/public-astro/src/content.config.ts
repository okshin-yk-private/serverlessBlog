import { defineCollection } from 'astro:content';
import { publishedPostsLoader } from './loaders/posts';
import { postSchema } from './lib/postSchema';

export const collections = {
  posts: defineCollection({
    loader: publishedPostsLoader(),
    schema: postSchema,
  }),
};
