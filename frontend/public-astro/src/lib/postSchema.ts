import { z } from 'astro/zod';

// Keep date strings intact: publicationCalendar handles missing, invalid and
// future publication dates without inventing a publication timestamp.
export const postSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  contentHtml: z.string(),
  category: z.string(),
  tags: z.array(z.string()),
  publishStatus: z.enum(['draft', 'published']),
  // Issue #683: the public API no longer returns authorId (it was the raw
  // Cognito sub). Kept optional, not removed outright, so any response that
  // still includes it (e.g. an authenticated caller reusing this schema)
  // continues to validate.
  authorId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  publishedAt: z.string().optional(),
  imageUrls: z.array(z.string()).optional(),
  slug: z.string().optional(),
  excerpt: z.string().optional(),
  coverImageUrl: z.string().optional(),
});

export type Post = z.infer<typeof postSchema>;

export const postListSchema = z.object({
  items: z.array(postSchema),
  // The public list endpoint omits count; only the admin endpoint supplies it.
  count: z.number().int().nonnegative().optional(),
  nextToken: z.string().optional(),
});
export type PostListResponse = z.infer<typeof postListSchema>;
