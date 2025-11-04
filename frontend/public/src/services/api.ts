/**
 * API Service
 *
 * バックエンドAPI呼び出しのためのサービス層
 */

import axios from 'axios';
import type { Post, PostListResponse, PostListFilters } from '../types/post';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

/**
 * 公開記事一覧を取得
 */
export const fetchPosts = async (
  filters: PostListFilters = {},
): Promise<PostListResponse> => {
  const params: Record<string, string | number> = {};

  if (filters.category) {
    params.category = filters.category;
  }
  if (filters.tags) {
    params.tags = filters.tags;
  }
  if (filters.limit) {
    params.limit = filters.limit;
  }
  if (filters.nextToken) {
    params.nextToken = filters.nextToken;
  }
  // テスト用のエラーシミュレーションパラメータ
  if (filters.simulateError) {
    params.simulateError = filters.simulateError;
  }
  if (filters.simulateRetry) {
    params.simulateRetry = filters.simulateRetry;
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
