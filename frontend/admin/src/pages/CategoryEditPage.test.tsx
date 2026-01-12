import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter, MemoryRouter, Route, Routes } from 'react-router-dom';
import CategoryEditPage from './CategoryEditPage';
import { AuthProvider } from '../contexts/AuthContext';

// API関数をモック（vi.hoistedでモック関数を先に定義）
const { mockFetchCategories, mockCreateCategory, mockUpdateCategory } =
  vi.hoisted(() => ({
    mockFetchCategories: vi.fn(),
    mockCreateCategory: vi.fn(),
    mockUpdateCategory: vi.fn(),
  }));

vi.mock('../api/categories', () => ({
  fetchCategories: mockFetchCategories,
  createCategory: mockCreateCategory,
  updateCategory: mockUpdateCategory,
  deleteCategory: vi.fn(),
  updateCategorySortOrders: vi.fn(),
}));

// useNavigateをモック
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Amplifyのモック
vi.mock('aws-amplify/auth', () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
  getCurrentUser: vi.fn().mockRejectedValue(new Error('Not authenticated')),
  fetchAuthSession: vi.fn(),
  confirmSignIn: vi.fn(),
}));

// AdminLayoutをモック（AdminHeaderのuseAuth依存を回避）
vi.mock('../components/AdminLayout', () => ({
  default: ({
    children,
    title,
    subtitle,
  }: {
    children: React.ReactNode;
    title?: string;
    subtitle?: string;
  }) => (
    <div data-testid="admin-layout">
      {title && <h1>{title}</h1>}
      {subtitle && <p>{subtitle}</p>}
      {children}
    </div>
  ),
}));

