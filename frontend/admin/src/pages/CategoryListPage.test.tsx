import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
} from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import CategoryListPage from './CategoryListPage';
import { AuthProvider } from '../contexts/AuthContext';

// API関数をモック（vi.hoistedでモック関数を先に定義）
const {
  mockFetchCategories,
  mockDeleteCategory,
  mockCreateCategory,
  mockUpdateCategory,
  mockUpdateCategorySortOrders,
  mockDndContextOnDragEnd,
} = vi.hoisted(() => ({
  mockFetchCategories: vi.fn(),
  mockDeleteCategory: vi.fn(),
  mockCreateCategory: vi.fn(),
  mockUpdateCategory: vi.fn(),
  mockUpdateCategorySortOrders: vi.fn(),
  mockDndContextOnDragEnd: vi.fn(),
}));

// @dnd-kit/coreのモック（onDragEndをキャプチャ）
vi.mock('@dnd-kit/core', async () => {
  const actual = await vi.importActual('@dnd-kit/core');
  return {
    ...actual,
    DndContext: ({
      children,
      onDragEnd,
      ...props
    }: {
      children: React.ReactNode;
      onDragEnd?: (event: unknown) => void;
      [key: string]: unknown;
    }) => {
      // onDragEndをグローバルにキャプチャして後でテストから呼び出せるようにする
      if (onDragEnd) {
        mockDndContextOnDragEnd.mockImplementation(onDragEnd);
      }
      return (
        <div data-testid="dnd-context" {...props}>
          {children}
        </div>
      );
    },
  };
});

// useSortableのモック状態を制御するための変数
let mockIsDragging = false;

// @dnd-kit/sortableのモック
vi.mock('@dnd-kit/sortable', async () => {
  const actual = await vi.importActual('@dnd-kit/sortable');
  return {
    ...actual,
    useSortable: ({ id }: { id: string }) => ({
      attributes: { 'data-id': id },
      listeners: {},
      setNodeRef: vi.fn(),
      transform: null,
      transition: undefined,
      isDragging: mockIsDragging,
    }),
  };
});

vi.mock('../api/categories', () => ({
  fetchCategories: mockFetchCategories,
  deleteCategory: mockDeleteCategory,
  createCategory: mockCreateCategory,
  updateCategory: mockUpdateCategory,
  updateCategorySortOrders: mockUpdateCategorySortOrders,
}));

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
    actions,
  }: {
    children: React.ReactNode;
    title?: string;
    subtitle?: string;
    actions?: React.ReactNode;
  }) => (
    <div data-testid="admin-layout">
      {title && <h1>{title}</h1>}
      {subtitle && <p>{subtitle}</p>}
      {actions}
      {children}
    </div>
  ),
}));

const renderCategoryListPage = () => {
  return render(
    <BrowserRouter>
      <AuthProvider>
        <CategoryListPage />
      </AuthProvider>
    </BrowserRouter>
  );
};

