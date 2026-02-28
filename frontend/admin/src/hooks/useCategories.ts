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
 * - 初回マウント時にfetchCategoriesを呼び出してカテゴリ一覧を取得
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

  // マウント状態を追跡してアンマウント後の状態更新を防止
  const isMountedRef = useRef(true);

  /**
   * カテゴリを取得する内部関数
   * @param ignoreCancel - キャンセルフラグを無視するかどうか（手動refetch用）
   */
  const fetchData = useCallback(async (ignoreCancel = false) => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchCategories();

      // アンマウント後は状態を更新しない
      if (!isMountedRef.current && !ignoreCancel) {
        return;
      }

      // sortOrder順でソート
      const sorted = [...data].sort((a, b) => a.sortOrder - b.sortOrder);
      setCategories(sorted);
    } catch (err) {
      // アンマウント後は状態を更新しない
      if (!isMountedRef.current && !ignoreCancel) {
        return;
      }

      if (isAPIError(err)) {
        setError(err.message);
      } else {
        setError('カテゴリの取得に失敗しました');
      }
      setCategories([]);
    } finally {
      // アンマウント後は状態を更新しない
      if (isMountedRef.current || ignoreCancel) {
        setLoading(false);
      }
    }
  }, []);

  /**
   * カテゴリを再取得する関数
   */
  const refetch = useCallback(async () => {
    await fetchData(true);
  }, [fetchData]);

  // 初回マウント時に自動フェッチ、アンマウント時にフラグをリセット
  useEffect(() => {
    isMountedRef.current = true;

    if (enabled) {
      fetchData();
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [enabled, fetchData]);

  return {
    categories,
    loading,
    error,
    refetch,
  };
};
