import { http, HttpResponse, delay } from 'msw';

// E2Eテスト時は相対パスでマッチさせる（MSWは同一オリジンのリクエストをインターセプトできる）
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

// レート制限のための状態管理
const loginAttempts: Record<string, { count: number; resetTime: number }> = {};

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
  http.post(`${API_URL}/auth/login`, async ({ request }) => {
    // ネットワークエラーシミュレーション（テスト用ヘッダー）
    const simulateNetworkError = request.headers.get('x-mock-network-error');
    if (simulateNetworkError === 'true') {
      // ネットワークエラーをシミュレート
      return HttpResponse.error();
    }

    const body = (await request.json()) as { email: string; password: string };

    // レート制限チェック
    const now = Date.now();
    const attempts = loginAttempts[body.email];

    if (attempts) {
      if (now < attempts.resetTime) {
        if (attempts.count >= 5) {
          return HttpResponse.json(
            {
              message:
                'ログイン試行回数が上限に達しました。しばらくしてからお試しください。',
            },
            { status: 429 }
          );
        }
        attempts.count++;
      } else {
        // リセット時間を過ぎたのでカウンターをリセット
        loginAttempts[body.email] = { count: 1, resetTime: now + 60000 }; // 1分間
      }
    } else {
      loginAttempts[body.email] = { count: 1, resetTime: now + 60000 };
    }

    // 有効な認証情報のチェック
    const validEmail = 'admin@example.com';
    const validPassword = 'testpassword';

    if (body.email !== validEmail || body.password !== validPassword) {
      return HttpResponse.json(
        { message: '認証に失敗しました' },
        { status: 401 }
      );
    }

    // 成功時はカウンターをリセット
    delete loginAttempts[body.email];

    return HttpResponse.json({
      token: 'mock-jwt-token',
      user: {
        id: 'user-123',
        email: 'admin@example.com',
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

    const body = (await request.json()) as any;
    return HttpResponse.json(
      {
        id: 'new-post-id',
        title: body.title,
        contentMarkdown: body.contentMarkdown,
        contentHtml: `<p>${body.contentMarkdown}</p>`,
        category: body.category,
        publishStatus: body.publishStatus,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      { status: 201 }
    );
  }),

  // 記事更新モック（認証必要）
  http.put(`${API_URL}/admin/posts/:id`, async ({ params, request }) => {
    if (!isAuthenticated(request)) {
      return unauthorizedResponse();
    }

    const body = (await request.json()) as any;
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
