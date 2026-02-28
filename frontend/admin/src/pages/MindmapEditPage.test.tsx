import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import MindmapEditPage from './MindmapEditPage';
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

// AdminLayoutをモック
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

// MindmapEditorをモック
vi.mock('../components/MindmapEditor', () => ({
  MindmapEditor: ({
    rootNode,
    onNodesChange,
  }: {
    rootNode: mindmapsApi.MindmapNode;
    onNodesChange?: (rootNode: mindmapsApi.MindmapNode) => void;
    selectedNodeId?: string | null;
    onNodeSelect?: (nodeId: string | null) => void;
  }) => (
    <div data-testid="mindmap-editor">
      <span data-testid="editor-root-text">{rootNode.text}</span>
      <button
        data-testid="mock-update-nodes"
        onClick={() => {
          if (onNodesChange) {
            onNodesChange({
              ...rootNode,
              text: 'Updated Root',
            });
          }
        }}
      >
        Mock Update
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

const mockGetMindmap = mindmapsApi.getMindmap as ReturnType<typeof vi.fn>;
const mockUpdateMindmap = mindmapsApi.updateMindmap as ReturnType<typeof vi.fn>;

const sampleMindmap: mindmapsApi.Mindmap = {
  id: 'mm-1',
  title: '既存マインドマップ',
  nodes: {
    id: 'root',
    text: 'Root Idea',
    children: [{ id: 'child-1', text: 'Child 1', children: [] }],
  },
  publishStatus: 'draft',
  authorId: 'user1',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const renderPage = (id: string = 'mm-1') => {
  return render(
    <MemoryRouter initialEntries={[`/mindmaps/edit/${id}`]}>
      <AuthProvider>
        <Routes>
          <Route path="/mindmaps/edit/:id" element={<MindmapEditPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
};

describe('MindmapEditPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('データ読み込み', () => {
    it('URLパラメータからIDを取得してAPIからマインドマップを読み込む', async () => {
      mockGetMindmap.mockResolvedValue(sampleMindmap);
      renderPage('mm-1');

      await waitFor(() => {
        expect(mockGetMindmap).toHaveBeenCalledWith('mm-1');
      });
    });

    it('読み込み中はローディング表示をする', () => {
      mockGetMindmap.mockImplementation(() => new Promise(() => {}));
      renderPage();

      expect(screen.getByTestId('mindmap-edit-skeleton')).toBeInTheDocument();
    });

    it('読み込み完了後にタイトルとエディタにデータが表示される', async () => {
      mockGetMindmap.mockResolvedValue(sampleMindmap);
      renderPage();

      await waitFor(() => {
        const titleInput = screen.getByLabelText(
          /タイトル/i
        ) as HTMLInputElement;
        expect(titleInput.value).toBe('既存マインドマップ');
      });

      expect(screen.getByTestId('mindmap-editor')).toBeInTheDocument();
      expect(screen.getByTestId('editor-root-text')).toHaveTextContent(
        'Root Idea'
      );
    });

    it('読み込み完了後に公開ステータスが反映される', async () => {
      mockGetMindmap.mockResolvedValue(sampleMindmap);
      renderPage();

      await waitFor(() => {
        const statusSelect = screen.getByLabelText(
          /公開状態/i
        ) as HTMLSelectElement;
        expect(statusSelect.value).toBe('draft');
      });
    });

    it('APIエラー時はエラーメッセージを表示する', async () => {
      mockGetMindmap.mockRejectedValue(new Error('Not found'));
      renderPage();

      await waitFor(() => {
        expect(
          screen.getByText('マインドマップの取得に失敗しました')
        ).toBeInTheDocument();
      });
    });
  });

  describe('保存機能', () => {
    it('タイトルを変更して保存するとupdateMindmapが呼ばれる', async () => {
      const user = userEvent.setup();
      mockGetMindmap.mockResolvedValue(sampleMindmap);
      mockUpdateMindmap.mockResolvedValue({
        ...sampleMindmap,
        title: '更新後タイトル',
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/タイトル/i)).toBeInTheDocument();
      });

      const titleInput = screen.getByLabelText(/タイトル/i);
      await user.clear(titleInput);
      await user.type(titleInput, '更新後タイトル');
      await user.click(screen.getByRole('button', { name: /保存/i }));

      await waitFor(() => {
        expect(mockUpdateMindmap).toHaveBeenCalledWith(
          'mm-1',
          expect.objectContaining({
            title: '更新後タイトル',
          })
        );
      });
    });

    it('保存成功後は/mindmapsへナビゲートする', async () => {
      const user = userEvent.setup();
      mockGetMindmap.mockResolvedValue(sampleMindmap);
      mockUpdateMindmap.mockResolvedValue(sampleMindmap);

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/タイトル/i)).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /保存/i }));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/mindmaps');
      });
    });

    it('保存失敗時はエラーメッセージが表示される', async () => {
      const user = userEvent.setup();
      mockGetMindmap.mockResolvedValue(sampleMindmap);
      mockUpdateMindmap.mockRejectedValue(new Error('更新エラー'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/タイトル/i)).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /保存/i }));

      await waitFor(() => {
        expect(
          screen.getByText('マインドマップの更新に失敗しました')
        ).toBeInTheDocument();
      });

      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });

  describe('公開ステータス切替', () => {
    it('公開ステータスをdraftからpublishedに変更して保存できる', async () => {
      const user = userEvent.setup();
      mockGetMindmap.mockResolvedValue(sampleMindmap);
      mockUpdateMindmap.mockResolvedValue({
        ...sampleMindmap,
        publishStatus: 'published',
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/公開状態/i)).toBeInTheDocument();
      });

      await user.selectOptions(screen.getByLabelText(/公開状態/i), 'published');
      await user.click(screen.getByRole('button', { name: /保存/i }));

      await waitFor(() => {
        expect(mockUpdateMindmap).toHaveBeenCalledWith(
          'mm-1',
          expect.objectContaining({
            publishStatus: 'published',
          })
        );
      });
    });
  });

  describe('バリデーション', () => {
    it('タイトルを空にして保存するとバリデーションエラーが表示される', async () => {
      const user = userEvent.setup();
      mockGetMindmap.mockResolvedValue(sampleMindmap);

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/タイトル/i)).toBeInTheDocument();
      });

      const titleInput = screen.getByLabelText(/タイトル/i);
      await user.clear(titleInput);
      await user.click(screen.getByRole('button', { name: /保存/i }));

      await waitFor(() => {
        expect(screen.getByText('タイトルは必須です')).toBeInTheDocument();
      });

      expect(mockUpdateMindmap).not.toHaveBeenCalled();
    });
  });

  describe('キャンセル機能', () => {
    it('キャンセルボタンをクリックすると/mindmapsへナビゲートする', async () => {
      const user = userEvent.setup();
      mockGetMindmap.mockResolvedValue(sampleMindmap);

      renderPage();

      await waitFor(() => {
        expect(screen.getByLabelText(/タイトル/i)).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /キャンセル/i }));

      expect(mockNavigate).toHaveBeenCalledWith('/mindmaps');
      expect(mockUpdateMindmap).not.toHaveBeenCalled();
    });
  });
});
