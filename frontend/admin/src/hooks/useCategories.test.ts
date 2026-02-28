import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import * as categoriesApi from '../api/categories';

// fetchCategoriesをモック
vi.mock('../api/categories');
const mockedFetchCategories = vi.mocked(categoriesApi.fetchCategories);

// テスト後にモジュールをインポート（モック後）
const { useCategories } = await import('./useCategories');

describe('useCategories', () => {
  const mockCategories: categoriesApi.Category[] = [
    {
      id: 'cat-1',
      name: 'テクノロジー',
      slug: 'tech',
      sortOrder: 1,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'cat-2',
      name: 'ライフスタイル',
      slug: 'life',
      sortOrder: 2,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'cat-3',
      name: 'ビジネス',
      slug: 'business',
      sortOrder: 3,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('初回マウント時の動作', () => {
    it('マウント時にfetchCategoriesを呼び出してカテゴリ一覧を取得する', async () => {
      mockedFetchCategories.mockResolvedValue(mockCategories);

      const { result } = renderHook(() => useCategories());

      // 初期状態はローディング中
      expect(result.current.loading).toBe(true);
      expect(result.current.categories).toEqual([]);
      expect(result.current.error).toBeNull();

      // データ取得完了を待つ
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // カテゴリが取得されている
      expect(result.current.categories).toEqual(mockCategories);
      expect(result.current.error).toBeNull();
      expect(mockedFetchCategories).toHaveBeenCalledTimes(1);
    });

    it('カテゴリが存在しない場合は空配列を返す', async () => {
      mockedFetchCategories.mockResolvedValue([]);

      const { result } = renderHook(() => useCategories());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.categories).toEqual([]);
      expect(result.current.error).toBeNull();
    });

    it('カテゴリはsortOrder順でソートされている', async () => {
      // sortOrderが逆順のデータ
      const unsortedCategories = [
        { ...mockCategories[2], sortOrder: 3 },
        { ...mockCategories[0], sortOrder: 1 },
        { ...mockCategories[1], sortOrder: 2 },
      ];
      mockedFetchCategories.mockResolvedValue(unsortedCategories);

      const { result } = renderHook(() => useCategories());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // sortOrder順にソートされていることを確認
      expect(result.current.categories[0].sortOrder).toBe(1);
      expect(result.current.categories[1].sortOrder).toBe(2);
      expect(result.current.categories[2].sortOrder).toBe(3);
    });
  });

  describe('ローディング状態', () => {
    it('データ取得中はloadingがtrueになる', async () => {
      let resolvePromise: (value: categoriesApi.Category[]) => void;
      const promise = new Promise<categoriesApi.Category[]>((resolve) => {
        resolvePromise = resolve;
      });
      mockedFetchCategories.mockReturnValue(promise);

      const { result } = renderHook(() => useCategories());

      // 初期状態はローディング中
      expect(result.current.loading).toBe(true);

      // Promiseを解決
      await act(async () => {
        resolvePromise!(mockCategories);
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });
    });
  });

  describe('エラーハンドリング', () => {
    it('APIエラー時はerrorにエラーメッセージが設定される', async () => {
      const apiError: categoriesApi.APIError = {
        message: 'サーバーエラーが発生しました',
        statusCode: 500,
      };
      mockedFetchCategories.mockRejectedValue(apiError);

      const { result } = renderHook(() => useCategories());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.categories).toEqual([]);
      expect(result.current.error).toBe('サーバーエラーが発生しました');
    });

    it('ネットワークエラー時はエラーメッセージが設定される', async () => {
      const networkError: categoriesApi.APIError = {
        message: 'ネットワークエラーが発生しました。接続を確認してください。',
        statusCode: 0,
      };
      mockedFetchCategories.mockRejectedValue(networkError);

      const { result } = renderHook(() => useCategories());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe(
        'ネットワークエラーが発生しました。接続を確認してください。'
      );
    });

    it('予期しないエラー時はデフォルトメッセージが設定される', async () => {
      mockedFetchCategories.mockRejectedValue(new Error('Unknown error'));

      const { result } = renderHook(() => useCategories());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('カテゴリの取得に失敗しました');
    });
  });

  describe('refetch関数', () => {
    it('refetchを呼び出すとカテゴリを再取得する', async () => {
      mockedFetchCategories.mockResolvedValue(mockCategories);

      const { result } = renderHook(() => useCategories());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // 初回取得
      expect(mockedFetchCategories).toHaveBeenCalledTimes(1);

      // 新しいカテゴリデータ
      const updatedCategories = [
        ...mockCategories,
        {
          id: 'cat-4',
          name: 'その他',
          slug: 'other',
          sortOrder: 4,
          createdAt: '2026-01-02T00:00:00Z',
          updatedAt: '2026-01-02T00:00:00Z',
        },
      ];
      mockedFetchCategories.mockResolvedValue(updatedCategories);

      // refetch呼び出し
      await act(async () => {
        await result.current.refetch();
      });

      expect(mockedFetchCategories).toHaveBeenCalledTimes(2);
      expect(result.current.categories).toHaveLength(4);
    });

    it('refetch中はloadingがtrueになる', async () => {
      mockedFetchCategories.mockResolvedValue(mockCategories);

      const { result } = renderHook(() => useCategories());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // refetch用のPromise
      let resolveRefetch: (value: categoriesApi.Category[]) => void;
      const refetchPromise = new Promise<categoriesApi.Category[]>(
        (resolve) => {
          resolveRefetch = resolve;
        }
      );
      mockedFetchCategories.mockReturnValue(refetchPromise);

      // refetch開始
      let refetchPromiseResult: Promise<void>;
      act(() => {
        refetchPromiseResult = result.current.refetch();
      });

      // refetch中はローディング
      expect(result.current.loading).toBe(true);

      // Promiseを解決
      await act(async () => {
        resolveRefetch!(mockCategories);
        await refetchPromiseResult;
      });

      expect(result.current.loading).toBe(false);
    });

    it('refetchでエラーが発生した場合、エラー状態が更新される', async () => {
      mockedFetchCategories.mockResolvedValue(mockCategories);

      const { result } = renderHook(() => useCategories());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      // refetch時にエラー
      const apiError: categoriesApi.APIError = {
        message: '再取得に失敗しました',
        statusCode: 500,
      };
      mockedFetchCategories.mockRejectedValue(apiError);

      await act(async () => {
        await result.current.refetch();
      });

      expect(result.current.error).toBe('再取得に失敗しました');
    });

    it('refetch前にエラーがあった場合、成功時にエラーがクリアされる', async () => {
      // 初回はエラー
      const apiError: categoriesApi.APIError = {
        message: 'エラー',
        statusCode: 500,
      };
      mockedFetchCategories.mockRejectedValue(apiError);

      const { result } = renderHook(() => useCategories());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('エラー');

      // refetch時に成功
      mockedFetchCategories.mockResolvedValue(mockCategories);

      await act(async () => {
        await result.current.refetch();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.categories).toEqual(mockCategories);
    });
  });

  describe('オプション', () => {
    it('enabled=falseの場合、マウント時に自動フェッチしない', async () => {
      mockedFetchCategories.mockResolvedValue(mockCategories);

      const { result } = renderHook(() => useCategories({ enabled: false }));

      // 初期状態
      expect(result.current.loading).toBe(false);
      expect(result.current.categories).toEqual([]);
      expect(result.current.error).toBeNull();

      // フェッチされていない
      expect(mockedFetchCategories).not.toHaveBeenCalled();
    });

    it('enabled=falseでもrefetchは機能する', async () => {
      mockedFetchCategories.mockResolvedValue(mockCategories);

      const { result } = renderHook(() => useCategories({ enabled: false }));

      expect(mockedFetchCategories).not.toHaveBeenCalled();

      // refetch呼び出し
      await act(async () => {
        await result.current.refetch();
      });

      expect(mockedFetchCategories).toHaveBeenCalledTimes(1);
      expect(result.current.categories).toEqual(mockCategories);
    });
  });
});
