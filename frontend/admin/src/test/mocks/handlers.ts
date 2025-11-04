import { http, HttpResponse } from 'msw';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/**
 * Authorizationヘッダーをチェックするヘルパー関数
 * @param request リクエストオブジェクト
 * @returns 認証済みの場合true、それ以外はfalse
 */
function isAuthenticated(request: Request): boolean {
  const authHeader = request.headers.get('Authorization');

  // Authorizationヘッダーがない場合は未認証
  if (!authHeader) {
    return false;
  }

  // Bearerトークンの形式チェック
  if (!authHeader.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.substring(7); // "Bearer "の後のトークン

  // モックトークンまたは有効なトークン形式かチェック
  // テスト環境では 'mock-jwt-token' を有効なトークンとして扱う
  return token === 'mock-jwt-token' || token.length > 10;
}

/**
 * 未認証エラーレスポンスを返すヘルパー関数
 */
function unauthorizedResponse() {
  return new HttpResponse(null, {
    status: 401,
    statusText: 'Unauthorized',
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

export const handlers = [
  // 認証モック
  http.post(`${API_URL}/auth/login`, () => {
    return HttpResponse.json({
      token: 'mock-jwt-token',
      user: {
        id: 'user-123',
        email: 'test@example.com',
      },
    });
  }),

  // 記事一覧モック
  http.get(`${API_URL}/posts`, () => {
    return HttpResponse.json({
      items: [
        {
          id: 'post-1',
          title: 'テスト記事1',
          category: 'tech',
          publishStatus: 'published',
          createdAt: '2025-01-01T00:00:00Z',
        },
      ],
      count: 1,
    });
  }),

  // 管理画面 - 記事一覧取得（認証必要）
  http.get(`${API_URL}/admin/posts`, ({ request }) => {
    if (!isAuthenticated(request)) {
      return unauthorizedResponse();
    }

    return HttpResponse.json({
      items: [
        {
          id: 'post-1',
          title: 'テスト記事1',
          category: 'tech',
          publishStatus: 'published',
          createdAt: '2025-01-01T00:00:00Z',
        },
      ],
      count: 1,
    });
  }),

  // 記事詳細モック（認証必要）
  http.get(`${API_URL}/admin/posts/:id`, ({ params, request }) => {
    if (!isAuthenticated(request)) {
      return unauthorizedResponse();
    }

    return HttpResponse.json({
      id: params.id,
      title: 'テスト記事',
      contentMarkdown: '# テスト',
      contentHtml: '<h1>テスト</h1>',
      category: 'tech',
      publishStatus: 'draft',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    });
  }),

  // 記事作成モック（認証必要）
  http.post(`${API_URL}/admin/posts`, async ({ request }) => {
    if (!isAuthenticated(request)) {
      return unauthorizedResponse();
    }

    const body = await request.json() as any;
    return HttpResponse.json({
      id: 'new-post-id',
      title: body.title,
      contentMarkdown: body.contentMarkdown,
      contentHtml: `<p>${body.contentMarkdown}</p>`,
      category: body.category,
      publishStatus: body.publishStatus,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }, { status: 201 });
  }),

  // 記事更新モック（認証必要）
  http.put(`${API_URL}/admin/posts/:id`, async ({ params, request }) => {
    if (!isAuthenticated(request)) {
      return unauthorizedResponse();
    }

    const body = await request.json() as any;
    return HttpResponse.json({
      id: params.id,
      title: body.title,
      contentMarkdown: body.contentMarkdown,
      contentHtml: `<p>${body.contentMarkdown}</p>`,
      category: body.category,
      publishStatus: body.publishStatus,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: new Date().toISOString(),
    });
  }),

  // 記事削除モック（認証必要）
  http.delete(`${API_URL}/posts/:id`, ({ request }) => {
    if (!isAuthenticated(request)) {
      return unauthorizedResponse();
    }

    return new HttpResponse(null, { status: 204 });
  }),

  // 画像アップロードURL取得モック（認証必要）
  http.post(`${API_URL}/admin/upload-url`, ({ request }) => {
    if (!isAuthenticated(request)) {
      return unauthorizedResponse();
    }

    return HttpResponse.json({
      uploadUrl: 'https://mock-s3-bucket.s3.amazonaws.com/upload-url',
      imageUrl: 'https://mock-cloudfront.com/images/test-image.png',
    });
  }),
];