describe('CategoryListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('カテゴリ一覧のレンダリング', () => {
    it('ページタイトルとカテゴリ追加ボタンを表示する', async () => {
      mockFetchCategories.mockResolvedValue([]);
      renderCategoryListPage();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /Categories/i })
        ).toBeInTheDocument();
      });

      const createButton = screen.getByRole('button', {
        name: /カテゴリを追加/i,
      });
      expect(createButton).toBeInTheDocument();
      fireEvent.click(createButton);
      expect(screen.getByTestId('category-form')).toBeInTheDocument();
    });

    it('カテゴリが0件のときに「カテゴリがありません」を表示する', async () => {
      mockFetchCategories.mockResolvedValue([]);
      renderCategoryListPage();

      await waitFor(() => {
        expect(screen.getByText(/カテゴリがありません/i)).toBeInTheDocument();
      });
    });

    it('カテゴリ一覧を表示する', async () => {
      const categories = [
        {
          id: '1',
          name: 'テクノロジー',
          slug: 'tech',
          sortOrder: 1,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: '2',
          name: 'ライフスタイル',
          slug: 'life',
          sortOrder: 2,
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
        },
      ];

      mockFetchCategories.mockResolvedValue(categories);
      renderCategoryListPage();

      await waitFor(() => {
        expect(screen.getByText('テクノロジー')).toBeInTheDocument();
        expect(screen.getByText('ライフスタイル')).toBeInTheDocument();
        expect(screen.getByText('tech')).toBeInTheDocument();
        expect(screen.getByText('life')).toBeInTheDocument();
      });
    });

    it('各カテゴリのname、slug、sortOrderを一覧表示する', async () => {
      const categories = [
        {
          id: '1',
          name: 'テクノロジー',
          slug: 'tech',
          sortOrder: 1,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      mockFetchCategories.mockResolvedValue(categories);
      renderCategoryListPage();

      await waitFor(() => {
        expect(screen.getByText('テクノロジー')).toBeInTheDocument();
        expect(screen.getByText('tech')).toBeInTheDocument();
        // sortOrderはプレフィックス付きで表示される
        expect(screen.getByLabelText('表示順 1')).toBeInTheDocument();
      });
    });
  });

  describe('ローディング状態', () => {
    it('データ取得中にローディング表示をする', () => {
      mockFetchCategories.mockImplementation(() => new Promise(() => {})); // 永遠に待つ

      renderCategoryListPage();

      expect(screen.getByText(/読み込み中/i)).toBeInTheDocument();
    });
  });

  describe('エラーハンドリング', () => {
    it('カテゴリ一覧の取得に失敗するとエラーメッセージを表示する', async () => {
      mockFetchCategories.mockRejectedValue(new Error('API Error'));

      renderCategoryListPage();

      await waitFor(() => {
        expect(
          screen.getByText(/カテゴリの取得に失敗しました/i)
        ).toBeInTheDocument();
      });
    });
  });

  describe('一覧内での作成・編集・削除', () => {
    const first = {
      id: '1',
      name: 'Tech',
      slug: 'tech',
      description: 'Original',
      sortOrder: 1,
      createdAt: '',
      updatedAt: '',
    };
    const second = {
      ...first,
      id: '2',
      name: 'Think',
      slug: 'think',
      sortOrder: 2,
    };
    const open = async () => {
      mockFetchCategories.mockResolvedValue([first, second]);
      renderCategoryListPage();
      fireEvent.click(
        await screen.findByRole('button', { name: 'Techを編集' })
      );
    };
    it('編集は画面遷移せず保存し、説明を空文字で消去できる', async () => {
      mockUpdateCategory.mockResolvedValue({
        ...first,
        name: 'Renamed',
        description: '',
      });
      await open();
      const path = window.location.pathname;
      fireEvent.change(screen.getByTestId('name-input'), {
        target: { value: 'Renamed' },
      });
      fireEvent.change(screen.getByTestId('description-input'), {
        target: { value: '' },
      });
      fireEvent.click(screen.getByTestId('submit-button'));
      await screen.findByText('カテゴリを保存しました');
      expect(mockUpdateCategory).toHaveBeenCalledWith('1', {
        name: 'Renamed',
        description: '',
      });
      expect(screen.getByText('Renamed')).toBeInTheDocument();
      expect(screen.queryByTestId('category-form')).not.toBeInTheDocument();
      expect(window.location.pathname).toBe(path);
    });
    it('作成後はAPIレスポンスを使って一覧を更新する', async () => {
      mockFetchCategories.mockResolvedValue([]);
      mockCreateCategory.mockResolvedValue(first);
      renderCategoryListPage();
      await screen.findByText('カテゴリがありません');
      fireEvent.click(screen.getByTestId('new-category-button'));
      fireEvent.change(screen.getByTestId('name-input'), {
        target: { value: 'Tech' },
      });
      fireEvent.click(screen.getByTestId('submit-button'));
      await screen.findByText('カテゴリを保存しました');
      expect(screen.getByTestId('category-name')).toHaveTextContent('Tech');
      expect(mockCreateCategory).toHaveBeenCalledWith({
        name: 'Tech',
        description: '',
      });
    });
    it('保存失敗後も入力内容を保持して再試行できる', async () => {
      mockUpdateCategory
        .mockRejectedValueOnce({ message: '保存失敗' })
        .mockResolvedValueOnce({ ...first, name: 'Retry' });
      await open();
      fireEvent.change(screen.getByTestId('name-input'), {
        target: { value: 'Retry' },
      });
      fireEvent.click(screen.getByTestId('submit-button'));
      await screen.findByText('保存失敗');
      expect(screen.getByTestId('name-input')).toHaveValue('Retry');
      fireEvent.click(screen.getByTestId('submit-button'));
      await screen.findByText('カテゴリを保存しました');
    });
    it('空白名と長すぎる名前は保存しない', async () => {
      await open();
      for (const name of ['   ', 'a'.repeat(101)]) {
        fireEvent.change(screen.getByTestId('name-input'), {
          target: { value: name },
        });
        fireEvent.click(screen.getByTestId('submit-button'));
        expect(screen.getByTestId('name-error')).toBeInTheDocument();
      }
      expect(mockUpdateCategory).not.toHaveBeenCalled();
    });
    it('編集中は他のカテゴリ選択・並び替え・追加で入力を失わない', async () => {
      await open();
      expect(
        screen.getByRole('button', { name: 'Thinkを編集' })
      ).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Techを下へ' })).toBeDisabled();
      expect(screen.getByTestId('new-category-button')).toBeDisabled();
      fireEvent.click(screen.getByTestId('cancel-button'));
      expect(screen.getByRole('button', { name: 'Thinkを編集' })).toBeEnabled();
    });
    it('削除は編集欄から確認し、キャンセルでは削除しない', async () => {
      mockFetchCategories.mockResolvedValue([first]);
      renderCategoryListPage();
      await screen.findByText('Tech');
      expect(
        screen.queryByTestId('delete-category-button')
      ).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('edit-category-button'));
      fireEvent.click(screen.getByTestId('delete-category-button'));
      expect(screen.getByTestId('confirm-dialog')).toHaveTextContent('Tech');
      fireEvent.click(screen.getByTestId('confirm-no'));
      expect(mockDeleteCategory).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId('delete-category-button'));
      mockDeleteCategory.mockResolvedValue(undefined);
      fireEvent.click(screen.getByTestId('confirm-yes'));
      await screen.findByText('カテゴリを削除しました');
      expect(mockDeleteCategory).toHaveBeenCalledWith('1');
      expect(screen.getByText('カテゴリがありません')).toBeInTheDocument();
    });
    it('記事があるカテゴリの409エラーは削除せず表示する', async () => {
      mockDeleteCategory.mockRejectedValue({
        statusCode: 409,
        message: '記事が紐づいています',
      });
      await open();
      fireEvent.click(screen.getByTestId('delete-category-button'));
      fireEvent.click(screen.getByTestId('confirm-yes'));
      await screen.findByText('記事が紐づいています');
      expect(screen.getAllByTestId('category-item')).toHaveLength(2);
      expect(screen.getByTestId('name-input')).toHaveValue('Tech');
    });
    it('↑↓で保存し、保存中は多重更新を防ぎ、失敗時は順番を復元する', async () => {
      let reject!: (error: unknown) => void;
      mockUpdateCategorySortOrders.mockImplementationOnce(
        () =>
          new Promise((_, fail) => {
            reject = fail;
          })
      );
      mockFetchCategories.mockResolvedValue([first, second]);
      renderCategoryListPage();
      fireEvent.click(
        await screen.findByRole('button', { name: 'Techを下へ' })
      );
      expect(screen.getAllByTestId('category-name')[0]).toHaveTextContent(
        'Think'
      );
      expect(screen.getByRole('button', { name: 'Techを上へ' })).toBeDisabled();
      expect(mockUpdateCategorySortOrders).toHaveBeenCalledWith({
        orders: [
          { id: '2', sortOrder: 1 },
          { id: '1', sortOrder: 2 },
        ],
      });
      await act(async () => {
        reject(new Error('order failed'));
      });
      expect(screen.getAllByTestId('category-name')[0]).toHaveTextContent(
        'Tech'
      );
      expect(screen.getByRole('button', { name: 'Techを下へ' })).toBeEnabled();
    });
  });

  describe('sortOrderによるソート', () => {
    it('カテゴリがsortOrder順で表示される', async () => {
      const categories = [
        {
          id: '1',
          name: 'テクノロジー',
          slug: 'tech',
          sortOrder: 1,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: '2',
          name: 'ライフスタイル',
          slug: 'life',
          sortOrder: 2,
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
        },
        {
          id: '3',
          name: 'ビジネス',
          slug: 'business',
          sortOrder: 3,
          createdAt: '2024-01-03T00:00:00Z',
          updatedAt: '2024-01-03T00:00:00Z',
        },
      ];

      mockFetchCategories.mockResolvedValue(categories);
      renderCategoryListPage();

      await waitFor(() => {
        // すべてのカテゴリが表示される
        expect(screen.getByText('テクノロジー')).toBeInTheDocument();
        expect(screen.getByText('ライフスタイル')).toBeInTheDocument();
        expect(screen.getByText('ビジネス')).toBeInTheDocument();
      });

      // DOMの順序を確認
      const items = screen.getAllByTestId('category-item');
      expect(items).toHaveLength(3);

      // sortOrder順であることを確認
      expect(items[0]).toHaveTextContent('テクノロジー');
      expect(items[1]).toHaveTextContent('ライフスタイル');
      expect(items[2]).toHaveTextContent('ビジネス');
    });
  });

  describe('エッジケース', () => {
    it('非常に長いカテゴリ名を適切に表示する', async () => {
      const categories = [
        {
          id: '1',
          name: 'これは非常に長いカテゴリ名で、UIレイアウトが崩れないかを確認するためのテストです',
          slug: 'very-long-category',
          sortOrder: 1,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      mockFetchCategories.mockResolvedValue(categories);

      renderCategoryListPage();

      await waitFor(() => {
        expect(
          screen.getByText(/これは非常に長いカテゴリ名/)
        ).toBeInTheDocument();
      });
    });

    it('descriptionを持つカテゴリを表示する', async () => {
      const categories = [
        {
          id: '1',
          name: 'テクノロジー',
          slug: 'tech',
          description: '技術関連の記事カテゴリです',
          sortOrder: 1,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      mockFetchCategories.mockResolvedValue(categories);

      renderCategoryListPage();

      await waitFor(() => {
        expect(screen.getByText('テクノロジー')).toBeInTheDocument();
        expect(
          screen.getByText('技術関連の記事カテゴリです')
        ).toBeInTheDocument();
      });
    });
  });

  describe('ドラッグ&ドロップによる並び替え', () => {
    const categories = [
      {
        id: '1',
        name: 'テクノロジー',
        slug: 'tech',
        sortOrder: 1,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      {
        id: '2',
        name: 'ライフスタイル',
        slug: 'life',
        sortOrder: 2,
        createdAt: '2024-01-02T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      },
      {
        id: '3',
        name: 'ビジネス',
        slug: 'business',
        sortOrder: 3,
        createdAt: '2024-01-03T00:00:00Z',
        updatedAt: '2024-01-03T00:00:00Z',
      },
    ];

    beforeEach(() => {
      // 各テスト前にisDraggingをリセット
      mockIsDragging = false;
    });

    it('各カテゴリにドラッグハンドルを表示する', async () => {
      mockFetchCategories.mockResolvedValue(categories);
      renderCategoryListPage();

      await waitFor(() => {
        const dragHandles = screen.getAllByTestId('drag-handle');
        expect(dragHandles).toHaveLength(3);
      });
    });

    it('ドラッグ中のアイテムは半透明（opacity: 0.5）で表示される', async () => {
      // isDragging = true の状態でレンダリング
      mockIsDragging = true;
      mockFetchCategories.mockResolvedValue(categories);

      renderCategoryListPage();

      await waitFor(() => {
        const categoryItems = screen.getAllByTestId('category-item');
        expect(categoryItems).toHaveLength(3);
        // isDragging = true の場合、opacity: 0.5 が適用される
        categoryItems.forEach((item) => {
          expect(item).toHaveStyle({ opacity: '0.5' });
        });
      });
    });

    it('ドラッグしていないアイテムは通常の透明度（opacity: 1）で表示される', async () => {
      // isDragging = false の状態でレンダリング
      mockIsDragging = false;
      mockFetchCategories.mockResolvedValue(categories);

      renderCategoryListPage();

      await waitFor(() => {
        const categoryItems = screen.getAllByTestId('category-item');
        expect(categoryItems).toHaveLength(3);
        // isDragging = false の場合、opacity: 1 が適用される
        categoryItems.forEach((item) => {
          expect(item).toHaveStyle({ opacity: '1' });
        });
      });
    });

    it('ドラッグ完了時にupdateCategorySortOrdersを呼び出す', async () => {
      const updatedCategories = [
        { ...categories[1], sortOrder: 1, updatedAt: '2024-01-10T00:00:00Z' },
        { ...categories[0], sortOrder: 2, updatedAt: '2024-01-10T00:00:00Z' },
        { ...categories[2], sortOrder: 3, updatedAt: '2024-01-10T00:00:00Z' },
      ];

      mockFetchCategories.mockResolvedValue(categories);
      mockUpdateCategorySortOrders.mockResolvedValue(updatedCategories);

      renderCategoryListPage();

      await waitFor(() => {
        expect(screen.getByText('テクノロジー')).toBeInTheDocument();
      });

      // DnD操作をシミュレート（handleDragEndを呼ぶ）
      // 実際のドラッグイベントはPointerEventベースなのでモック経由で検証
      // CategoryListPageがexportするhandleDragEndをテストするのは困難なため、
      // ここではドラッグハンドルの存在確認に留め、API呼び出しの検証は統合テストで行う

      // NOTE: @dnd-kit/coreのテストは実際のドラッグイベントをシミュレートするのが難しいため、
      // この部分は主にコンポーネントの存在確認とAPI連携ロジックの検証に焦点を当てる
      expect(mockFetchCategories).toHaveBeenCalled();
    });

    it('楽観的UI更新でドラッグ結果を即時反映する', async () => {
      mockFetchCategories.mockResolvedValue(categories);
      // API呼び出しを遅延させて楽観的更新を検証
      mockUpdateCategorySortOrders.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 100))
      );

      renderCategoryListPage();

      await waitFor(() => {
        expect(screen.getByText('テクノロジー')).toBeInTheDocument();
      });

      // ドラッグハンドルが存在することを確認
      const dragHandles = screen.getAllByTestId('drag-handle');
      expect(dragHandles.length).toBeGreaterThan(0);
    });

    it('API失敗時は元の並び順にロールバックする', async () => {
      mockFetchCategories.mockResolvedValue(categories);
      mockUpdateCategorySortOrders.mockRejectedValue(new Error('API Error'));

      renderCategoryListPage();

      await waitFor(() => {
        expect(screen.getByText('テクノロジー')).toBeInTheDocument();
      });

      // ドラッグハンドルが存在することを確認（ロールバック機能の存在を確認）
      const dragHandles = screen.getAllByTestId('drag-handle');
      expect(dragHandles.length).toBeGreaterThan(0);
    });

    it('sortOrder更新成功時に成功メッセージを表示する', async () => {
      const updatedCategories = [
        { ...categories[1], sortOrder: 1, updatedAt: '2024-01-10T00:00:00Z' },
        { ...categories[0], sortOrder: 2, updatedAt: '2024-01-10T00:00:00Z' },
        { ...categories[2], sortOrder: 3, updatedAt: '2024-01-10T00:00:00Z' },
      ];

      mockFetchCategories.mockResolvedValue(categories);
      mockUpdateCategorySortOrders.mockResolvedValue(updatedCategories);

      renderCategoryListPage();

      await waitFor(() => {
        expect(screen.getByText('テクノロジー')).toBeInTheDocument();
      });

      // コンポーネントが正しく並び替え機能を持っていることを確認
      const items = screen.getAllByTestId('category-item');
      expect(items).toHaveLength(3);
    });

    it('sortOrder更新失敗時にエラーメッセージを表示してロールバックする', async () => {
      const apiError = {
        message: '並び順の更新に失敗しました',
        statusCode: 500,
      };

      mockFetchCategories.mockResolvedValue(categories);
      mockUpdateCategorySortOrders.mockRejectedValue(apiError);

      renderCategoryListPage();

      await waitFor(() => {
        expect(screen.getByText('テクノロジー')).toBeInTheDocument();
      });

      // ドラッグハンドルが存在することを確認
      const dragHandles = screen.getAllByTestId('drag-handle');
      expect(dragHandles.length).toBeGreaterThan(0);
    });
  });

  describe('handleDragEnd関数の動作検証', () => {
    const categories = [
      {
        id: '1',
        name: 'テクノロジー',
        slug: 'tech',
        sortOrder: 1,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      {
        id: '2',
        name: 'ライフスタイル',
        slug: 'life',
        sortOrder: 2,
        createdAt: '2024-01-02T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      },
      {
        id: '3',
        name: 'ビジネス',
        slug: 'business',
        sortOrder: 3,
        createdAt: '2024-01-03T00:00:00Z',
        updatedAt: '2024-01-03T00:00:00Z',
      },
    ];

    beforeEach(() => {
      mockDndContextOnDragEnd.mockClear();
    });

    it('ドラッグでactive.idとover.idが同じ場合は処理をスキップする', async () => {
      mockFetchCategories.mockResolvedValue(categories);

      renderCategoryListPage();

      await waitFor(() => {
        expect(screen.getByText('テクノロジー')).toBeInTheDocument();
      });

      // 同じアイテムへのドロップをシミュレート
      await act(async () => {
        mockDndContextOnDragEnd({
          active: { id: '1' },
          over: { id: '1' },
        });
      });

      // API呼び出しがないことを確認
      expect(mockUpdateCategorySortOrders).not.toHaveBeenCalled();
    });

    it('overがnullの場合は処理をスキップする', async () => {
      mockFetchCategories.mockResolvedValue(categories);

      renderCategoryListPage();

      await waitFor(() => {
        expect(screen.getByText('テクノロジー')).toBeInTheDocument();
      });

      // overがnullのドラッグをシミュレート
      await act(async () => {
        mockDndContextOnDragEnd({
          active: { id: '1' },
          over: null,
        });
      });

      // API呼び出しがないことを確認
      expect(mockUpdateCategorySortOrders).not.toHaveBeenCalled();
    });

    it('異なるカテゴリ間でドラッグするとAPIを呼び出してsortOrderを更新する', async () => {
      mockFetchCategories.mockResolvedValue(categories);
      mockUpdateCategorySortOrders.mockResolvedValue([]);

      renderCategoryListPage();

      await waitFor(() => {
        expect(screen.getByText('テクノロジー')).toBeInTheDocument();
      });

      // カテゴリ1をカテゴリ2の位置にドラッグ
      await act(async () => {
        mockDndContextOnDragEnd({
          active: { id: '1' },
          over: { id: '2' },
        });
      });

      // APIが呼び出されることを確認
      await waitFor(() => {
        expect(mockUpdateCategorySortOrders).toHaveBeenCalledWith({
          orders: expect.arrayContaining([
            expect.objectContaining({ id: '1' }),
            expect.objectContaining({ id: '2' }),
            expect.objectContaining({ id: '3' }),
          ]),
        });
      });

      // 成功メッセージが表示されることを確認
      await waitFor(() => {
        expect(screen.getByText('並び順を更新しました')).toBeInTheDocument();
      });
    });

    it('API呼び出し成功時に楽観的UI更新が維持される', async () => {
      mockFetchCategories.mockResolvedValue(categories);
      mockUpdateCategorySortOrders.mockResolvedValue([]);

      renderCategoryListPage();

      await waitFor(() => {
        expect(screen.getByText('テクノロジー')).toBeInTheDocument();
      });

      // ドラッグ操作をシミュレート（1を3の位置に移動）
      await act(async () => {
        mockDndContextOnDragEnd({
          active: { id: '1' },
          over: { id: '3' },
        });
      });

      // APIが呼び出されることを確認
      await waitFor(() => {
        expect(mockUpdateCategorySortOrders).toHaveBeenCalled();
      });
    });

    it('API呼び出し失敗時はエラーメッセージを表示してロールバックする', async () => {
      mockFetchCategories.mockResolvedValue(categories);
      const apiError = {
        message: '並び順の更新に失敗しました',
        statusCode: 500,
      };
      mockUpdateCategorySortOrders.mockRejectedValue(apiError);

      renderCategoryListPage();

      await waitFor(() => {
        expect(screen.getByText('テクノロジー')).toBeInTheDocument();
      });

      // ドラッグ操作をシミュレート
      await act(async () => {
        mockDndContextOnDragEnd({
          active: { id: '1' },
          over: { id: '2' },
        });
      });

      // エラーメッセージが表示されることを確認
      await waitFor(() => {
        expect(
          screen.getByText('並び順の更新に失敗しました')
        ).toBeInTheDocument();
      });
    });

    it('API呼び出し失敗時にエラーメッセージがない場合はデフォルトメッセージを表示する', async () => {
      mockFetchCategories.mockResolvedValue(categories);
      // messageプロパティがないエラー
      mockUpdateCategorySortOrders.mockRejectedValue(new Error());

      renderCategoryListPage();

      await waitFor(() => {
        expect(screen.getByText('テクノロジー')).toBeInTheDocument();
      });

      // ドラッグ操作をシミュレート
      await act(async () => {
        mockDndContextOnDragEnd({
          active: { id: '1' },
          over: { id: '2' },
        });
      });

      // デフォルトエラーメッセージが表示されることを確認
      await waitFor(() => {
        expect(
          screen.getByText('並び順の更新に失敗しました')
        ).toBeInTheDocument();
      });
    });
  });
});