const renderCategoryEditPageNewMode = () => {
  return render(
    <MemoryRouter initialEntries={['/categories/new']}>
      <AuthProvider>
        <Routes>
          <Route path="/categories/new" element={<CategoryEditPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
};

const renderCategoryEditPageEditMode = (categoryId: string) => {
  return render(
    <MemoryRouter initialEntries={[`/categories/edit/${categoryId}`]}>
      <AuthProvider>
        <Routes>
          <Route path="/categories/edit/:id" element={<CategoryEditPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
};

describe('CategoryEditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('新規作成モード', () => {
    it('新規作成モードでフォームを表示する', () => {
      renderCategoryEditPageNewMode();

      expect(
        screen.getByRole('heading', { name: /カテゴリを作成/i })
      ).toBeInTheDocument();
      expect(screen.getByLabelText(/カテゴリ名/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/スラッグ/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/説明/i)).toBeInTheDocument();
    });

    it('name、slug、descriptionの入力フィールドを表示する', () => {
      renderCategoryEditPageNewMode();

      const nameInput = screen.getByLabelText(/カテゴリ名/i);
      const slugInput = screen.getByLabelText(/スラッグ/i);
      const descriptionInput = screen.getByLabelText(/説明/i);

      expect(nameInput).toBeInTheDocument();
      expect(slugInput).toBeInTheDocument();
      expect(descriptionInput).toBeInTheDocument();

      // 初期値が空であることを確認
      expect(nameInput).toHaveValue('');
      expect(slugInput).toHaveValue('');
      expect(descriptionInput).toHaveValue('');
    });

    it('新規作成時にcreateCategory APIを呼び出す', async () => {
      const user = userEvent.setup();
      const newCategory = {
        id: 'new-id',
        name: 'テストカテゴリ',
        slug: 'test-category',
        description: 'テスト説明',
        sortOrder: 1,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockCreateCategory.mockResolvedValue(newCategory);

      renderCategoryEditPageNewMode();

      const nameInput = screen.getByLabelText(/カテゴリ名/i);
      const slugInput = screen.getByLabelText(/スラッグ/i);
      const descriptionInput = screen.getByLabelText(/説明/i);
      const submitButton = screen.getByRole('button', { name: /保存/i });

      await user.type(nameInput, 'テストカテゴリ');
      await user.type(slugInput, 'test-category');
      await user.type(descriptionInput, 'テスト説明');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockCreateCategory).toHaveBeenCalledWith({
          name: 'テストカテゴリ',
          slug: 'test-category',
          description: 'テスト説明',
        });
      });
    });

    it('作成成功時にカテゴリ一覧ページへ遷移する', async () => {
      const user = userEvent.setup();
      const newCategory = {
        id: 'new-id',
        name: 'テストカテゴリ',
        slug: 'test-category',
        description: '',
        sortOrder: 1,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockCreateCategory.mockResolvedValue(newCategory);

      renderCategoryEditPageNewMode();

      const nameInput = screen.getByLabelText(/カテゴリ名/i);
      const submitButton = screen.getByRole('button', { name: /保存/i });

      await user.type(nameInput, 'テストカテゴリ');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/categories');
      });
    });
  });

  describe('編集モード', () => {
    const existingCategory = {
      id: '1',
      name: 'テクノロジー',
      slug: 'tech',
      description: '技術関連の記事',
      sortOrder: 1,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
    };

    it('編集モードでカテゴリデータを取得してフォームに初期値設定', async () => {
      mockFetchCategories.mockResolvedValue([existingCategory]);

      renderCategoryEditPageEditMode('1');

      await waitFor(() => {
        expect(screen.getByLabelText(/カテゴリ名/i)).toHaveValue(
          'テクノロジー'
        );
        expect(screen.getByLabelText(/スラッグ/i)).toHaveValue('tech');
        expect(screen.getByLabelText(/説明/i)).toHaveValue('技術関連の記事');
      });
    });

    it('編集モードでupdateCategory APIを呼び出す', async () => {
      const user = userEvent.setup();
      const updatedCategory = {
        ...existingCategory,
        name: '更新後カテゴリ',
        updatedAt: '2024-01-02T00:00:00Z',
      };

      mockFetchCategories.mockResolvedValue([existingCategory]);
      mockUpdateCategory.mockResolvedValue(updatedCategory);

      renderCategoryEditPageEditMode('1');

      await waitFor(() => {
        expect(screen.getByLabelText(/カテゴリ名/i)).toHaveValue(
          'テクノロジー'
        );
      });

      const nameInput = screen.getByLabelText(/カテゴリ名/i);
      const submitButton = screen.getByRole('button', { name: /保存/i });

      await user.clear(nameInput);
      await user.type(nameInput, '更新後カテゴリ');
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockUpdateCategory).toHaveBeenCalledWith('1', {
          name: '更新後カテゴリ',
          slug: 'tech',
          description: '技術関連の記事',
        });
      });
    });

    it('更新成功時にカテゴリ一覧ページへ遷移する', async () => {
      const user = userEvent.setup();
      const updatedCategory = {
        ...existingCategory,
        name: '更新後カテゴリ',
        updatedAt: '2024-01-02T00:00:00Z',
      };

      mockFetchCategories.mockResolvedValue([existingCategory]);
      mockUpdateCategory.mockResolvedValue(updatedCategory);

      renderCategoryEditPageEditMode('1');

      await waitFor(() => {
        expect(screen.getByLabelText(/カテゴリ名/i)).toHaveValue(
          'テクノロジー'
        );
      });

      const submitButton = screen.getByRole('button', { name: /保存/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/categories');
      });
    });

    it('編集モードで「カテゴリを編集」というタイトルを表示する', async () => {
      mockFetchCategories.mockResolvedValue([existingCategory]);

      renderCategoryEditPageEditMode('1');

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /カテゴリを編集/i })
        ).toBeInTheDocument();
      });
    });

    it('存在しないカテゴリIDの場合はエラーを表示する', async () => {
      mockFetchCategories.mockResolvedValue([]);

      renderCategoryEditPageEditMode('non-existent-id');

      await waitFor(() => {
        expect(
          screen.getByText(/カテゴリが見つかりませんでした/i)
        ).toBeInTheDocument();
      });
    });
  });

  describe('フォームバリデーション', () => {
    it('name（カテゴリ名）が未入力の場合はエラーを表示する', async () => {
      const user = userEvent.setup();
      renderCategoryEditPageNewMode();

      const submitButton = screen.getByRole('button', { name: /保存/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/カテゴリ名は必須です/i)).toBeInTheDocument();
      });

      // APIが呼び出されないことを確認
      expect(mockCreateCategory).not.toHaveBeenCalled();
    });

    it('nameが100文字を超える場合はエラーを表示する', async () => {
      const user = userEvent.setup();
      renderCategoryEditPageNewMode();

      const nameInput = screen.getByLabelText(/カテゴリ名/i);
      const longName = 'a'.repeat(101);

      await user.type(nameInput, longName);
      const submitButton = screen.getByRole('button', { name: /保存/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(
          screen.getByText(/カテゴリ名は100文字以内で入力してください/i)
        ).toBeInTheDocument();
      });

      // APIが呼び出されないことを確認
      expect(mockCreateCategory).not.toHaveBeenCalled();
    });

    it('slugが英数字・ハイフン以外を含む場合はエラーを表示する', async () => {
      const user = userEvent.setup();
      renderCategoryEditPageNewMode();

      const nameInput = screen.getByLabelText(/カテゴリ名/i);
      const slugInput = screen.getByLabelText(/スラッグ/i);

      await user.type(nameInput, 'テストカテゴリ');
      await user.type(slugInput, 'invalid_slug!');

      const submitButton = screen.getByRole('button', { name: /保存/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(
          screen.getByText(/スラッグは英数字とハイフンのみ使用できます/i)
        ).toBeInTheDocument();
      });

      // APIが呼び出されないことを確認
      expect(mockCreateCategory).not.toHaveBeenCalled();
    });

    it('slugが未入力の場合は送信可能（サーバーで自動生成）', async () => {
      const user = userEvent.setup();
      const newCategory = {
        id: 'new-id',
        name: 'テストカテゴリ',
        slug: 'auto-generated',
        description: '',
        sortOrder: 1,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockCreateCategory.mockResolvedValue(newCategory);

      renderCategoryEditPageNewMode();

      const nameInput = screen.getByLabelText(/カテゴリ名/i);
      await user.type(nameInput, 'テストカテゴリ');

      const submitButton = screen.getByRole('button', { name: /保存/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockCreateCategory).toHaveBeenCalledWith({
          name: 'テストカテゴリ',
          slug: '',
          description: '',
        });
      });
    });
  });

  describe('エラーハンドリング', () => {
    it('409 Conflict（slug重複）のエラーメッセージを表示する', async () => {
      const user = userEvent.setup();
      const conflictError = {
        message: 'このスラッグは既に使用されています',
        statusCode: 409,
      };

      mockCreateCategory.mockRejectedValue(conflictError);

      renderCategoryEditPageNewMode();

      const nameInput = screen.getByLabelText(/カテゴリ名/i);
      const slugInput = screen.getByLabelText(/スラッグ/i);

      await user.type(nameInput, 'テストカテゴリ');
      await user.type(slugInput, 'existing-slug');

      const submitButton = screen.getByRole('button', { name: /保存/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(
          screen.getByText(/このスラッグは既に使用されています/i)
        ).toBeInTheDocument();
      });
    });

    it('一般的なAPIエラーのエラーメッセージを表示する', async () => {
      const user = userEvent.setup();
      mockCreateCategory.mockRejectedValue(new Error('Network Error'));

      renderCategoryEditPageNewMode();

      const nameInput = screen.getByLabelText(/カテゴリ名/i);
      await user.type(nameInput, 'テストカテゴリ');

      const submitButton = screen.getByRole('button', { name: /保存/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(
          screen.getByText(/カテゴリの保存に失敗しました/i)
        ).toBeInTheDocument();
      });
    });

    it('カテゴリ取得に失敗した場合はエラーメッセージを表示する', async () => {
      mockFetchCategories.mockRejectedValue(new Error('API Error'));

      renderCategoryEditPageEditMode('1');

      await waitFor(() => {
        expect(
          screen.getByText(/カテゴリの取得に失敗しました/i)
        ).toBeInTheDocument();
      });
    });
  });

  describe('ローディング状態', () => {
    it('編集モードでデータ取得中にローディング表示する', () => {
      mockFetchCategories.mockImplementation(() => new Promise(() => {})); // 永遠に待つ

      renderCategoryEditPageEditMode('1');

      expect(screen.getByText(/読み込み中/i)).toBeInTheDocument();
    });

    it('保存処理中に保存ボタンを無効化する', async () => {
      const user = userEvent.setup();
      mockCreateCategory.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      renderCategoryEditPageNewMode();

      const nameInput = screen.getByLabelText(/カテゴリ名/i);
      await user.type(nameInput, 'テストカテゴリ');

      const submitButton = screen.getByRole('button', { name: /保存/i });
      await user.click(submitButton);

      // 保存中はボタンが無効化される
      expect(submitButton).toBeDisabled();
    });
  });

  describe('キャンセル操作', () => {
    it('キャンセルボタンをクリックするとカテゴリ一覧ページへ遷移する', async () => {
      const user = userEvent.setup();
      renderCategoryEditPageNewMode();

      const cancelButton = screen.getByRole('button', { name: /キャンセル/i });
      await user.click(cancelButton);

      expect(mockNavigate).toHaveBeenCalledWith('/categories');
    });
  });

  describe('エッジケース', () => {
    it('descriptionが空の場合でも正常に送信できる', async () => {
      const user = userEvent.setup();
      const newCategory = {
        id: 'new-id',
        name: 'テストカテゴリ',
        slug: 'test',
        description: '',
        sortOrder: 1,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockCreateCategory.mockResolvedValue(newCategory);

      renderCategoryEditPageNewMode();

      const nameInput = screen.getByLabelText(/カテゴリ名/i);
      const slugInput = screen.getByLabelText(/スラッグ/i);

      await user.type(nameInput, 'テストカテゴリ');
      await user.type(slugInput, 'test');

      const submitButton = screen.getByRole('button', { name: /保存/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockCreateCategory).toHaveBeenCalledWith({
          name: 'テストカテゴリ',
          slug: 'test',
          description: '',
        });
      });
    });

    it('編集モードでdescriptionをnullからundefinedに変換して表示する', async () => {
      const categoryWithNullDescription = {
        id: '1',
        name: 'テクノロジー',
        slug: 'tech',
        description: undefined,
        sortOrder: 1,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockFetchCategories.mockResolvedValue([categoryWithNullDescription]);

      renderCategoryEditPageEditMode('1');

      await waitFor(() => {
        expect(screen.getByLabelText(/説明/i)).toHaveValue('');
      });
    });

    it('バリデーションエラー後に入力を修正するとエラーがクリアされる（name）', async () => {
      const user = userEvent.setup();
      renderCategoryEditPageNewMode();

      // 空の状態で送信してエラーを表示
      const submitButton = screen.getByRole('button', { name: /保存/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/カテゴリ名は必須です/i)).toBeInTheDocument();
      });

      // 入力を追加するとエラーがクリアされる
      const nameInput = screen.getByLabelText(/カテゴリ名/i);
      await user.type(nameInput, 'テスト');

      await waitFor(() => {
        expect(
          screen.queryByText(/カテゴリ名は必須です/i)
        ).not.toBeInTheDocument();
      });
    });

    it('バリデーションエラー後に入力を修正するとエラーがクリアされる（slug）', async () => {
      const user = userEvent.setup();
      renderCategoryEditPageNewMode();

      // 無効なslugを入力
      const nameInput = screen.getByLabelText(/カテゴリ名/i);
      const slugInput = screen.getByLabelText(/スラッグ/i);

      await user.type(nameInput, 'テストカテゴリ');
      await user.type(slugInput, 'invalid_slug!');

      const submitButton = screen.getByRole('button', { name: /保存/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(
          screen.getByText(/スラッグは英数字とハイフンのみ使用できます/i)
        ).toBeInTheDocument();
      });

      // slugを修正するとエラーがクリアされる
      await user.clear(slugInput);
      await user.type(slugInput, 'valid-slug');

      await waitFor(() => {
        expect(
          screen.queryByText(/スラッグは英数字とハイフンのみ使用できます/i)
        ).not.toBeInTheDocument();
      });
    });
  });
});
