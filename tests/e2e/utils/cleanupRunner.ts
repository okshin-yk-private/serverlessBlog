/**
 * `cleanup-test-data.ts` CLI のうち、ログイン (実ブラウザ操作) を含まない部分。
 * ID トークン取得後の「一覧して消す/表示するだけ」のロジックをここに切り出し、
 * ブラウザなしで injected fetch 相当の `CleanupHttpClient` で単体テストできるようにする。
 */

import {
  cleanupE2ETestData,
  listTestCategories,
  listTestPosts,
  type CleanupHttpClient,
} from './awsCleanup';

export interface RunCleanupOptions {
  http: CleanupHttpClient;
  apiBase: string;
  idToken: string;
  dryRun: boolean;
}

export interface RunCleanupReport {
  dryRun: boolean;
  /** dry-run: 削除対象として見つかったタイトル/名前。live: 実際に削除したもの。 */
  posts: string[];
  categories: string[];
  failures: string[];
}

/**
 * dry-run なら DELETE を一切発行せず、対象を一覧するだけ。
 * live なら `cleanupE2ETestData` へそのまま委譲する。
 */
export async function runCleanup(
  options: RunCleanupOptions
): Promise<RunCleanupReport> {
  const { http, apiBase, idToken, dryRun } = options;

  if (!dryRun) {
    const result = await cleanupE2ETestData(http, apiBase, idToken);
    return {
      dryRun: false,
      posts: result.deletedPosts,
      categories: result.deletedCategories,
      failures: result.failures,
    };
  }

  const headers = { Authorization: `Bearer ${idToken}` };
  const posts = await listTestPosts(http, apiBase, headers);
  const categories = await listTestCategories(http, apiBase);
  return {
    dryRun: true,
    posts: posts.map((p) => p.title ?? p.id),
    categories: categories.map((c) => c.name ?? c.id),
    failures: [],
  };
}
