/**
 * 共通型定義
 */

/**
 * ブログ記事のデータ型
 */
export interface BlogPost {
  id: string;
  title: string;
  contentMarkdown: string;
  contentHtml: string;
  category: string;
  tags: string[];
  publishStatus: 'draft' | 'published';
  authorId: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  imageUrls: string[];
}

/**
 * 記事作成リクエスト
 */
export interface CreatePostRequest {
  title: string;
  contentMarkdown: string;
  category: string;
  tags?: string[];
  publishStatus?: 'draft' | 'published';
  imageUrls?: string[];
}

/**
 * 記事更新リクエスト
 */
export interface UpdatePostRequest {
  title?: string;
  contentMarkdown?: string;
  category?: string;
  tags?: string[];
  publishStatus?: 'draft' | 'published';
  imageUrls?: string[];
}

/**
 * APIレスポンス
 */
export interface ApiResponse<_T = unknown> {
  statusCode: number;
  body: string;
  headers?: Record<string, string>;
}

/**
 * エラーレスポンス
 */
export interface ErrorResponse {
  message: string;
  error?: string;
}
