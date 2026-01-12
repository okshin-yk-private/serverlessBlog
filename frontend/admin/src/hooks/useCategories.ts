import { useState, useEffect, useCallback } from 'react';
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
 * - 初回マウント時にfetchCategoriesを呼び出してカテゴリ一覧を取得
 * - categories、loading、error、refetch関数を返却
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

  /**
   * カテゴリを取得する内部関数
   */
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchCategories();
      // sortOrder順でソート
      const sorted = [...data].sort((a, b) => a.sortOrder - b.sortOrder);
      setCategories(sorted);
    } catch (err) {
      if (isAPIError(err)) {
        setError(err.message);
      } else {
        setError('カテゴリの取得に失敗しました');
      }
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * カテゴリを再取得する関数
   */
  const refetch = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  // 初回マウント時に自動フェッチ
  useEffect(() => {
    if (enabled) {
      fetchData();
    }
  }, [enabled, fetchData]);

  return {
    categories,
    loading,
    error,
    refetch,
  };
};
