import axios from 'axios';
import { getAuthToken } from '../utils/auth';

const API_URL = import.meta.env.VITE_API_URL ?? '/api';

/**
 * マインドマップノード
 */
export interface MindmapNode {
  id: string;
  text: string;
  color?: string;
  linkUrl?: string;
  note?: string;
  children: MindmapNode[];
}

/**
 * マインドマップエンティティ
 */
export interface Mindmap {
  id: string;
  title: string;
  nodes: MindmapNode;
  publishStatus: 'draft' | 'published';
  authorId: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

/**
 * マインドマップ作成リクエスト
 */
export interface CreateMindmapRequest {
  title: string;
  nodes: MindmapNode;
  publishStatus: 'draft' | 'published';
}

/**
 * マインドマップ更新リクエスト
 */
export interface UpdateMindmapRequest {
  title?: string;
  nodes?: MindmapNode;
  publishStatus?: 'draft' | 'published';
}

/**
 * マインドマップ一覧レスポンス
 */
export interface ListMindmapsResponse {
  items: Mindmap[];
  count: number;
  nextToken?: string;
}

/**
 * マインドマップ一覧取得パラメータ
 */
export interface ListMindmapsParams {
  limit?: number;
  nextToken?: string;
}

/**
 * APIエラー
 */
export interface APIError {
  message: string;
  statusCode: number;
}

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

const handleError = (error: unknown): never => {
  if (isAxiosErrorLike(error) && error.response) {
    const apiError: APIError = {
      message: error.response.data?.message || 'エラーが発生しました',
      statusCode: error.response.status,
    };
    throw apiError;
  }
  const apiError: APIError = {
    message: 'ネットワークエラーが発生しました。接続を確認してください。',
    statusCode: 0,
  };
  throw apiError;
};

/**
 * マインドマップを作成
 * POST /admin/mindmaps（認証必須）
 */
export const createMindmap = async (
  data: CreateMindmapRequest
): Promise<Mindmap> => {
  try {
    const token = getAuthToken();
    const response = await axios.post<Mindmap>(
      `${API_URL}/admin/mindmaps`,
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
 * マインドマップを取得
 * GET /admin/mindmaps/{id}（認証必須）
 */
export const getMindmap = async (id: string): Promise<Mindmap> => {
  try {
    const token = getAuthToken();
    const response = await axios.get<Mindmap>(
      `${API_URL}/admin/mindmaps/${id}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    return response.data;
  } catch (error) {
    handleError(error);
  }
};

/**
 * マインドマップ一覧を取得
 * GET /admin/mindmaps（認証必須）
 */
export const listMindmaps = async (
  params?: ListMindmapsParams
): Promise<ListMindmapsResponse> => {
  try {
    const token = getAuthToken();
    const queryParams = new URLSearchParams();

    if (params?.limit !== undefined) {
      queryParams.append('limit', params.limit.toString());
    }
    if (params?.nextToken) {
      queryParams.append('nextToken', params.nextToken);
    }

    const queryString = queryParams.toString();
    const url = queryString
      ? `${API_URL}/admin/mindmaps?${queryString}`
      : `${API_URL}/admin/mindmaps`;

    const response = await axios.get<ListMindmapsResponse>(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    return response.data;
  } catch (error) {
    handleError(error);
  }
};

/**
 * マインドマップを更新
 * PUT /admin/mindmaps/{id}（認証必須）
 */
export const updateMindmap = async (
  id: string,
  data: UpdateMindmapRequest
): Promise<Mindmap> => {
  try {
    const token = getAuthToken();
    const response = await axios.put<Mindmap>(
      `${API_URL}/admin/mindmaps/${id}`,
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
 * マインドマップを削除
 * DELETE /admin/mindmaps/{id}（認証必須）
 */
export const deleteMindmap = async (id: string): Promise<void> => {
  try {
    const token = getAuthToken();
    await axios.delete(`${API_URL}/admin/mindmaps/${id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  } catch (error) {
    handleError(error);
  }
};
