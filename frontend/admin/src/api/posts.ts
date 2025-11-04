import axios from 'axios';
import { getAuthToken } from '../utils/auth';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export interface Post {
  id: string;
  title: string;
  contentMarkdown: string;
  contentHtml: string;
  category: string;
  publishStatus: 'draft' | 'published';
  createdAt: string;
  updatedAt: string;
}

export interface CreatePostRequest {
  title: string;
  contentMarkdown: string;
  category: string;
  publishStatus: 'draft' | 'published';
}

export interface UpdatePostRequest {
  title: string;
  contentMarkdown: string;
  category: string;
  publishStatus: 'draft' | 'published';
}

/**
 * 記事を作成
 */
export const createPost = async (data: CreatePostRequest): Promise<Post> => {
  const token = getAuthToken();
  const response = await axios.post(`${API_URL}/admin/posts`, data, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  return response.data;
};

/**
 * 記事を更新
 */
export const updatePost = async (id: string, data: UpdatePostRequest): Promise<Post> => {
  const token = getAuthToken();
  const response = await axios.put(`${API_URL}/admin/posts/${id}`, data, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  return response.data;
};

/**
 * 記事を取得
 */
export const getPost = async (id: string): Promise<Post> => {
  const token = getAuthToken();
  const response = await axios.get(`${API_URL}/admin/posts/${id}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  return response.data;
};

/**
 * 画像アップロード用のPre-signed URLを取得
 */
export const getUploadUrl = async (filename: string, contentType: string): Promise<{ uploadUrl: string; imageUrl: string }> => {
  const token = getAuthToken();
  const response = await axios.post(
    `${API_URL}/admin/upload-url`,
    { filename, contentType },
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );
  return response.data;
};

/**
 * 画像をS3にアップロード
 */
export const uploadImage = async (file: File): Promise<string> => {
  // Pre-signed URL取得
  const { uploadUrl, imageUrl } = await getUploadUrl(file.name, file.type);

  // S3に直接アップロード
  await axios.put(uploadUrl, file, {
    headers: {
      'Content-Type': file.type,
    },
  });

  return imageUrl;
};

export interface GetPostsParams {
  publishStatus?: 'draft' | 'published';
  limit?: number;
  nextToken?: string;
}

export interface GetPostsResponse {
  posts: Post[];
  total: number;
  nextToken?: string;
}

/**
 * 記事一覧を取得
 */
export const getPosts = async (params?: GetPostsParams): Promise<GetPostsResponse> => {
  const token = getAuthToken();
  const queryParams = new URLSearchParams();

  if (params?.publishStatus) {
    queryParams.append('publishStatus', params.publishStatus);
  }
  if (params?.limit) {
    queryParams.append('limit', params.limit.toString());
  }
  if (params?.nextToken) {
    queryParams.append('nextToken', params.nextToken);
  }

  const response = await axios.get(`${API_URL}/admin/posts?${queryParams.toString()}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  return {
    posts: response.data.posts || [],
    total: response.data.total || 0,
    nextToken: response.data.nextToken,
  };
};

/**
 * 記事を削除
 */
export const deletePost = async (id: string): Promise<void> => {
  const token = getAuthToken();
  await axios.delete(`${API_URL}/admin/posts/${id}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
};
