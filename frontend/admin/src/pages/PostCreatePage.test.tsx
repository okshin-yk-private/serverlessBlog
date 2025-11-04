import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import PostCreatePage from './PostCreatePage';
import * as postsApi from '../api/posts';

// モック
vi.mock('../api/posts', () => ({
  createPost: vi.fn(),
  uploadImage: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('PostCreatePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // レンダリングテスト
  it('ページタイトル「新規記事作成」が表示される', () => {
    render(
      <BrowserRouter>
        <PostCreatePage />
      </BrowserRouter>
    );

    expect(screen.getByText('新規記事作成')).toBeInTheDocument();
  });

  it('画像アップロードセクションが表示される', () => {
    render(
      <BrowserRouter>
        <PostCreatePage />
      </BrowserRouter>
    );

    expect(screen.getByText('画像アップロード')).toBeInTheDocument();
    expect(screen.getByLabelText(/画像を選択/i)).toBeInTheDocument();
  });

  it('記事エディタコンポーネントが表示される', () => {
    render(
      <BrowserRouter>
        <PostCreatePage />
      </BrowserRouter>
    );

    expect(screen.getByLabelText(/タイトル/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/本文/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/カテゴリ/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/公開状態/i)).toBeInTheDocument();
  });

  // 記事作成フロー
  it('有効な記事データを入力して保存するとcreatePostが呼ばれる', async () => {
    const user = userEvent.setup();
    vi.mocked(postsApi.createPost).mockResolvedValue({ id: 'test-id' });

    render(
      <BrowserRouter>
        <PostCreatePage />
      </BrowserRouter>
    );

    await user.type(screen.getByLabelText(/タイトル/i), 'テスト記事タイトル');
    await user.type(screen.getByLabelText(/本文/i), '# テスト本文\n\nこれはテストです。');
    await user.selectOptions(screen.getByLabelText(/カテゴリ/i), 'tech');
    await user.selectOptions(screen.getByLabelText(/公開状態/i), 'draft');

    await user.click(screen.getByRole('button', { name: /保存/i }));

    await waitFor(() => {
      expect(postsApi.createPost).toHaveBeenCalledWith({
        title: 'テスト記事タイトル',
        contentMarkdown: '# テスト本文\n\nこれはテストです。',
        category: 'tech',
        publishStatus: 'draft',
      });
    });
  });

  it('記事作成成功後は/postsへナビゲートする', async () => {
    const user = userEvent.setup();
    vi.mocked(postsApi.createPost).mockResolvedValue({ id: 'test-id' });

    render(
      <BrowserRouter>
        <PostCreatePage />
      </BrowserRouter>
    );

    await user.type(screen.getByLabelText(/タイトル/i), 'テスト記事タイトル');
    await user.type(screen.getByLabelText(/本文/i), 'テスト本文');
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
        <PostCreatePage />
      </BrowserRouter>
    );

    await user.type(screen.getByLabelText(/タイトル/i), 'テスト記事タイトル');
    await user.type(screen.getByLabelText(/本文/i), 'テスト本文');
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
        <PostCreatePage />
      </BrowserRouter>
    );

    await user.click(screen.getByRole('button', { name: /キャンセル/i }));

    expect(mockNavigate).toHaveBeenCalledWith('/posts');
    expect(postsApi.createPost).not.toHaveBeenCalled();
  });

  // 画像アップロード統合
  it('画像アップロード成功時にMarkdown形式でアラートが表示される', async () => {
    const user = userEvent.setup();
    const mockAlert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const mockClipboard = {
      writeText: vi.fn().mockResolvedValue(undefined),
    };
    Object.defineProperty(navigator, 'clipboard', {
      value: mockClipboard,
      writable: true,
    });

    vi.mocked(postsApi.uploadImage).mockResolvedValue('https://example.com/image.png');

    render(
      <BrowserRouter>
        <PostCreatePage />
      </BrowserRouter>
    );

    const file = new File(['dummy content'], 'test-image.png', { type: 'image/png' });
    const input = screen.getByLabelText(/画像を選択/i) as HTMLInputElement;

    Object.defineProperty(input, 'files', {
      value: [file],
      writable: false,
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /アップロード/i })).toBeInTheDocument();
    });

    const uploadButton = screen.getByRole('button', { name: /アップロード/i });
    await user.click(uploadButton);

    await waitFor(() => {
      expect(postsApi.uploadImage).toHaveBeenCalledWith(file);
      expect(mockClipboard.writeText).toHaveBeenCalledWith('![image](https://example.com/image.png)');
      expect(mockAlert).toHaveBeenCalledWith(
        expect.stringContaining('画像がアップロードされました')
      );
    });

    mockAlert.mockRestore();
  });

  it('画像アップロード後もエディタは操作可能', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
    });

    vi.mocked(postsApi.uploadImage).mockResolvedValue('https://example.com/image.png');

    render(
      <BrowserRouter>
        <PostCreatePage />
      </BrowserRouter>
    );

    const file = new File(['dummy content'], 'test-image.png', { type: 'image/png' });
    const input = screen.getByLabelText(/画像を選択/i) as HTMLInputElement;

    Object.defineProperty(input, 'files', {
      value: [file],
      writable: false,
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /アップロード/i })).toBeInTheDocument();
    });

    const uploadButton = screen.getByRole('button', { name: /アップロード/i });
    await user.click(uploadButton);

    await waitFor(() => {
      expect(postsApi.uploadImage).toHaveBeenCalled();
    });

    // エディタに記事内容を入力可能
    await user.type(screen.getByLabelText(/タイトル/i), 'タイトル');
    expect(screen.getByLabelText<HTMLInputElement>(/タイトル/i).value).toBe('タイトル');
  });

  // バリデーション
  it('タイトルが空の場合はバリデーションエラーが表示され保存されない', async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <PostCreatePage />
      </BrowserRouter>
    );

    await user.type(screen.getByLabelText(/本文/i), 'テスト本文');
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
        <PostCreatePage />
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
        <PostCreatePage />
      </BrowserRouter>
    );

    await user.type(screen.getByLabelText(/タイトル/i), 'テストタイトル');
    await user.type(screen.getByLabelText(/本文/i), 'テスト本文');
    // カテゴリは空のまま

    await user.click(screen.getByRole('button', { name: /保存/i }));

    await waitFor(() => {
      expect(screen.getByText('カテゴリは必須です')).toBeInTheDocument();
    });

    expect(postsApi.createPost).not.toHaveBeenCalled();
  });

  // Markdownプレビュー
  it('Markdownプレビューが表示される', () => {
    render(
      <BrowserRouter>
        <PostCreatePage />
      </BrowserRouter>
    );

    expect(screen.getByText('プレビュー')).toBeInTheDocument();
    expect(screen.getByTestId('markdown-preview')).toBeInTheDocument();
  });

  it('本文に入力した内容がプレビューに反映される', async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <PostCreatePage />
      </BrowserRouter>
    );

    await user.type(screen.getByLabelText(/本文/i), '# テスト見出し');

    await waitFor(() => {
      const preview = screen.getByTestId('markdown-preview');
      expect(preview.textContent).toContain('テスト見出し');
    });
  });

  // 公開状態トグル
  it('公開状態を下書きから公開に変更できる', async () => {
    const user = userEvent.setup();
    vi.mocked(postsApi.createPost).mockResolvedValue({ id: 'test-id' });

    render(
      <BrowserRouter>
        <PostCreatePage />
      </BrowserRouter>
    );

    await user.type(screen.getByLabelText(/タイトル/i), 'テストタイトル');
    await user.type(screen.getByLabelText(/本文/i), 'テスト本文');
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
        <PostCreatePage />
      </BrowserRouter>
    );

    const statusSelect = screen.getByLabelText(/公開状態/i) as HTMLSelectElement;
    expect(statusSelect.value).toBe('draft');
  });

  // レスポンシブデザイン
  it('レスポンシブレイアウトクラスが適用されている', () => {
    const { container } = render(
      <BrowserRouter>
        <PostCreatePage />
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
      .mockResolvedValueOnce({ id: 'test-id' });

    render(
      <BrowserRouter>
        <PostCreatePage />
      </BrowserRouter>
    );

    await user.type(screen.getByLabelText(/タイトル/i), 'テストタイトル');
    await user.type(screen.getByLabelText(/本文/i), 'テスト本文');
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
});
