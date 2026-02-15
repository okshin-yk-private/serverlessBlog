import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import MindmapListPage from './MindmapListPage';
import * as mindmapsApi from '../api/mindmaps';
import { AuthProvider } from '../contexts/AuthContext';

// API関数をモック
vi.mock('../api/mindmaps', () => ({
  createMindmap: vi.fn(),
  getMindmap: vi.fn(),
  listMindmaps: vi.fn(),
  updateMindmap: vi.fn(),
  deleteMindmap: vi.fn(),
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

const mockListMindmaps = mindmapsApi.listMindmaps as ReturnType<typeof vi.fn>;
const mockDeleteMindmap = mindmapsApi.deleteMindmap as ReturnType<typeof vi.fn>;

const renderMindmapListPage = () => {
  return render(
    <BrowserRouter>
      <AuthProvider>
        <MindmapListPage />
      </AuthProvider>
    </BrowserRouter>
  );
};

describe('MindmapListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('マインドマップ一覧のレンダリング', () => {
    it('ページタイトルと新規作成ボタンを表示する', async () => {
      mockListMindmaps.mockResolvedValue({ items: [], count: 0 });
      renderMindmapListPage();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /Mindmaps/i })
        ).toBeInTheDocument();
      });

      const createButton = screen.getByRole('link', { name: /新規作成/i });
      expect(createButton).toBeInTheDocument();
      expect(createButton).toHaveAttribute('href', '/mindmaps/new');
    });

    it('公開済みと下書きのタブを表示する', async () => {
      mockListMindmaps.mockResolvedValue({ items: [], count: 0 });
      renderMindmapListPage();

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /公開済み/i })
        ).toBeInTheDocument();
        expect(
          screen.getByRole('button', { name: /下書き/i })
        ).toBeInTheDocument();
      });
    });

    it('マインドマップが0件のときに「マインドマップがありません」を表示する', async () => {
      mockListMindmaps.mockResolvedValue({ items: [], count: 0 });
      renderMindmapListPage();

      await waitFor(() => {
        expect(
          screen.getByText(/マインドマップがありません/i)
        ).toBeInTheDocument();
      });
    });

    it('マインドマップ一覧を表示する（タイトル、公開ステータス、作成日時）', async () => {
      const mindmaps = [
        {
          id: '1',
          title: 'Mindmap 1',
          nodes: { id: 'root', text: 'Root', children: [] },
          publishStatus: 'published' as const,
          authorId: 'user1',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: '2',
          title: 'Mindmap 2',
          nodes: { id: 'root', text: 'Root', children: [] },
          publishStatus: 'published' as const,
          authorId: 'user1',
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
        },
      ];

      mockListMindmaps.mockResolvedValue({ items: mindmaps, count: 2 });
      renderMindmapListPage();

      await waitFor(() => {
        expect(screen.getByText('Mindmap 1')).toBeInTheDocument();
        expect(screen.getByText('Mindmap 2')).toBeInTheDocument();
        expect(screen.getByText('2024-01-01')).toBeInTheDocument();
        expect(screen.getByText('2024-01-02')).toBeInTheDocument();
      });
    });
  });

  describe('フィルタリング', () => {
    it('初期表示時に全件を取得する', async () => {
      mockListMindmaps.mockResolvedValue({ items: [], count: 0 });
      renderMindmapListPage();

      await waitFor(() => {
        expect(mockListMindmaps).toHaveBeenCalledWith({ limit: 100 });
      });
    });

    it('公開済みタブをクリックするとpublishedのみ表示する', async () => {
      const allMindmaps = [
        {
          id: '1',
          title: 'Published MM',
          nodes: { id: 'root', text: 'Root', children: [] },
          publishStatus: 'published' as const,
          authorId: 'user1',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: '2',
          title: 'Draft MM',
          nodes: { id: 'root', text: 'Root', children: [] },
          publishStatus: 'draft' as const,
          authorId: 'user1',
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
        },
      ];

      mockListMindmaps.mockResolvedValue({ items: allMindmaps, count: 2 });
      renderMindmapListPage();

      await waitFor(() => {
        expect(screen.getByText('Published MM')).toBeInTheDocument();
        expect(screen.getByText('Draft MM')).toBeInTheDocument();
      });

      // 公開済みタブをクリック
      fireEvent.click(screen.getByTestId('publish-filter-tab'));

      await waitFor(() => {
        expect(screen.getByText('Published MM')).toBeInTheDocument();
        expect(screen.queryByText('Draft MM')).not.toBeInTheDocument();
      });
    });

    it('下書きタブをクリックするとdraftのみ表示する', async () => {
      const allMindmaps = [
        {
          id: '1',
          title: 'Published MM',
          nodes: { id: 'root', text: 'Root', children: [] },
          publishStatus: 'published' as const,
          authorId: 'user1',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: '2',
          title: 'Draft MM',
          nodes: { id: 'root', text: 'Root', children: [] },
          publishStatus: 'draft' as const,
          authorId: 'user1',
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
        },
      ];

      mockListMindmaps.mockResolvedValue({ items: allMindmaps, count: 2 });
      renderMindmapListPage();

      await waitFor(() => {
        expect(screen.getByText('Published MM')).toBeInTheDocument();
      });

      // 下書きタブをクリック
      fireEvent.click(screen.getByTestId('draft-filter-tab'));

      await waitFor(() => {
        expect(screen.getByText('Draft MM')).toBeInTheDocument();
        expect(screen.queryByText('Published MM')).not.toBeInTheDocument();
      });
    });

    it('タイトルで検索できる', async () => {
      const mindmaps = [
        {
          id: '1',
          title: 'React Architecture',
          nodes: { id: 'root', text: 'Root', children: [] },
          publishStatus: 'published' as const,
          authorId: 'user1',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: '2',
          title: 'Vue.js Design',
          nodes: { id: 'root', text: 'Root', children: [] },
          publishStatus: 'published' as const,
          authorId: 'user1',
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
        },
      ];

      mockListMindmaps.mockResolvedValue({ items: mindmaps, count: 2 });
      renderMindmapListPage();

      await waitFor(() => {
        expect(screen.getByText('React Architecture')).toBeInTheDocument();
        expect(screen.getByText('Vue.js Design')).toBeInTheDocument();
      });

      const searchInput = screen.getByTestId('admin-search-input');
      fireEvent.change(searchInput, { target: { value: 'React' } });

      await waitFor(() => {
        expect(screen.getByText('React Architecture')).toBeInTheDocument();
        expect(screen.queryByText('Vue.js Design')).not.toBeInTheDocument();
      });
    });

    it('検索結果が0件の場合にメッセージを表示する', async () => {
      const mindmaps = [
        {
          id: '1',
          title: 'React Architecture',
          nodes: { id: 'root', text: 'Root', children: [] },
          publishStatus: 'published' as const,
          authorId: 'user1',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      mockListMindmaps.mockResolvedValue({ items: mindmaps, count: 1 });
      renderMindmapListPage();

      await waitFor(() => {
        expect(screen.getByText('React Architecture')).toBeInTheDocument();
      });

      const searchInput = screen.getByTestId('admin-search-input');
      fireEvent.change(searchInput, { target: { value: 'Angular' } });

      await waitFor(() => {
        expect(
          screen.getByText('検索結果が見つかりません')
        ).toBeInTheDocument();
      });
    });
  });

  describe('CRUD操作', () => {
    it('編集リンクが正しいパスを持つ', async () => {
      const mindmaps = [
        {
          id: 'mm-1',
          title: 'Test Mindmap',
          nodes: { id: 'root', text: 'Root', children: [] },
          publishStatus: 'published' as const,
          authorId: 'user1',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      mockListMindmaps.mockResolvedValue({ items: mindmaps, count: 1 });
      renderMindmapListPage();

      await waitFor(() => {
        const editLink = screen.getByRole('link', { name: /編集/i });
        expect(editLink).toBeInTheDocument();
        expect(editLink).toHaveAttribute('href', '/mindmaps/edit/mm-1');
      });
    });

    it('削除ボタンをクリックすると確認ダイアログを表示する', async () => {
      const mindmaps = [
        {
          id: '1',
          title: 'Test Mindmap',
          nodes: { id: 'root', text: 'Root', children: [] },
          publishStatus: 'published' as const,
          authorId: 'user1',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      mockListMindmaps.mockResolvedValue({ items: mindmaps, count: 1 });
      renderMindmapListPage();

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /削除/i })
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /削除/i }));

      await waitFor(() => {
        expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
      });
    });

    it('削除を確認するとマインドマップを削除してリストを更新する', async () => {
      const mindmaps = [
        {
          id: '1',
          title: 'Test Mindmap',
          nodes: { id: 'root', text: 'Root', children: [] },
          publishStatus: 'published' as const,
          authorId: 'user1',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      mockListMindmaps.mockResolvedValueOnce({ items: mindmaps, count: 1 });
      mockListMindmaps.mockResolvedValueOnce({ items: [], count: 0 });
      mockDeleteMindmap.mockResolvedValue(undefined);

      renderMindmapListPage();

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /削除/i })
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /削除/i }));

      await waitFor(() => {
        expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('confirm-yes'));

      await waitFor(() => {
        expect(mockDeleteMindmap).toHaveBeenCalledWith('1');
        expect(mockListMindmaps).toHaveBeenCalledTimes(2);
      });
    });

    it('削除をキャンセルすると何も変更しない', async () => {
      const mindmaps = [
        {
          id: '1',
          title: 'Test Mindmap',
          nodes: { id: 'root', text: 'Root', children: [] },
          publishStatus: 'published' as const,
          authorId: 'user1',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      mockListMindmaps.mockResolvedValue({ items: mindmaps, count: 1 });
      renderMindmapListPage();

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /削除/i })
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /削除/i }));

      await waitFor(() => {
        expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('confirm-no'));

      await waitFor(() => {
        expect(mockDeleteMindmap).not.toHaveBeenCalled();
      });
      expect(screen.getByText('Test Mindmap')).toBeInTheDocument();
    });
  });

  describe('エラーハンドリングとユーザーフィードバック', () => {
    it('一覧取得に失敗するとエラーメッセージを表示する', async () => {
      mockListMindmaps.mockRejectedValue(new Error('API Error'));

      renderMindmapListPage();

      await waitFor(() => {
        expect(
          screen.getByText(/マインドマップの取得に失敗しました/i)
        ).toBeInTheDocument();
      });
    });

    it('削除に失敗するとエラーメッセージを表示する', async () => {
      const mindmaps = [
        {
          id: '1',
          title: 'Test Mindmap',
          nodes: { id: 'root', text: 'Root', children: [] },
          publishStatus: 'published' as const,
          authorId: 'user1',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      mockListMindmaps.mockResolvedValue({ items: mindmaps, count: 1 });
      mockDeleteMindmap.mockRejectedValue(new Error('Delete failed'));

      renderMindmapListPage();

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /削除/i })
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /削除/i }));

      await waitFor(() => {
        expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('confirm-yes'));

      await waitFor(() => {
        expect(
          screen.getByText(/マインドマップの削除に失敗しました/i)
        ).toBeInTheDocument();
      });
    });

    it('削除成功時に成功メッセージを表示する', async () => {
      const mindmaps = [
        {
          id: '1',
          title: 'Test Mindmap',
          nodes: { id: 'root', text: 'Root', children: [] },
          publishStatus: 'published' as const,
          authorId: 'user1',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      mockListMindmaps.mockResolvedValueOnce({ items: mindmaps, count: 1 });
      mockListMindmaps.mockResolvedValueOnce({ items: [], count: 0 });
      mockDeleteMindmap.mockResolvedValue(undefined);

      renderMindmapListPage();

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /削除/i })
        ).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /削除/i }));

      await waitFor(() => {
        expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('confirm-yes'));

      await waitFor(() => {
        expect(
          screen.getByText(/マインドマップを削除しました/i)
        ).toBeInTheDocument();
      });
    });
  });

  describe('ローディングとページネーション', () => {
    it('データ取得中にローディング表示をする', () => {
      mockListMindmaps.mockImplementation(() => new Promise(() => {}));
      renderMindmapListPage();

      expect(screen.getByTestId('mindmap-list-skeleton')).toBeInTheDocument();
    });

    it('nextTokenが存在する場合、次へボタンを表示する', async () => {
      const mindmaps = [
        {
          id: '1',
          title: 'Mindmap 1',
          nodes: { id: 'root', text: 'Root', children: [] },
          publishStatus: 'published' as const,
          authorId: 'user1',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      mockListMindmaps.mockResolvedValue({
        items: mindmaps,
        count: 100,
        nextToken: 'token123',
      });

      renderMindmapListPage();

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /次へ/i })
        ).toBeInTheDocument();
      });
    });

    it('次へボタンをクリックすると次のページを取得する', async () => {
      const page1 = [
        {
          id: '1',
          title: 'Mindmap 1',
          nodes: { id: 'root', text: 'Root', children: [] },
          publishStatus: 'published' as const,
          authorId: 'user1',
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      const page2 = [
        {
          id: '2',
          title: 'Mindmap 2',
          nodes: { id: 'root', text: 'Root', children: [] },
          publishStatus: 'published' as const,
          authorId: 'user1',
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
        },
      ];

      mockListMindmaps.mockResolvedValueOnce({
        items: page1,
        count: 2,
        nextToken: 'token123',
      });
      mockListMindmaps.mockResolvedValueOnce({
        items: page2,
        count: 2,
      });

      renderMindmapListPage();

      await waitFor(() => {
        expect(screen.getByText('Mindmap 1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /次へ/i }));

      await waitFor(() => {
        expect(mockListMindmaps).toHaveBeenCalledWith(
          expect.objectContaining({ nextToken: 'token123' })
        );
        expect(screen.getByText('Mindmap 2')).toBeInTheDocument();
      });
    });
  });
});
