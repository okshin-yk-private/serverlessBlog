/**
 * API Service
 *
 * バックエンドAPI呼び出しのためのサービス層
 */

import axios from 'axios';
import type {
  Post,
  PostListResponse,
  PostListFilters,
  CategoryListItem,
} from '../types/post';

/* c8 ignore next */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

/**
 * 公開記事一覧を取得
 */
export const fetchPosts = async (
  filters: PostListFilters = {}
): Promise<PostListResponse> => {
  const params: Record<string, string | number> = {};

  if (filters.category) {
    params.category = filters.category;
  }
  // Use 'q' parameter for search (replaces tags for search functionality)
  if (filters.q) {
    params.q = filters.q;
  } else if (filters.tags) {
    // Backward compatibility: use tags as search if q not provided
    params.q = filters.tags;
  }
  if (filters.limit) {
    params.limit = filters.limit;
  }
  if (filters.nextToken) {
    params.nextToken = filters.nextToken;
  }

  const response = await axios.get<PostListResponse>(`${API_BASE_URL}/posts`, {
    params,
  });

  return response.data;
};

/**
 * 特定の記事を取得
 */
export const fetchPost = async (id: string): Promise<Post> => {
  const response = await axios.get<Post>(`${API_BASE_URL}/posts/${id}`);

  return response.data;
};

/**
 * カテゴリー一覧を取得
 */
export const fetchCategories = async (): Promise<CategoryListItem[]> => {
  const response = await axios.get<CategoryListItem[]>(
    `${API_BASE_URL}/categories`
  );

  return response.data;
};
