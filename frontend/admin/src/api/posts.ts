import axios from 'axios';
import { apiClient } from './client';

export interface Post {
  id: string;
  title: string;
  contentMarkdown: string;
  contentHtml: string;
  category?: string;
  tags: string[];
  publishStatus: 'draft' | 'published';
  createdAt: string;
  updatedAt: string;
  slug?: string;
  excerpt?: string;
  coverImageUrl?: string;
  siteBuild?: SiteBuildRequest;
}

export interface SiteBuildRequest {
  targetRevision: number;
  buildId?: string;
  status: BuildStatusValue;
}

export interface CreatePostRequest {
  title: string;
  contentMarkdown: string;
  category?: string;
  tags?: string[];
  publishStatus: 'draft' | 'published';
  slug?: string;
  excerpt?: string;
  coverImageUrl?: string;
  saveMode?: 'manual' | 'autosave';
}

export interface UpdatePostRequest {
  title?: string;
  contentMarkdown?: string;
  category?: string;
  tags?: string[];
  publishStatus?: 'draft' | 'published';
  slug?: string;
  excerpt?: string;
  coverImageUrl?: string;
  saveMode?: 'manual' | 'autosave';
}

/**
 * 記事を作成
 */
export const createPost = async (data: CreatePostRequest): Promise<Post> => {
  const response = await apiClient.post('/admin/posts', data);
  return response.data;
};

/**
 * 記事を更新
 */
export const updatePost = async (
  id: string,
  data: UpdatePostRequest
): Promise<Post> => {
  const response = await apiClient.put(`/admin/posts/${id}`, data);
  return response.data;
};

/**
 * 記事を取得
 */
export const getPost = async (id: string): Promise<Post> => {
  const response = await apiClient.get(`/admin/posts/${id}`);
  return response.data;
};

/**
 * 画像アップロード用のPre-signed URLを取得
 */
export const getUploadUrl = async (
  filename: string,
  contentType: string
): Promise<{ uploadUrl: string; imageUrl: string }> => {
  const response = await apiClient.post('/admin/images/upload-url', {
    fileName: filename,
    contentType,
  });
  // バックエンドは "url" を返すが、フロントエンドは "imageUrl" を期待するためマッピング
  return {
    uploadUrl: response.data.uploadUrl,
    imageUrl: response.data.url,
  };
};

/**
 * 画像をS3にアップロード
 */
export const uploadImage = async (file: File): Promise<string> => {
  // Pre-signed URL取得
  const { uploadUrl, imageUrl } = await getUploadUrl(file.name, file.type);

  // S3に直接アップロード（Pre-signed URLのため Authorization ヘッダーを付けない素の axios を使う）
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
export const getPosts = async (
  params?: GetPostsParams
): Promise<GetPostsResponse> => {
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

  const response = await apiClient.get(
    `/admin/posts?${queryParams.toString()}`
  );

  return {
    posts: response.data.items || response.data.posts || [],
    total: response.data.count || response.data.total || 0,
    nextToken: response.data.nextToken,
  };
};

/**
 * 記事を削除
 */
export const deletePost = async (id: string): Promise<void> => {
  await apiClient.delete(`/admin/posts/${id}`);
};

/**
 * 公開サイトビルドのステータスレスポンス型
 */
export type BuildStatusValue =
  | 'idle'
  | 'queued'
  | 'in-progress'
  | 'succeeded'
  | 'failed';

export interface BuildStatusResponse {
  buildId?: string;
  status: BuildStatusValue;
  phase?: string;
  startTime?: string;
  endTime?: string;
  targetRevision?: number;
  desiredRevision?: number;
  deployedRevision?: number;
}

/**
 * 保存に対応する公開サイトビルドのステータスを取得する。
 * targetRevision 指定時は、その保存が公開サイトへ反映済みかを返す。
 */
export const fetchBuildStatus = async (
  postId: string,
  targetRevision?: number
): Promise<BuildStatusResponse> => {
  const response = await apiClient.get<BuildStatusResponse>(
    `/admin/posts/${postId}/build-status`,
    { params: targetRevision ? { targetRevision } : undefined }
  );
  return response.data;
};

/**
 * 画像URLからS3キーを抽出
 * CloudFront URL形式: https://xxxxx.cloudfront.net/images/{userId}/{filename}
 * S3キー形式: {userId}/{filename}
 *
 * CloudFrontは /images/* パスを S3 にルーティングする際に /images を削除するため、
 * フロントエンドでも /images/ プレフィックスを除去する必要がある
 */
export const extractImageKey = (imageUrl: string): string => {
  try {
    const url = new URL(imageUrl);
    // パスの先頭の"/"を除去してキーを取得
    let key = url.pathname.slice(1);
    // CloudFront URLの場合、/images/ プレフィックスを除去
    if (key.startsWith('images/')) {
      key = key.slice('images/'.length);
    }
    return key;
  } catch {
    // URLパースに失敗した場合はそのまま返す（すでにキー形式の場合）
    return imageUrl;
  }
};

/**
 * 画像を削除
 * @param imageUrl CloudFront形式の画像URL（例: https://xxxxx.cloudfront.net/user-id/image.jpg）
 */
export const deleteImage = async (imageUrl: string): Promise<void> => {
  const key = extractImageKey(imageUrl);
  const encodedKey = encodeURIComponent(key);

  await apiClient.delete(`/admin/images/${encodedKey}`);
};
