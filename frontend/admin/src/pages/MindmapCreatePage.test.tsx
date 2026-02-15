import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import MindmapCreatePage from './MindmapCreatePage';
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

// MindmapEditorをモック（ReactFlowの依存を回避）
vi.mock('../components/MindmapEditor', () => ({
  MindmapEditor: ({
    rootNode,
    onNodesChange,
    selectedNodeId,
    onNodeSelect,
  }: {
    rootNode: mindmapsApi.MindmapNode;
    onNodesChange?: (rootNode: mindmapsApi.MindmapNode) => void;
    selectedNodeId?: string | null;
    onNodeSelect?: (nodeId: string | null) => void;
  }) => (
    <div data-testid="mindmap-editor">
      <span data-testid="editor-root-text">{rootNode.text}</span>
      <span data-testid="editor-node-count">{JSON.stringify(rootNode)}</span>
      <button
        data-testid="mock-add-child"
        onClick={() => {
          if (onNodesChange) {
            onNodesChange({
              ...rootNode,
              children: [
                ...rootNode.children,
                { id: 'new-child', text: 'New Node', children: [] },
              ],
            });
          }
        }}
      >
        Mock Add Child
      </button>
    </div>
  ),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockCreateMindmap = mindmapsApi.createMindmap as ReturnType<typeof vi.fn>;

const renderPage = () => {
  return render(
    <BrowserRouter>
      <AuthProvider>
        <MindmapCreatePage />
      </AuthProvider>
    </BrowserRouter>
  );
};

describe('MindmapCreatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('レンダリング', () => {
    it('ページタイトルが表示される', () => {
      renderPage();
      expect(screen.getByText('New Mindmap')).toBeInTheDocument();
    });

    it('タイトル入力フィールドが表示される', () => {
      renderPage();
      expect(screen.getByLabelText(/タイトル/i)).toBeInTheDocument();
    });

    it('公開ステータス選択が表示される', () => {
      renderPage();
      expect(screen.getByLabelText(/公開状態/i)).toBeInTheDocument();
    });

    it('デフォルトで公開状態は「draft」である', () => {
      renderPage();
      const statusSelect = screen.getByLabelText(
        /公開状態/i
      ) as HTMLSelectElement;
      expect(statusSelect.value).toBe('draft');
    });

    it('マインドマップエディタが表示される', () => {
      renderPage();
      expect(screen.getByTestId('mindmap-editor')).toBeInTheDocument();
    });

    it('保存ボタンとキャンセルボタンが表示される', () => {
      renderPage();
      expect(screen.getByRole('button', { name: /保存/i })).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /キャンセル/i })
      ).toBeInTheDocument();
    });
  });

  describe('保存機能', () => {
    it('タイトルを入力して保存するとcreateMindmapが呼ばれる', async () => {
      const user = userEvent.setup();
      mockCreateMindmap.mockResolvedValue({
        id: 'new-id',
        title: 'テストマインドマップ',
        nodes: { id: 'root', text: 'Central Idea', children: [] },
        publishStatus: 'draft',
        authorId: 'user1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      renderPage();

      await user.type(
        screen.getByLabelText(/タイトル/i),
        'テストマインドマップ'
      );
      await user.click(screen.getByRole('button', { name: /保存/i }));

      await waitFor(() => {
        expect(mockCreateMindmap).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'テストマインドマップ',
            publishStatus: 'draft',
          })
        );
      });
    });

    it('保存成功後は/mindmapsへナビゲートする', async () => {
      const user = userEvent.setup();
      mockCreateMindmap.mockResolvedValue({
        id: 'new-id',
        title: 'Test',
        nodes: { id: 'root', text: 'Central Idea', children: [] },
        publishStatus: 'draft',
        authorId: 'user1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      renderPage();

      await user.type(screen.getByLabelText(/タイトル/i), 'Test');
      await user.click(screen.getByRole('button', { name: /保存/i }));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/mindmaps');
      });
    });

    it('保存時にnodes（MindmapNodeツリー）をJSON化してAPIに送信する', async () => {
      const user = userEvent.setup();
      mockCreateMindmap.mockResolvedValue({
        id: 'new-id',
        title: 'Test',
        nodes: { id: 'root', text: 'Central Idea', children: [] },
        publishStatus: 'draft',
        authorId: 'user1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      renderPage();

      await user.type(screen.getByLabelText(/タイトル/i), 'Test');
      await user.click(screen.getByRole('button', { name: /保存/i }));

      await waitFor(() => {
        expect(mockCreateMindmap).toHaveBeenCalledWith(
          expect.objectContaining({
            nodes: expect.objectContaining({
              id: expect.any(String),
              text: 'Central Idea',
              children: expect.any(Array),
            }),
          })
        );
      });
    });
  });

  describe('公開ステータス切替', () => {
    it('公開ステータスをpublishedに変更して保存できる', async () => {
      const user = userEvent.setup();
      mockCreateMindmap.mockResolvedValue({
        id: 'new-id',
        title: 'Test',
        nodes: { id: 'root', text: 'Central Idea', children: [] },
        publishStatus: 'published',
        authorId: 'user1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      renderPage();

      await user.type(screen.getByLabelText(/タイトル/i), 'Test');
      await user.selectOptions(screen.getByLabelText(/公開状態/i), 'published');
      await user.click(screen.getByRole('button', { name: /保存/i }));

      await waitFor(() => {
        expect(mockCreateMindmap).toHaveBeenCalledWith(
          expect.objectContaining({
            publishStatus: 'published',
          })
        );
      });
    });
  });

  describe('バリデーション', () => {
    it('タイトルが空の場合はバリデーションエラーが表示され保存されない', async () => {
      const user = userEvent.setup();
      renderPage();

      await user.click(screen.getByRole('button', { name: /保存/i }));

      await waitFor(() => {
        expect(screen.getByText('タイトルは必須です')).toBeInTheDocument();
      });

      expect(mockCreateMindmap).not.toHaveBeenCalled();
    });
  });

  describe('エラーハンドリング', () => {
    it('保存失敗時はエラーメッセージが表示される', async () => {
      const user = userEvent.setup();
      mockCreateMindmap.mockRejectedValue(new Error('作成エラー'));

      renderPage();

      await user.type(screen.getByLabelText(/タイトル/i), 'Test');
      await user.click(screen.getByRole('button', { name: /保存/i }));

      await waitFor(() => {
        expect(
          screen.getByText('マインドマップの作成に失敗しました')
        ).toBeInTheDocument();
      });

      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('保存エラー後に再試行できる', async () => {
      const user = userEvent.setup();
      mockCreateMindmap
        .mockRejectedValueOnce(new Error('作成エラー'))
        .mockResolvedValueOnce({
          id: 'new-id',
          title: 'Test',
          nodes: { id: 'root', text: 'Central Idea', children: [] },
          publishStatus: 'draft',
          authorId: 'user1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

      renderPage();

      await user.type(screen.getByLabelText(/タイトル/i), 'Test');
      await user.click(screen.getByRole('button', { name: /保存/i }));

      await waitFor(() => {
        expect(
          screen.getByText('マインドマップの作成に失敗しました')
        ).toBeInTheDocument();
      });

      // 再試行
      await user.click(screen.getByRole('button', { name: /保存/i }));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/mindmaps');
      });
    });
  });

  describe('キャンセル機能', () => {
    it('キャンセルボタンをクリックすると/mindmapsへナビゲートする', async () => {
      const user = userEvent.setup();
      renderPage();

      await user.click(screen.getByRole('button', { name: /キャンセル/i }));

      expect(mockNavigate).toHaveBeenCalledWith('/mindmaps');
      expect(mockCreateMindmap).not.toHaveBeenCalled();
    });
  });
});
