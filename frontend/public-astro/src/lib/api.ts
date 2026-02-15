/**
 * API呼び出しモジュール
 *
 * ビルド時にREST APIから公開記事を取得する
 *
 * Requirements:
 * - 2.1: REST APIから公開記事を取得
 * - 2.5: API_URL環境変数からAPIエンドポイントを取得
 * - 2.6: API不可時は明確なエラーメッセージでビルドを失敗
 * - 2.8: カーソルベースのページネーションで全記事を再帰的に取得
 * - 2.9: API失敗時に指数バックオフで最大3回リトライ
 * - 2.10: 1000件までの記事を処理
 */

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

/**
 * 記事一覧レスポンスの型定義
 */
export interface PostListResponse {
  items: Post[];
  count: number;
  nextToken?: string;
}

/**
 * 公開マインドマップの型定義
 */
export interface PublicMindmap {
  id: string;
  title: string;
  nodes: string;
  publishStatus: 'draft' | 'published';
  authorId: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

/**
 * マインドマップ一覧レスポンスの型定義
 */
export interface MindmapListResponse {
  items: PublicMindmap[];
  count: number;
  nextToken?: string;
}

/**
 * 最大リトライ回数
 */
const MAX_RETRIES = 3;

/**
 * 基本リトライ遅延 (ms)
 */
const BASE_RETRY_DELAY = 100;

/**
 * API_URLを取得する
 */
function getApiUrl(): string {
  const apiUrl = import.meta.env.API_URL || process.env.API_URL;
  if (!apiUrl) {
    throw new Error('API_URL environment variable is not set');
  }
  return apiUrl;
}

/**
 * 指数バックオフでの待機
 */
async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * APIエラークラス（リトライ不要なエラー）
 */
class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * リトライ付きfetch
 *
 * ネットワークエラーは指数バックオフでリトライ
 * HTTPエラー(4xx/5xx)はリトライせず即座にエラーを投げる
 */
async function fetchWithRetry<T>(
  url: string,
  options: RequestInit,
  retryCount = 0
): Promise<T> {
  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      // HTTPエラーはリトライしない
      throw new ApiError(
        response.status,
        `API request failed: ${response.status} ${response.statusText}`
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    // ApiError はリトライしない（HTTP 4xx/5xx エラー）
    if (error instanceof ApiError) {
      throw error;
    }

    // ネットワークエラーなどはリトライする
    if (retryCount < MAX_RETRIES - 1) {
      // 指数バックオフ: 100ms, 200ms, 400ms...
      const delay = BASE_RETRY_DELAY * Math.pow(2, retryCount);
      await sleep(delay);
      return fetchWithRetry<T>(url, options, retryCount + 1);
    }

    // 最大リトライ回数に達した場合
    throw new Error(`Failed to fetch posts after ${MAX_RETRIES} retries`);
  }
}

/**
 * 全ての公開記事を取得する
 *
 * カーソルベースのページネーションを使用して全記事を再帰的に取得する
 */
export async function fetchAllPosts(): Promise<Post[]> {
  const apiUrl = getApiUrl();
  const allPosts: Post[] = [];
  let nextToken: string | undefined;

  do {
    const url = nextToken
      ? `${apiUrl}/posts?publishStatus=published&nextToken=${nextToken}`
      : `${apiUrl}/posts?publishStatus=published`;

    const response = await fetchWithRetry<PostListResponse>(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    allPosts.push(...response.items);
    nextToken = response.nextToken;
  } while (nextToken);

  return allPosts;
}

/**
 * 特定の記事を取得する
 */
export async function fetchPost(id: string): Promise<Post> {
  const apiUrl = getApiUrl();
  const url = `${apiUrl}/posts/${id}`;

  return fetchWithRetry<Post>(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

/**
 * 全ての公開マインドマップを取得する
 *
 * カーソルベースのページネーションを使用して全マインドマップを再帰的に取得する
 * Requirements: 3.1, 3.2
 */
export async function fetchAllPublicMindmaps(): Promise<PublicMindmap[]> {
  const apiUrl = getApiUrl();
  const allMindmaps: PublicMindmap[] = [];
  let nextToken: string | undefined;

  do {
    const url = nextToken
      ? `${apiUrl}/public/mindmaps?nextToken=${nextToken}`
      : `${apiUrl}/public/mindmaps`;

    const response = await fetchWithRetry<MindmapListResponse>(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    allMindmaps.push(...response.items);
    nextToken = response.nextToken;
  } while (nextToken);

  return allMindmaps;
}

/**
 * 特定の公開マインドマップを取得する
 *
 * Requirements: 3.2
 */
export async function fetchPublicMindmap(id: string): Promise<PublicMindmap> {
  const apiUrl = getApiUrl();
  const url = `${apiUrl}/public/mindmaps/${id}`;

  return fetchWithRetry<PublicMindmap>(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
