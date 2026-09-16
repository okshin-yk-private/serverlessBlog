import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchCategories,
  type Category,
  type APIError,
} from '../api/categories';

/**
 * useCategoriesフックのオプション
 */
interface UseCategoriesOptions {
  /**
   * 自動フェッチを有効にするかどうか
   * デフォルトはtrue
   */
  enabled?: boolean;
}

/**
 * useCategoriesフックの戻り値
 */
interface UseCategoriesResult {
  /** カテゴリ一覧（sortOrder順にソート済み） */
  categories: Category[];
  /** ローディング状態 */
  loading: boolean;
  /** エラーメッセージ（エラーがない場合はnull） */
  error: string | null;
  /** カテゴリを再取得する関数 */
  refetch: () => Promise<void>;
}

/**
 * カテゴリエラーかどうかを判定するヘルパー関数
 */
const isAPIError = (error: unknown): error is APIError => {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    'statusCode' in error
  );
};

/**
 * カテゴリ一覧を取得するカスタムフック
 *
 * - 初回マウント時と画面復帰時にカテゴリ一覧を取得
 * - categories、loading、error、refetch関数を返却
 * - アンマウント時は状態更新をスキップしてメモリリークを防止
 *
 * @param options - フックのオプション
 * @returns UseCategoriesResult
 *
 * @example
 * ```tsx
 * const { categories, loading, error, refetch } = useCategories();
 *
 * if (loading) return <Spinner />;
 * if (error) return <ErrorMessage message={error} />;
 *
 * return (
 *   <select>
 *     {categories.map(cat => (
 *       <option key={cat.id} value={cat.slug}>{cat.name}</option>
 *     ))}
 *   </select>
 * );
 * ```
 */
export const useCategories = (
  options: UseCategoriesOptions = {}
): UseCategoriesResult => {
  const { enabled = true } = options;

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const requestIdRef = useRef(0);

  // Only the latest request may update the options. Returning to the tab can
  // start another read while an earlier request is still in flight.
  const fetchData = useCallback(async (background = false) => {
    if (!isMountedRef.current) return;
    const requestId = ++requestIdRef.current;
    const isCurrent = () =>
      isMountedRef.current && requestId === requestIdRef.current;

    if (!background) setLoading(true);
    setError(null);

    try {
      const data = await fetchCategories();
      if (!isCurrent()) return;
      setCategories([...data].sort((a, b) => a.sortOrder - b.sortOrder));
    } catch (err) {
      if (!isCurrent()) return;
      setError(isAPIError(err) ? err.message : 'カテゴリの取得に失敗しました');
      // Keep usable options and the editor's selection during a transient error.
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, []);

  const refetch = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  useEffect(() => {
    isMountedRef.current = true;
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void fetchData(true);
    };

    if (enabled) {
      void fetchData();
      window.addEventListener('focus', refreshWhenVisible);
      document.addEventListener('visibilitychange', refreshWhenVisible);
    }

    return () => {
      isMountedRef.current = false;
      ++requestIdRef.current;
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [enabled, fetchData]);

  return {
    categories,
    loading,
    error,
    refetch,
  };
};
