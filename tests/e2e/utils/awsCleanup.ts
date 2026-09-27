/**
 * 実 AWS 環境向け [E2E-TEST] データ掃除 (global-teardown から呼ぶ)
 *
 * 認証は admin SPA と同じ Cognito ID トークンを使う。取得は呼び出し側
 * (global-teardown) が実 UI でログインして行い、ここは API 呼び出しだけを持つ。
 * Playwright に依存しない最小インターフェースにしているのは、ページングや
 * 失敗時の扱いをブラウザ無しで単体テストするため。
 */

export const E2E_TEST_PREFIX = '[E2E-TEST]';

/** admin SPA が ID トークンを置く sessionStorage キー (frontend/admin/src/utils/auth.ts) */
export const ADMIN_SESSION_TOKEN_KEY = 'auth_session_token';

/** APIRequestContext のうち、ここで使う部分だけ */
export interface CleanupHttpResponse {
  ok(): boolean;
  status(): number;
  json(): Promise<unknown>;
}

export interface CleanupHttpClient {
  get(
    url: string,
    options?: { headers?: Record<string, string> }
  ): Promise<CleanupHttpResponse>;
  delete(
    url: string,
    options?: { headers?: Record<string, string> }
  ): Promise<CleanupHttpResponse>;
}

export interface CleanupResult {
  deletedPosts: string[];
  deletedCategories: string[];
  failures: string[];
}

interface Named {
  id: string;
  title?: string;
  name?: string;
}

// ListPosts は publishStatus 未指定だと published しか返さない
// (go-functions/cmd/posts/list)。テストが作る記事の多くは下書きなので両方を引く。
const PUBLISH_STATUSES = ['draft', 'published'] as const;
const PAGE_LIMIT = 100; // ListPosts の MaxLimit
const MAX_PAGES = 50; // nextToken が循環しても止まるための保険

async function listTestPosts(
  http: CleanupHttpClient,
  apiBase: string,
  headers: Record<string, string>
): Promise<Named[]> {
  const found: Named[] = [];
  for (const status of PUBLISH_STATUSES) {
    let nextToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const query = new URLSearchParams({
        publishStatus: status,
        limit: String(PAGE_LIMIT),
      });
      if (nextToken) query.set('nextToken', nextToken);
      const resp = await http.get(`${apiBase}/admin/posts?${query}`, {
        headers,
      });
      if (!resp.ok()) {
        throw new Error(
          `GET /admin/posts (publishStatus=${status}) returned ${resp.status()}`
        );
      }
      const body = (await resp.json()) as {
        items?: Named[];
        nextToken?: string;
      };
      found.push(
        ...(body.items ?? []).filter((p) =>
          p.title?.startsWith(E2E_TEST_PREFIX)
        )
      );
      nextToken = body.nextToken;
      if (!nextToken) break;
    }
  }
  return found;
}

/**
 * [E2E-TEST] prefix の記事とカテゴリを削除する。
 * 記事を先に消す (カテゴリ削除が参照中の記事で拒否されないように)。
 * 個別の削除失敗は failures に集めて続行し、一覧取得の失敗は throw する。
 */
export async function cleanupE2ETestData(
  http: CleanupHttpClient,
  apiBase: string,
  idToken: string
): Promise<CleanupResult> {
  const headers = { Authorization: `Bearer ${idToken}` };
  const result: CleanupResult = {
    deletedPosts: [],
    deletedCategories: [],
    failures: [],
  };

  for (const post of await listTestPosts(http, apiBase, headers)) {
    const resp = await http.delete(`${apiBase}/admin/posts/${post.id}`, {
      headers,
    });
    if (resp.ok()) result.deletedPosts.push(post.title ?? post.id);
    else result.failures.push(`post ${post.id}: ${resp.status()}`);
  }

  const catResp = await http.get(`${apiBase}/categories`);
  if (!catResp.ok()) {
    throw new Error(`GET /categories returned ${catResp.status()}`);
  }
  const categories = ((await catResp.json()) as Named[]).filter((c) =>
    c.name?.startsWith(E2E_TEST_PREFIX)
  );
  for (const cat of categories) {
    const resp = await http.delete(`${apiBase}/admin/categories/${cat.id}`, {
      headers,
    });
    if (resp.ok()) result.deletedCategories.push(cat.name ?? cat.id);
    else result.failures.push(`category ${cat.id}: ${resp.status()}`);
  }

  return result;
}
