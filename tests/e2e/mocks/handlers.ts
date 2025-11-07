/**
 * MSW API Handlers - Happy Path Only (Simplified)
 *
 * PlaywrightUI E2Eテスト用のモックAPIハンドラー（ハッピーパスのみ）
 * バックエンドAPIをモックして、フロントエンドのUI E2Eテストを実行可能にする
 *
 * 変更履歴 (2025-11-07):
 * - 複雑なエラーシミュレーション機能を削除（simulateError, simulateRetryパラメータ削除）
 * - リトライカウンターとレート制限ロジックを削除
 * - ハッピーパスのみに簡略化
 * - エラーハンドリング詳細はユニットテスト・統合テストでカバー
 *
 * Requirements:
 * - R43: UI E2Eテスト（最小限）
 * - R44: テストデータ管理
 */

import { http, HttpResponse } from 'msw';
import { mockPosts, mockPost, createMockPost } from './mockData';

// ブラウザ環境では import.meta.env を使用
// nullish coalescing演算子(??)を使用して、undefinedとnullのみデフォルト値を使用
// 空文字列('')は有効な値として扱う
const API_BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL !== undefined)
  ? import.meta.env.VITE_API_BASE_URL
  : '/api';

/**
 * モックJWTトークンを生成（有効期限付き）
 */
const createMockJWT = (): string => {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const exp = Math.floor(Date.now() / 1000) + 3600; // 1時間後に有効期限
  const payload = btoa(JSON.stringify({
    sub: 'user-123',
    email: 'admin@example.com',
    exp
  }));
  const signature = 'mock-signature';
  return `${header}.${payload}.${signature}`;
};

/**
 * 認証トークンを検証するヘルパー関数
 */
const checkAuth = (request: Request): boolean => {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return false;
  }

  // Bearer トークンをチェック（モックJWT形式も受け入れる）
  const token = authHeader.replace('Bearer ', '');
  // JWTトークンの形式をチェック（header.payload.signature）
  return token.split('.').length === 3;
};

export const handlers = [
  // 記事一覧取得（公開サイト）- Happy Path Only
  http.get(`${API_BASE_URL}/posts`, ({ request }) => {
    const url = new URL(request.url);
    const category = url.searchParams.get('category');
    const tags = url.searchParams.get('tags');
    const limit = Number(url.searchParams.get('limit')) || 10;
    const nextToken = url.searchParams.get('nextToken');

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

  // 管理画面: ログイン - Happy Path Only
  http.post('/auth/login', async ({ request }) => {
    const body = await request.json() as { email: string; password: string };

    // テスト用の認証情報をチェック（レート制限削除）
    if (
      body.email === 'admin@example.com' &&
      body.password === 'testpassword'
    ) {
      return HttpResponse.json({
        token: createMockJWT(), // 有効なJWT形式のトークンを返す
        user: {
          id: 'user-123',
          email: 'admin@example.com',
        },
      });
    }

    // ログイン失敗（シンプルなエラーレスポンス）
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
        accessToken: createMockJWT(), // 有効なJWT形式のトークンを返す
        idToken: createMockJWT(), // 有効なJWT形式のトークンを返す
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
