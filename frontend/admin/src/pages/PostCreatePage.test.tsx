import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  act,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import PostCreatePage from './PostCreatePage';
import * as postsApi from '../api/posts';
import * as mindmapsApi from '../api/mindmaps';
import { AuthProvider } from '../contexts/AuthContext';

// モック
vi.mock('../api/posts', () => ({
  createPost: vi.fn(),
  uploadImage: vi.fn(),
  deleteImage: vi.fn(),
}));

vi.mock('../api/mindmaps', () => ({
  listMindmaps: vi.fn(),
}));

// カテゴリAPIのモック
vi.mock('../api/categories', () => ({
  fetchCategories: vi.fn().mockResolvedValue([
    { id: '1', slug: 'tech', name: 'テクノロジー', sortOrder: 1 },
    { id: '2', slug: 'life', name: 'ライフスタイル', sortOrder: 2 },
    { id: '3', slug: 'business', name: 'ビジネス', sortOrder: 3 },
    { id: '4', slug: 'other', name: 'その他', sortOrder: 4 },
  ]),
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

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

async function waitForTiptap() {
  await waitFor(() => {
    if (!window.__tiptapEditor) {
      throw new Error('tiptap editor not yet exposed');
    }
  });
  return window.__tiptapEditor!;
}

async function setBodyContent(markdown: string) {
  const editor = await waitForTiptap();
  act(() => {
    editor.commands.setContent(markdown);
  });
}

describe('PostCreatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // レンダリングテスト
  it('ページタイトル「New Article」が表示される', () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <PostCreatePage />
        </AuthProvider>
      </BrowserRouter>
    );

    expect(screen.getByText('New Article')).toBeInTheDocument();
  });

  it('画像アップロードセクションが表示される', () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <PostCreatePage />
        </AuthProvider>
      </BrowserRouter>
    );

    expect(screen.getByText('画像アップロード')).toBeInTheDocument();
    expect(screen.getByLabelText(/画像を選択/i)).toBeInTheDocument();
  });

  it('記事エディタコンポーネントが表示される', () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <PostCreatePage />
        </AuthProvider>
      </BrowserRouter>
    );

    expect(screen.getByLabelText(/タイトル/i)).toBeInTheDocument();
    expect(screen.getByTestId('tiptap-editor')).toBeInTheDocument();
    expect(screen.getByLabelText(/カテゴリ/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/公開状態/i)).toBeInTheDocument();
  });

  // 記事作成フロー
  it('有効な記事データを入力して保存するとcreatePostが呼ばれる', async () => {
    const user = userEvent.setup();
    vi.mocked(postsApi.createPost).mockResolvedValue({
      id: 'test-id',
      title: 'テスト記事タイトル',
      contentMarkdown: 'テスト本文',
      contentHtml: '<p>テスト本文</p>',
      category: 'technology',
      tags: [],
      publishStatus: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    render(
      <BrowserRouter>
        <AuthProvider>
          <PostCreatePage />
        </AuthProvider>
      </BrowserRouter>
    );

    await user.type(screen.getByLabelText(/タイトル/i), 'テスト記事タイトル');
    await setBodyContent('## テスト本文\n\nこれはテストです。');
    await user.selectOptions(screen.getByLabelText(/カテゴリ/i), 'tech');
    await user.selectOptions(screen.getByLabelText(/公開状態/i), 'draft');

    await user.click(screen.getByRole('button', { name: /保存/i }));

    await waitFor(() => {
      expect(postsApi.createPost).toHaveBeenCalled();
    });
    const call = vi.mocked(postsApi.createPost).mock.calls[0][0];
    expect(call.title).toBe('テスト記事タイトル');
    expect(call.category).toBe('tech');
    expect(call.tags).toEqual([]);
    expect(call.publishStatus).toBe('draft');
    expect(call.contentMarkdown).toContain('テスト本文');
    expect(call.contentMarkdown).toContain('これはテストです');
  });

  it('記事作成成功後は/postsへナビゲートする', async () => {
    const user = userEvent.setup();
    vi.mocked(postsApi.createPost).mockResolvedValue({
      id: 'test-id',
      title: 'Test',
      contentMarkdown: 'Test',
      contentHtml: '<p>Test</p>',
      category: 'technology',
      tags: [],
      publishStatus: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    render(
      <BrowserRouter>
        <AuthProvider>
          <PostCreatePage />
        </AuthProvider>
      </BrowserRouter>
    );

    await user.type(screen.getByLabelText(/タイトル/i), 'テスト記事タイトル');
    await setBodyContent('テスト本文');
    await user.selectOptions(screen.getByLabelText(/カテゴリ/i), 'tech');

    await user.click(screen.getByRole('button', { name: /保存/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/posts');
    });
  });

  it('記事作成失敗時はエラーメッセージが表示される', async () => {
    const user = userEvent.setup();
    vi.mocked(postsApi.createPost).mockRejectedValue(new Error('作成エラー'));

    render(
      <BrowserRouter>
        <AuthProvider>
          <PostCreatePage />
        </AuthProvider>
      </BrowserRouter>
    );

    await user.type(screen.getByLabelText(/タイトル/i), 'テスト記事タイトル');
    await setBodyContent('テスト本文');
    await user.selectOptions(screen.getByLabelText(/カテゴリ/i), 'tech');

    await user.click(screen.getByRole('button', { name: /保存/i }));

    await waitFor(() => {
      expect(screen.getByText('記事の作成に失敗しました')).toBeInTheDocument();
    });

    // エラー後もページに留まる
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // キャンセル機能
  it('キャンセルボタンをクリックすると/postsへナビゲートする', async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <AuthProvider>
          <PostCreatePage />
        </AuthProvider>
      </BrowserRouter>
    );

    await user.click(screen.getByRole('button', { name: /キャンセル/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/posts');
    expect(postsApi.createPost).not.toHaveBeenCalled();
  });

  // 画像アップロード統合
  it('画像アップロード成功時にエディタに image ノードが挿入される', async () => {
    const user = userEvent.setup();

    vi.mocked(postsApi.uploadImage).mockResolvedValue(
      'https://example.com/image.png'
    );

    render(
      <BrowserRouter>
        <AuthProvider>
          <PostCreatePage />
        </AuthProvider>
      </BrowserRouter>
    );

    const file = new File(['dummy content'], 'test-image.png', {
      type: 'image/png',
    });
    const input = screen.getByLabelText(/画像を選択/i) as HTMLInputElement;

    Object.defineProperty(input, 'files', {
      value: [file],
      writable: false,
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /アップロード/i })
      ).toBeInTheDocument();
    });

    const uploadButton = screen.getByRole('button', { name: /アップロード/i });
    await user.click(uploadButton);

    await waitFor(() => {
      expect(postsApi.uploadImage).toHaveBeenCalledWith(file);
    });

    // エディタに画像ノードが挿入されていることを markdown 出力で確認
    await waitFor(async () => {
      const editor = await waitForTiptap();
      const md = editor.storage.markdown.getMarkdown() as string;
      expect(md).toContain('https://example.com/image.png');
    });
  });

  it('画像アップロード後もエディタは操作可能', async () => {
    const user = userEvent.setup();

    vi.mocked(postsApi.uploadImage).mockResolvedValue(
      'https://example.com/image.png'
    );

    render(
      <BrowserRouter>
        <AuthProvider>
          <PostCreatePage />
        </AuthProvider>
      </BrowserRouter>
    );

    const file = new File(['dummy content'], 'test-image.png', {
      type: 'image/png',
    });
    const input = screen.getByLabelText(/画像を選択/i) as HTMLInputElement;

    Object.defineProperty(input, 'files', {
      value: [file],
      writable: false,
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /アップロード/i })
      ).toBeInTheDocument();
    });

    const uploadButton = screen.getByRole('button', { name: /アップロード/i });
    await user.click(uploadButton);

    await waitFor(async () => {
      expect(postsApi.uploadImage).toHaveBeenCalled();
      const editor = await waitForTiptap();
      const md = editor.storage.markdown.getMarkdown() as string;
      expect(md).toContain('https://example.com/image.png');
    });

    // タイトル入力欄は引き続き操作可能 (アップロード時に焦点を奪われない)
    const titleInput = screen.getByLabelText<HTMLInputElement>(/タイトル/i);
    fireEvent.change(titleInput, { target: { value: 'タイトル' } });
    expect(titleInput.value).toBe('タイトル');
  });

  // バリデーション
  it('タイトルが空の場合はバリデーションエラーが表示され保存されない', async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <AuthProvider>
          <PostCreatePage />
        </AuthProvider>
      </BrowserRouter>
    );

    await setBodyContent('テスト本文');
    await user.selectOptions(screen.getByLabelText(/カテゴリ/i), 'tech');

    await user.click(screen.getByRole('button', { name: /保存/i }));

    await waitFor(() => {
      expect(screen.getByText('タイトルは必須です')).toBeInTheDocument();
    });

    expect(postsApi.createPost).not.toHaveBeenCalled();
  });

  it('本文が空の場合はバリデーションエラーが表示され保存されない', async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <AuthProvider>
          <PostCreatePage />
        </AuthProvider>
      </BrowserRouter>
    );

    await user.type(screen.getByLabelText(/タイトル/i), 'テストタイトル');
    await user.selectOptions(screen.getByLabelText(/カテゴリ/i), 'tech');

    await user.click(screen.getByRole('button', { name: /保存/i }));

    await waitFor(() => {
      expect(screen.getByText('本文は必須です')).toBeInTheDocument();
    });

    expect(postsApi.createPost).not.toHaveBeenCalled();
  });

  it('カテゴリが選択されていない場合はバリデーションエラーが表示され保存されない', async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <AuthProvider>
          <PostCreatePage />
        </AuthProvider>
      </BrowserRouter>
    );

    await user.type(screen.getByLabelText(/タイトル/i), 'テストタイトル');
    await setBodyContent('テスト本文');
    // カテゴリは空のまま

    await user.click(screen.getByRole('button', { name: /保存/i }));

    await waitFor(() => {
      expect(screen.getByText('カテゴリは必須です')).toBeInTheDocument();
    });

    expect(postsApi.createPost).not.toHaveBeenCalled();
  });

  // Markdownプレビュー (Tiptap 移行後は Preview タブ経由)
  it('Markdownプレビューが Preview タブ経由で表示される', async () => {
    const user = userEvent.setup();
    render(
      <BrowserRouter>
        <AuthProvider>
          <PostCreatePage />
        </AuthProvider>
      </BrowserRouter>
    );

    expect(screen.queryByTestId('markdown-preview')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('editor-tab-preview'));
    await waitFor(() => {
      expect(screen.getByTestId('markdown-preview')).toBeInTheDocument();
    });
  });

  it('本文に入力した内容がプレビューに反映される', async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <AuthProvider>
          <PostCreatePage />
        </AuthProvider>
      </BrowserRouter>
    );

    await setBodyContent('## テスト見出し');
    await user.click(screen.getByTestId('editor-tab-preview'));

    await waitFor(() => {
      const preview = screen.getByTestId('markdown-preview');
      expect(preview.textContent).toContain('テスト見出し');
    });
  });

  // 公開状態トグル
  it('公開状態を下書きから公開に変更できる', async () => {
    const user = userEvent.setup();
    vi.mocked(postsApi.createPost).mockResolvedValue({
      id: 'test-id',
      title: 'Test',
      contentMarkdown: 'Test',
      contentHtml: '<p>Test</p>',
      category: 'technology',
      tags: [],
      publishStatus: 'published',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    render(
      <BrowserRouter>
        <AuthProvider>
          <PostCreatePage />
        </AuthProvider>
      </BrowserRouter>
    );

    await user.type(screen.getByLabelText(/タイトル/i), 'テストタイトル');
    await setBodyContent('テスト本文');
    await user.selectOptions(screen.getByLabelText(/カテゴリ/i), 'tech');
    await user.selectOptions(screen.getByLabelText(/公開状態/i), 'published');

    await user.click(screen.getByRole('button', { name: /保存/i }));

    await waitFor(() => {
      expect(postsApi.createPost).toHaveBeenCalledWith(
        expect.objectContaining({
          publishStatus: 'published',
        })
      );
    });
  });

  it('デフォルトで公開状態は「下書き」である', () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <PostCreatePage />
        </AuthProvider>
      </BrowserRouter>
    );

    const statusSelect = screen.getByLabelText(
      /公開状態/i
    ) as HTMLSelectElement;
    // PR3 で "draft" 既定に変更
    expect(statusSelect.value).toBe('draft');
  });

  // レスポンシブデザイン
  // AdminLayoutがモックされているためスキップ
  it.skip('レスポンシブレイアウトクラスが適用されている', () => {
    const { container } = render(
      <BrowserRouter>
        <AuthProvider>
          <PostCreatePage />
        </AuthProvider>
      </BrowserRouter>
    );

    // Tailwind CSSのレスポンシブクラスが存在することを確認
    const mainContainer = container.querySelector('.max-w-7xl');
    expect(mainContainer).toBeInTheDocument();
  });

  // エラーハンドリング
  it('記事作成エラー後にエラーメッセージをクリアして再試行できる', async () => {
    const user = userEvent.setup();
    vi.mocked(postsApi.createPost)
      .mockRejectedValueOnce(new Error('作成エラー'))
      .mockResolvedValueOnce({
        id: 'test-id',
        title: 'Test',
        contentMarkdown: 'Test',
        contentHtml: '<p>Test</p>',
        category: 'technology',
        publishStatus: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

    render(
      <BrowserRouter>
        <AuthProvider>
          <PostCreatePage />
        </AuthProvider>
      </BrowserRouter>
    );

    await user.type(screen.getByLabelText(/タイトル/i), 'テストタイトル');
    await setBodyContent('テスト本文');
    await user.selectOptions(screen.getByLabelText(/カテゴリ/i), 'tech');

    // 1回目の保存（失敗）
    await user.click(screen.getByRole('button', { name: /保存/i }));

    await waitFor(() => {
      expect(screen.getByText('記事の作成に失敗しました')).toBeInTheDocument();
    });

    // 2回目の保存（成功）
    await user.click(screen.getByRole('button', { name: /保存/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/posts');
    });
  });

  // マインドマップ挿入
  describe('マインドマップ挿入機能', () => {
    it('マインドマップ挿入ボタンが表示される', () => {
      render(
        <BrowserRouter>
          <AuthProvider>
            <PostCreatePage />
          </AuthProvider>
        </BrowserRouter>
      );

      expect(screen.getByTestId('mindmap-insert-button')).toBeInTheDocument();
    });

    it('マインドマップ挿入ボタンをクリックするとピッカーモーダルが表示される', async () => {
      const user = userEvent.setup();
      vi.mocked(mindmapsApi.listMindmaps).mockResolvedValue({
        items: [
          {
            id: 'mm-1',
            title: 'テストマインドマップ',
            nodes: { id: 'root', text: 'Root', children: [] },
            publishStatus: 'published',
            authorId: 'user-1',
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
        count: 1,
      });

      render(
        <BrowserRouter>
          <AuthProvider>
            <PostCreatePage />
          </AuthProvider>
        </BrowserRouter>
      );

      await user.click(screen.getByTestId('mindmap-insert-button'));

      await waitFor(() => {
        expect(screen.getByTestId('mindmap-picker-modal')).toBeInTheDocument();
      });
    });

    it('マインドマップを選択するとマーカーがエディタに挿入される', async () => {
      const user = userEvent.setup();
      vi.mocked(mindmapsApi.listMindmaps).mockResolvedValue({
        items: [
          {
            id: 'mm-test-id',
            title: 'テストマインドマップ',
            nodes: { id: 'root', text: 'Root', children: [] },
            publishStatus: 'published',
            authorId: 'user-1',
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
        count: 1,
      });

      render(
        <BrowserRouter>
          <AuthProvider>
            <PostCreatePage />
          </AuthProvider>
        </BrowserRouter>
      );

      await user.click(screen.getByTestId('mindmap-insert-button'));

      await waitFor(() => {
        expect(screen.getByText('テストマインドマップ')).toBeInTheDocument();
      });

      await user.click(screen.getByText('テストマインドマップ'));

      await waitFor(async () => {
        const editor = await waitForTiptap();
        const md = editor.storage.markdown.getMarkdown() as string;
        expect(md).toContain('{{mindmap:mm-test-id}}');
      });
    });

    it('マインドマップ選択後にモーダルが閉じる', async () => {
      const user = userEvent.setup();
      vi.mocked(mindmapsApi.listMindmaps).mockResolvedValue({
        items: [
          {
            id: 'mm-1',
            title: 'テストマインドマップ',
            nodes: { id: 'root', text: 'Root', children: [] },
            publishStatus: 'published',
            authorId: 'user-1',
            createdAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        ],
        count: 1,
      });

      render(
        <BrowserRouter>
          <AuthProvider>
            <PostCreatePage />
          </AuthProvider>
        </BrowserRouter>
      );

      await user.click(screen.getByTestId('mindmap-insert-button'));

      await waitFor(() => {
        expect(screen.getByText('テストマインドマップ')).toBeInTheDocument();
      });

      await user.click(screen.getByText('テストマインドマップ'));

      await waitFor(() => {
        expect(
          screen.queryByTestId('mindmap-picker-modal')
        ).not.toBeInTheDocument();
      });
    });
  });
});
