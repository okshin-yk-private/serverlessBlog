import axios from 'axios';
import { getAuthToken } from '../utils/auth';

// E2Eテスト時は空文字列を使用して相対パスにする（MSWは同一オリジンのリクエストをインターセプトできる）
const API_URL = import.meta.env.VITE_API_URL ?? '/api';

/**
 * カテゴリエンティティ
 */
export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * カテゴリ作成リクエスト
 */
export interface CreateCategoryRequest {
  name: string;
  slug?: string;
  description?: string;
  sortOrder?: number;
}

/**
 * カテゴリ更新リクエスト
 */
export interface UpdateCategoryRequest {
  name?: string;
  slug?: string;
  description?: string;
  sortOrder?: number;
}

/**
 * sortOrder一括更新リクエスト
 */
export interface UpdateSortOrderRequest {
  orders: Array<{ id: string; sortOrder: number }>;
}

/**
 * APIエラー
 */
export interface APIError {
  message: string;
  statusCode: number;
}

/**
 * Axios互換のエラーかどうかをチェック
 */
interface AxiosErrorLike {
  response?: {
    status: number;
    data?: {
      message?: string;
    };
  };
}

const isAxiosErrorLike = (error: unknown): error is AxiosErrorLike => {
  return (
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as AxiosErrorLike).response === 'object'
  );
};

/**
 * エラーレスポンスをAPIErrorに変換
 */
const handleError = (error: unknown): never => {
  if (isAxiosErrorLike(error) && error.response) {
    const apiError: APIError = {
      message: error.response.data?.message || 'エラーが発生しました',
      statusCode: error.response.status,
    };
    throw apiError;
  }
  // ネットワークエラー
  const apiError: APIError = {
    message: 'ネットワークエラーが発生しました。接続を確認してください。',
    statusCode: 0,
  };
  throw apiError;
};

/**
 * カテゴリ一覧を取得
 * GET /categories（認証不要）
 */
export const fetchCategories = async (): Promise<Category[]> => {
  try {
    const response = await axios.get<Category[]>(`${API_URL}/categories`);
    return response.data;
  } catch (error) {
    handleError(error);
  }
};

/**
 * カテゴリを作成
 * POST /admin/categories（認証必須）
 */
export const createCategory = async (
  data: CreateCategoryRequest
): Promise<Category> => {
  try {
    const token = getAuthToken();
    const response = await axios.post<Category>(
      `${API_URL}/admin/categories`,
      data,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data;
  } catch (error) {
    handleError(error);
  }
};

/**
 * カテゴリを更新
 * PUT /admin/categories/{id}（認証必須）
 */
export const updateCategory = async (
  id: string,
  data: UpdateCategoryRequest
): Promise<Category> => {
  try {
    const token = getAuthToken();
    const response = await axios.put<Category>(
      `${API_URL}/admin/categories/${id}`,
      data,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data;
  } catch (error) {
    handleError(error);
  }
};

/**
 * カテゴリのsortOrderを一括更新
 * PATCH /admin/categories/sort（認証必須）
 */
export const updateCategorySortOrders = async (
  data: UpdateSortOrderRequest
): Promise<Category[]> => {
  try {
    const token = getAuthToken();
    const response = await axios.patch<Category[]>(
      `${API_URL}/admin/categories/sort`,
      data,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );
    return response.data;
  } catch (error) {
    handleError(error);
  }
};

/**
 * カテゴリを削除
 * DELETE /admin/categories/{id}（認証必須）
 */
export const deleteCategory = async (id: string): Promise<void> => {
  try {
    const token = getAuthToken();
    await axios.delete(`${API_URL}/admin/categories/${id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (error) {
    handleError(error);
  }
};
