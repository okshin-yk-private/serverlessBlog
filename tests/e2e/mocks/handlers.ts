/**
 * MSW API Handlers
 *
 * PlaywrightE2Eテスト用のモックAPIハンドラー
 * バックエンドAPIをモックして、フロントエンドのE2Eテストを実行可能にする
 *
 * Requirements:
 * - R43: Playwright E2Eテスト
 * - R44: テストデータ管理
 */

import { http, HttpResponse } from 'msw';
import { mockPosts, mockPost, createMockPost } from './mockData';

// ブラウザ環境では import.meta.env を使用
const API_BASE_URL = typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL
  ? import.meta.env.VITE_API_BASE_URL
  : '/api';

/**
 * 認証トークンを検証するヘルパー関数
 */
const checkAuth = (request: Request): boolean => {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return false;
  }

  // Bearer トークンをチェック
  const token = authHeader.replace('Bearer ', '');
  return token === 'mock-access-token' || token === 'mock-new-access-token';
};

/**
 * リトライカウンター（テスト用）
 */
let retryCounters: Record<string, number> = {};

/**
 * ログイン試行回数を追跡（レート制限用）
 */
let loginAttempts: Record<string, number> = {};

export const handlers = [
  // 記事一覧取得（公開サイト）
  http.get(`${API_BASE_URL}/posts`, ({ request }) => {
    const url = new URL(request.url);
    const category = url.searchParams.get('category');
    const tags = url.searchParams.get('tags');
    const limit = Number(url.searchParams.get('limit')) || 10;
    const nextToken = url.searchParams.get('nextToken');

    // エラーシミュレーション用パラメータ
    const simulateError = url.searchParams.get('simulateError');
    const simulateRetry = url.searchParams.get('simulateRetry');

    // リトライシミュレーション
    if (simulateRetry === 'true') {
      const retryKey = 'posts-retry';
      if (!retryCounters[retryKey]) {
        retryCounters[retryKey] = 0;
      }
      retryCounters[retryKey]++;

      // 最初のリクエストは失敗
      if (retryCounters[retryKey] === 1) {
        return new HttpResponse(null, { status: 500 });
      }
      // 2回目以降は成功（カウンターをリセット）
      retryCounters[retryKey] = 0;
    }

    // 500エラーシミュレーション
    if (simulateError === '500') {
      return HttpResponse.json(
        { error: 'Internal Server Error' },
        { status: 500 }
      );
    }

    // 空レスポンスシミュレーション
    if (simulateError === 'empty') {
      return HttpResponse.json({
        items: [],
        count: 0,
        nextToken: undefined,
      });
    }

    let filteredPosts = [...mockPosts];

    // カテゴリフィルタリング
    if (category) {
      filteredPosts = filteredPosts.filter((post) => post.category === category);
    }

    // タグフィルタリング
    if (tags) {
      filteredPosts = filteredPosts.filter((post) =>
        post.tags?.some((tag) => tag.toLowerCase().includes(tags.toLowerCase()))
      );
    }

    // 公開記事のみ
    filteredPosts = filteredPosts.filter((post) => post.publishStatus === 'published');

    // ページネーション
    let startIndex = 0;
    if (nextToken === 'mock-next-token') {
      startIndex = limit; // 次のページから開始
    }

    const paginatedPosts = filteredPosts.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < filteredPosts.length;

    return HttpResponse.json({
      items: paginatedPosts,  // Backend APIは "items" キーを返す
      count: paginatedPosts.length,
      nextToken: hasMore ? 'mock-next-token' : undefined,
    });
  }),

  // 記事詳細取得（公開サイト）
  http.get(`${API_BASE_URL}/posts/:id`, ({ params }) => {
    const { id } = params;
    const post = mockPosts.find((p) => p.id === id);

    if (!post) {
      return HttpResponse.json(
        { message: 'Post not found' },
        { status: 404 }
      );
    }

    if (post.publishStatus !== 'published') {
      return HttpResponse.json(
        { message: 'Post not found' },
        { status: 404 }
      );
    }

    return HttpResponse.json(post);
  }),

  // 管理画面: ログイン
  http.post('/auth/login', async ({ request }) => {
    const body = await request.json() as { email: string; password: string };

    // レート制限チェック（5回以上の失敗で制限）
    const attemptCount = loginAttempts[body.email] || 0;
    console.log(`[MSW] ログイン試行: email=${body.email}, 現在の試行回数=${attemptCount}`);

    if (attemptCount >= 5) {
      console.log(`[MSW] レート制限発動: ${attemptCount}回の試行`);
      return HttpResponse.json(
        { message: 'ログイン試行回数が制限を超えました。しばらく待ってから再試行してください。' },
        { status: 429 }
      );
    }

    // テスト用の認証情報をチェック
    if (
      body.email === 'admin@example.com' &&
      body.password === 'testpassword'
    ) {
      // ログイン成功時は試行回数をリセット
      console.log(`[MSW] ログイン成功、試行回数をリセット`);
      loginAttempts[body.email] = 0;
      return HttpResponse.json({
        token: 'mock-jwt-token',
        user: {
          id: 'user-123',
          email: 'admin@example.com',
        },
      });
    }

    // ログイン失敗時は試行回数をインクリメント
    loginAttempts[body.email] = attemptCount + 1;
    console.log(`[MSW] ログイン失敗、試行回数を${loginAttempts[body.email]}に更新`);
    return HttpResponse.json(
      { message: 'ログインに失敗しました' },
      { status: 401 }
    );
  }),

  // 管理画面: ログアウト
  http.post(`${API_BASE_URL}/auth/logout`, () => {
    return HttpResponse.json({ message: 'Logged out successfully' });
  }),

  // 管理画面: トークン更新
  http.post(`${API_BASE_URL}/auth/refresh`, async ({ request }) => {
    const body = await request.json() as { refreshToken: string };

    if (body.refreshToken === 'mock-refresh-token') {
      return HttpResponse.json({
        accessToken: 'mock-new-access-token',
        idToken: 'mock-new-id-token',
        expiresIn: 3600,
      });
    }

    return HttpResponse.json(
      { message: 'Invalid refresh token' },
      { status: 401 }
    );
  }),

  // 管理画面: 記事一覧取得
  http.get(`${API_BASE_URL}/admin/posts`, ({ request }) => {
    // 認証チェック
    if (!checkAuth(request)) {
      return HttpResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const publishStatus = url.searchParams.get('publishStatus');
    const limit = Number(url.searchParams.get('limit')) || 10;

    let filteredPosts = [...mockPosts];

    // 公開ステータスフィルタリング
    if (publishStatus) {
      filteredPosts = filteredPosts.filter(
        (post) => post.publishStatus === publishStatus
      );
    }

    const paginatedPosts = filteredPosts.slice(0, limit);

    return HttpResponse.json({
      items: paginatedPosts,  // Backend APIは "items" キーを返す
      count: paginatedPosts.length,
      nextToken: filteredPosts.length > limit ? 'mock-next-token' : undefined,
    });
  }),

  // 管理画面: 記事作成
  http.post(`${API_BASE_URL}/admin/posts`, async ({ request }) => {
    // 認証チェック
    if (!checkAuth(request)) {
      return HttpResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json() as {
      title: string;
      contentMarkdown: string;
      category: string;
      publishStatus: 'draft' | 'published';
    };

    const newPost = createMockPost(body);
    mockPosts.unshift(newPost);

    return HttpResponse.json(newPost, { status: 201 });
  }),

  // 管理画面: 記事取得
  http.get(`${API_BASE_URL}/admin/posts/:id`, ({ request, params }) => {
    // 認証チェック
    if (!checkAuth(request)) {
      return HttpResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = params;
    const post = mockPosts.find((p) => p.id === id);

    if (!post) {
      return HttpResponse.json(
        { message: 'Post not found' },
        { status: 404 }
      );
    }

    return HttpResponse.json(post);
  }),

  // 管理画面: 記事更新
  http.put(`${API_BASE_URL}/admin/posts/:id`, async ({ request, params }) => {
    // 認証チェック
    if (!checkAuth(request)) {
      return HttpResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = params;
    const body = await request.json() as {
      title: string;
      contentMarkdown: string;
      category: string;
      publishStatus: 'draft' | 'published';
    };

    const postIndex = mockPosts.findIndex((p) => p.id === id);

    if (postIndex === -1) {
      return HttpResponse.json(
        { message: 'Post not found' },
        { status: 404 }
      );
    }

    const updatedPost = {
      ...mockPosts[postIndex],
      ...body,
      contentHtml: `<p>${body.contentMarkdown}</p>`,
      updatedAt: new Date().toISOString(),
    };

    if (
      body.publishStatus === 'published' &&
      mockPosts[postIndex].publishStatus === 'draft'
    ) {
      updatedPost.publishedAt = new Date().toISOString();
    }

    mockPosts[postIndex] = updatedPost;

    return HttpResponse.json(updatedPost);
  }),

  // 管理画面: 記事削除
  http.delete(`${API_BASE_URL}/admin/posts/:id`, ({ request, params }) => {
    // 認証チェック
    if (!checkAuth(request)) {
      return HttpResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = params;
    const postIndex = mockPosts.findIndex((p) => p.id === id);

    if (postIndex === -1) {
      return HttpResponse.json(
        { message: 'Post not found' },
        { status: 404 }
      );
    }

    mockPosts.splice(postIndex, 1);

    return new HttpResponse(null, { status: 204 });
  }),

  // 管理画面: 画像アップロードURL取得
  http.post(`${API_BASE_URL}/images/upload-url`, async ({ request }) => {
    // 認証チェック
    if (!checkAuth(request)) {
      return HttpResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json() as {
      fileName: string;
      contentType: string;
      fileSize?: number;
    };

    return HttpResponse.json({
      uploadUrl: `https://mock-s3-bucket.s3.amazonaws.com/images/${body.fileName}?mock-signed-url`,
      imageUrl: `https://mock-cdn.cloudfront.net/images/${body.fileName}`,
      expiresIn: 900,
    });
  }),

  // 記事作成（認証必須）- `/api/posts` POST
  http.post(`${API_BASE_URL}/posts`, async ({ request }) => {
    // 認証チェック
    if (!checkAuth(request)) {
      return HttpResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json() as {
      title: string;
      content: string;
    };

    const newPost = createMockPost({
      title: body.title,
      contentMarkdown: body.content,
    });
    mockPosts.unshift(newPost);

    return HttpResponse.json(newPost, { status: 201 });
  }),

  // 記事更新（認証必須）- `/api/posts/:id` PUT
  http.put(`${API_BASE_URL}/posts/:id`, async ({ request, params }) => {
    // 認証チェック
    if (!checkAuth(request)) {
      return HttpResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = params;
    const postIndex = mockPosts.findIndex((p) => p.id === id);

    if (postIndex === -1) {
      return HttpResponse.json(
        { message: 'Post not found' },
        { status: 404 }
      );
    }

    const body = await request.json() as {
      title: string;
      content: string;
    };

    const updatedPost = {
      ...mockPosts[postIndex],
      title: body.title,
      contentMarkdown: body.content,
      updatedAt: new Date().toISOString(),
    };

    mockPosts[postIndex] = updatedPost;

    return HttpResponse.json(updatedPost);
  }),

  // 記事削除（認証必須）- `/api/posts/:id` DELETE
  http.delete(`${API_BASE_URL}/posts/:id`, ({ request, params }) => {
    // 認証チェック
    if (!checkAuth(request)) {
      return HttpResponse.json(
        { message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id } = params;
    const postIndex = mockPosts.findIndex((p) => p.id === id);

    if (postIndex === -1) {
      return HttpResponse.json(
        { message: 'Post not found' },
        { status: 404 }
      );
    }

    mockPosts.splice(postIndex, 1);

    return new HttpResponse(null, { status: 204 });
  }),
];
