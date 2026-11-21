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

import { postListSchema, postSchema, type Post } from './postSchema';
export type { Post, PostListResponse } from './postSchema';

/**
 * 最大リトライ回数
 */
const MAX_RETRIES = 3;

/**
 * 基本リトライ遅延 (ms)
 */
const BASE_RETRY_DELAY = 100;

/**
 * 1リクエストあたりのタイムアウト (ms)
 */
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * 一時的なゲートウェイ/スロットリング障害としてリトライ対象にする HTTP ステータス
 */
const RETRYABLE_HTTP_STATUSES = new Set([429, 502, 503, 504]);

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
 * ネットワークエラーおよび一時的な HTTP エラー (429/502/503/504) は
 * 指数バックオフで最大 MAX_RETRIES 回まで試行し、その他の HTTP エラーは即座に投げる。
 */
async function fetchWithRetry<T>(
  url: string,
  options: RequestInit
): Promise<T> {
  // Build-only credentials: never use PUBLIC_* variables or include them in URLs.
  const username = process.env.BASIC_AUTH_USERNAME;
  const password = process.env.BASIC_AUTH_PASSWORD;
  let baseOptions = options;
  if (username || password) {
    if (!username || !password) {
      throw new ApiError(401, 'Incomplete build API credentials');
    }
    baseOptions = {
      ...options,
      redirect: 'error',
      headers: {
        ...options.headers,
        Authorization:
          'Basic ' + Buffer.from(username + ':' + password).toString('base64'),
      },
    };
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    let response: Response;
    try {
      const requestOptions: RequestInit = {
        ...baseOptions,
        signal: baseOptions.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      };
      response = await fetch(url, requestOptions);
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      if (attempt < MAX_RETRIES - 1) {
        const delay = BASE_RETRY_DELAY * Math.pow(2, attempt);
        await sleep(delay);
        continue;
      }
      throw new Error(`Failed to fetch posts after ${MAX_RETRIES} retries`);
    }

    if (!response.ok) {
      if (
        RETRYABLE_HTTP_STATUSES.has(response.status) &&
        attempt < MAX_RETRIES - 1
      ) {
        const delay = BASE_RETRY_DELAY * Math.pow(2, attempt);
        await sleep(delay);
        continue;
      }
      // 非リトライ対象の HTTP エラー（またはリトライ上限到達）
      throw new ApiError(
        response.status,
        `API request failed: ${response.status} ${response.statusText}`
      );
    }

    try {
      return (await response.json()) as T;
    } catch {
      if (attempt < MAX_RETRIES - 1) {
        const delay = BASE_RETRY_DELAY * Math.pow(2, attempt);
        await sleep(delay);
        continue;
      }
      throw new Error(`Failed to fetch posts after ${MAX_RETRIES} retries`);
    }
  }

  throw new Error(`Failed to fetch posts after ${MAX_RETRIES} retries`);
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
  const seenTokens = new Set<string>();

  do {
    const params = new URLSearchParams({
      publishStatus: 'published',
      limit: '100',
    });
    if (nextToken) {
      params.set('nextToken', nextToken);
    }
    const url = `${apiUrl}/posts?${params.toString()}`;

    const response = postListSchema.parse(
      await fetchWithRetry<unknown>(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })
    );

    allPosts.push(...response.items);
    nextToken = response.nextToken;
    if (nextToken) {
      if (seenTokens.has(nextToken))
        throw new Error('Repeated pagination token');
      seenTokens.add(nextToken);
    }
  } while (nextToken);

  return allPosts;
}

/**
 * 特定の記事を取得する
 */
export async function fetchPost(id: string): Promise<Post> {
  const apiUrl = getApiUrl();
  const url = `${apiUrl}/posts/${encodeURIComponent(id)}`;

  return postSchema.parse(
    await fetchWithRetry<unknown>(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
  );
}

/**
 * Friendly slug で公開記事を取得する (PR7)
 * - 公開エンドポイント (no auth)
 * - 該当記事が draft の場合は API 側で 404 を返す
 */
export async function fetchPostBySlug(slug: string): Promise<Post> {
  const apiUrl = getApiUrl();
  const url = `${apiUrl}/posts/by-slug/${encodeURIComponent(slug)}`;

  return postSchema.parse(
    await fetchWithRetry<unknown>(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
  );
}
