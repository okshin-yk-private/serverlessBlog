/**
 * 検索ユーティリティ関数
 *
 * クライアントサイドでの記事検索機能を提供
 * タイトル、カテゴリー、タグを対象に部分一致検索を実行
 */

/**
 * 検索対象の記事データ型
 * ビルド時にJSONとして埋め込まれる最小限のデータ
 */
export interface SearchablePost {
  id: string;
  title: string;
  category: string;
  tags: string[];
}

/**
 * 記事を検索してマッチした記事のIDリストを返す
 *
 * @param posts - 検索対象の記事リスト
 * @param query - 検索クエリ（空の場合は全記事を返す）
 * @returns マッチした記事のIDリスト
 *
 * 検索ロジック:
 * - タイトル、カテゴリー、タグのいずれかに部分一致
 * - 大文字小文字を区別しない
 * - 日本語にも対応
 */
export function searchPosts(posts: SearchablePost[], query: string): string[] {
  // 空クエリの場合は全記事を返す
  if (!query.trim()) {
    return posts.map((p) => p.id);
  }

  const normalizedQuery = query.toLowerCase().trim();

  return posts
    .filter((post) => {
      // タイトルでマッチ
      if (post.title.toLowerCase().includes(normalizedQuery)) {
        return true;
      }

      // カテゴリーでマッチ
      if (post.category.toLowerCase().includes(normalizedQuery)) {
        return true;
      }

      // タグでマッチ
      if (
        post.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery))
      ) {
        return true;
      }

      return false;
    })
    .map((p) => p.id);
}

/**
 * デバウンス関数
 *
 * 連続した呼び出しを制御し、最後の呼び出しから指定時間経過後に実行
 *
 * @param func - 実行する関数
 * @param wait - 待機時間（ミリ秒）
 * @returns デバウンスされた関数
 */
export function debounce<T extends (...args: Parameters<T>) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return function (this: ThisParameterType<T>, ...args: Parameters<T>): void {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      func.apply(this, args);
    }, wait);
  };
}
