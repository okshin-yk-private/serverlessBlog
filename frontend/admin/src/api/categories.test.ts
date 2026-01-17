import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import * as authUtils from '../utils/auth';
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

vi.mock('axios');
vi.mock('../utils/auth');

const mockedAxios = vi.mocked(axios, true);
const mockedGetAuthToken = vi.mocked(authUtils.getAuthToken);

describe('categories API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetAuthToken.mockReturnValue('test-auth-token');
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
      mockedAxios.get.mockResolvedValue({ data: mockCategories });

      const result = await fetchCategories();

      expect(mockedAxios.get).toHaveBeenCalledWith('/categories');
      expect(result).toEqual(mockCategories);
    });

    it('カテゴリが存在しない場合は空配列を返す', async () => {
      mockedAxios.get.mockResolvedValue({ data: [] });

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
      mockedAxios.get.mockRejectedValue(error);

      await expect(fetchCategories()).rejects.toMatchObject({
        message: 'Internal Server Error',
        statusCode: 500,
      });
    });

    it('ネットワークエラー時はエラーをスローする', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network Error'));

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
      mockedAxios.post.mockResolvedValue({ data: createdCategory });

      const result = await createCategory(createRequest);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        '/admin/categories',
        createRequest,
        {
          headers: {
            Authorization: 'Bearer test-auth-token',
            'Content-Type': 'application/json',
          },
        }
      );
      expect(result).toEqual(createdCategory);
    });

    it('認証トークンを含めてリクエストする', async () => {
      mockedGetAuthToken.mockReturnValue('another-token');
      mockedAxios.post.mockResolvedValue({ data: mockCategory });

      await createCategory(createRequest);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer another-token',
          }),
        })
      );
    });

    it('400エラー（バリデーションエラー）時はエラーをスローする', async () => {
      const error = {
        response: {
          status: 400,
          data: { message: 'nameは必須です' },
        },
      };
      mockedAxios.post.mockRejectedValue(error);

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
      mockedAxios.post.mockRejectedValue(error);

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
      mockedAxios.put.mockResolvedValue({ data: updatedCategory });

      const result = await updateCategory('cat-1', updateRequest);

      expect(mockedAxios.put).toHaveBeenCalledWith(
        '/admin/categories/cat-1',
        updateRequest,
        {
          headers: {
            Authorization: 'Bearer test-auth-token',
            'Content-Type': 'application/json',
          },
        }
      );
      expect(result).toEqual(updatedCategory);
    });

    it('部分更新（slugのみ）ができる', async () => {
      const partialUpdate: UpdateCategoryRequest = { slug: 'new-slug' };
      const updatedCategory = { ...mockCategory, slug: 'new-slug' };
      mockedAxios.put.mockResolvedValue({ data: updatedCategory });

      const result = await updateCategory('cat-1', partialUpdate);

      expect(mockedAxios.put).toHaveBeenCalledWith(
        '/admin/categories/cat-1',
        partialUpdate,
        expect.any(Object)
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
      mockedAxios.put.mockRejectedValue(error);

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
      mockedAxios.put.mockRejectedValue(error);

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
      mockedAxios.patch.mockResolvedValue({ data: updatedCategories });

      const result = await updateCategorySortOrders(sortOrderRequest);

      expect(mockedAxios.patch).toHaveBeenCalledWith(
        '/admin/categories/sort',
        sortOrderRequest,
        {
          headers: {
            Authorization: 'Bearer test-auth-token',
            'Content-Type': 'application/json',
          },
        }
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
      mockedAxios.patch.mockRejectedValue(error);

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
      mockedAxios.delete.mockResolvedValue({ status: 204 });

      await deleteCategory('cat-1');

      expect(mockedAxios.delete).toHaveBeenCalledWith(
        '/admin/categories/cat-1',
        {
          headers: {
            Authorization: 'Bearer test-auth-token',
          },
        }
      );
    });

    it('404エラー（カテゴリ不存在）時はエラーをスローする', async () => {
      const error = {
        response: {
          status: 404,
          data: { message: 'カテゴリが見つかりません' },
        },
      };
      mockedAxios.delete.mockRejectedValue(error);

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
      mockedAxios.delete.mockRejectedValue(error);

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
      mockedAxios.get.mockRejectedValue(error);

      await expect(fetchCategories()).rejects.toMatchObject({
        message: 'エラーが発生しました',
        statusCode: 500,
      });
    });

    it('response自体がない場合（ネットワークエラー）を処理する', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network Error'));

      await expect(fetchCategories()).rejects.toMatchObject({
        message: 'ネットワークエラーが発生しました。接続を確認してください。',
        statusCode: 0,
      });
    });
  });
});
