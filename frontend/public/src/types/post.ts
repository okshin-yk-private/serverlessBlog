/**
 * 記事の型定義
 */

export interface Post {
  id: string;
  title: string;
  contentHtml: string;
  category: string;
  tags: string[];
  publishStatus: 'draft' | 'published';
  authorId: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  imageUrls?: string[];
}

export interface PostListResponse {
  items: Post[];
  count: number;
  nextToken?: string;
}

export interface PostListFilters {
  category?: string;
  tags?: string;
  limit?: number;
  nextToken?: string;
  // テスト用のエラーシミュレーションパラメータ
  simulateError?: string;
  simulateRetry?: string;
}
