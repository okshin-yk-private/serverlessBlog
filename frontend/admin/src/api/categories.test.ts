import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient } from './client';
import {
  fetchCategories,
  createCategory,
  updateCategory,
  updateCategorySortOrders,
  deleteCategory,
  Category,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  UpdateSortOrderRequest,
} from './categories';

// 認証ヘッダーの付与・401リフレッシュは client.ts のインターセプタに集約されている
// （client.test.ts で検証）。ここではエンドポイント呼び出しとエラー変換を検証する。
vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  AUTH_SESSION_EXPIRED_EVENT: 'auth:session-expired',
}));

const mockedClient = vi.mocked(apiClient, true);

describe('categories API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const mockCategory: Category = {
    id: 'cat-1',
    name: 'テクノロジー',
    slug: 'tech',
    sortOrder: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };

  describe('fetchCategories', () => {
    it('GET /categories を呼び出してカテゴリ一覧を取得する', async () => {
      const mockCategories: Category[] = [
        mockCategory,
        {
          ...mockCategory,
          id: 'cat-2',
          name: 'ライフスタイル',
          slug: 'life',
          sortOrder: 2,
        },
      ];
      mockedClient.get.mockResolvedValue({ data: mockCategories });

      const result = await fetchCategories();

      expect(mockedClient.get).toHaveBeenCalledWith('/categories');
      expect(result).toEqual(mockCategories);
    });

    it('カテゴリが存在しない場合は空配列を返す', async () => {
      mockedClient.get.mockResolvedValue({ data: [] });

      const result = await fetchCategories();

      expect(result).toEqual([]);
    });

    it('APIエラー時はエラーをスローする', async () => {
      const error = {
        response: {
          status: 500,
          data: { message: 'Internal Server Error' },
        },
      };
      mockedClient.get.mockRejectedValue(error);

      await expect(fetchCategories()).rejects.toMatchObject({
        message: 'Internal Server Error',
        statusCode: 500,
      });
    });

    it('ネットワークエラー時はエラーをスローする', async () => {
      mockedClient.get.mockRejectedValue(new Error('Network Error'));

      await expect(fetchCategories()).rejects.toMatchObject({
        message: 'ネットワークエラーが発生しました。接続を確認してください。',
        statusCode: 0,
      });
    });
  });

  describe('createCategory', () => {
    const createRequest: CreateCategoryRequest = {
      name: '新カテゴリ',
      slug: 'new-category',
    };

    it('POST /admin/categories を呼び出してカテゴリを作成する', async () => {
      const createdCategory = {
        ...mockCategory,
        ...createRequest,
        id: 'new-id',
      };
      mockedClient.post.mockResolvedValue({ data: createdCategory });

      const result = await createCategory(createRequest);

      expect(mockedClient.post).toHaveBeenCalledWith(
        '/admin/categories',
        createRequest
      );
      expect(result).toEqual(createdCategory);
    });

    it('400エラー（バリデーションエラー）時はエラーをスローする', async () => {
      const error = {
        response: {
          status: 400,
          data: { message: 'nameは必須です' },
        },
      };
      mockedClient.post.mockRejectedValue(error);

      await expect(createCategory(createRequest)).rejects.toMatchObject({
        message: 'nameは必須です',
        statusCode: 400,
      });
    });

    it('409エラー（slug重複）時はエラーをスローする', async () => {
      const error = {
        response: {
          status: 409,
          data: { message: 'このslugは既に使用されています' },
        },
      };
      mockedClient.post.mockRejectedValue(error);

      await expect(createCategory(createRequest)).rejects.toMatchObject({
        message: 'このslugは既に使用されています',
        statusCode: 409,
      });
    });
  });

  describe('updateCategory', () => {
    const updateRequest: UpdateCategoryRequest = {
      name: '更新後カテゴリ',
    };

    it('PUT /admin/categories/{id} を呼び出してカテゴリを更新する', async () => {
      const updatedCategory = { ...mockCategory, ...updateRequest };
      mockedClient.put.mockResolvedValue({ data: updatedCategory });

      const result = await updateCategory('cat-1', updateRequest);

      expect(mockedClient.put).toHaveBeenCalledWith(
        '/admin/categories/cat-1',
        updateRequest
      );
      expect(result).toEqual(updatedCategory);
    });

    it('部分更新（slugのみ）ができる', async () => {
      const partialUpdate: UpdateCategoryRequest = { slug: 'new-slug' };
      const updatedCategory = { ...mockCategory, slug: 'new-slug' };
      mockedClient.put.mockResolvedValue({ data: updatedCategory });

      const result = await updateCategory('cat-1', partialUpdate);

      expect(mockedClient.put).toHaveBeenCalledWith(
        '/admin/categories/cat-1',
        partialUpdate
      );
      expect(result.slug).toBe('new-slug');
    });

    it('404エラー（カテゴリ不存在）時はエラーをスローする', async () => {
      const error = {
        response: {
          status: 404,
          data: { message: 'カテゴリが見つかりません' },
        },
      };
      mockedClient.put.mockRejectedValue(error);

      await expect(
        updateCategory('non-existent', updateRequest)
      ).rejects.toMatchObject({
        message: 'カテゴリが見つかりません',
        statusCode: 404,
      });
    });

    it('409エラー（slug重複）時はエラーをスローする', async () => {
      const error = {
        response: {
          status: 409,
          data: { message: 'このslugは既に使用されています' },
        },
      };
      mockedClient.put.mockRejectedValue(error);

      await expect(
        updateCategory('cat-1', { slug: 'existing-slug' })
      ).rejects.toMatchObject({
        message: 'このslugは既に使用されています',
        statusCode: 409,
      });
    });
  });

  describe('updateCategorySortOrders', () => {
    const sortOrderRequest: UpdateSortOrderRequest = {
      orders: [
        { id: 'cat-1', sortOrder: 2 },
        { id: 'cat-2', sortOrder: 1 },
      ],
    };

    it('PATCH /admin/categories/sort を呼び出してsortOrderを一括更新する', async () => {
      const updatedCategories: Category[] = [
        { ...mockCategory, sortOrder: 2 },
        {
          ...mockCategory,
          id: 'cat-2',
          name: 'ライフスタイル',
          slug: 'life',
          sortOrder: 1,
        },
      ];
      mockedClient.patch.mockResolvedValue({ data: updatedCategories });

      const result = await updateCategorySortOrders(sortOrderRequest);

      expect(mockedClient.patch).toHaveBeenCalledWith(
        '/admin/categories/sort',
        sortOrderRequest
      );
      expect(result).toEqual(updatedCategories);
    });

    it('400エラー（無効なID）時はエラーをスローする', async () => {
      const error = {
        response: {
          status: 400,
          data: { message: '無効なカテゴリID: invalid-id' },
        },
      };
      mockedClient.patch.mockRejectedValue(error);

      await expect(
        updateCategorySortOrders(sortOrderRequest)
      ).rejects.toMatchObject({
        message: '無効なカテゴリID: invalid-id',
        statusCode: 400,
      });
    });
  });

  describe('deleteCategory', () => {
    it('DELETE /admin/categories/{id} を呼び出してカテゴリを削除する', async () => {
      mockedClient.delete.mockResolvedValue({ status: 204 });

      await deleteCategory('cat-1');

      expect(mockedClient.delete).toHaveBeenCalledWith(
        '/admin/categories/cat-1'
      );
    });

    it('404エラー（カテゴリ不存在）時はエラーをスローする', async () => {
      const error = {
        response: {
          status: 404,
          data: { message: 'カテゴリが見つかりません' },
        },
      };
      mockedClient.delete.mockRejectedValue(error);

      await expect(deleteCategory('non-existent')).rejects.toMatchObject({
        message: 'カテゴリが見つかりません',
        statusCode: 404,
      });
    });

    it('409エラー（カテゴリ使用中）時はエラーをスローする', async () => {
      const error = {
        response: {
          status: 409,
          data: {
            message: 'このカテゴリは記事で使用されているため削除できません',
          },
        },
      };
      mockedClient.delete.mockRejectedValue(error);

      await expect(deleteCategory('cat-1')).rejects.toMatchObject({
        message: 'このカテゴリは記事で使用されているため削除できません',
        statusCode: 409,
      });
    });
  });

  describe('エラーハンドリング', () => {
    it('レスポンスにmessageがない場合はデフォルトメッセージを使用する', async () => {
      const error = {
        response: {
          status: 500,
          data: {},
        },
      };
      mockedClient.get.mockRejectedValue(error);

      await expect(fetchCategories()).rejects.toMatchObject({
        message: 'エラーが発生しました',
        statusCode: 500,
      });
    });

    it('response自体がない場合（ネットワークエラー）を処理する', async () => {
      mockedClient.get.mockRejectedValue(new Error('Network Error'));

      await expect(fetchCategories()).rejects.toMatchObject({
        message: 'ネットワークエラーが発生しました。接続を確認してください。',
        statusCode: 0,
      });
    });
  });
});
