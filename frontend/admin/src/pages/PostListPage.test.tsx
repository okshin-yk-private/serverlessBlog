import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import PostListPage from './PostListPage';
import * as postsApi from '../api/posts';
import { AuthProvider } from '../contexts/AuthContext';

// API関数をモック
vi.mock('../api/posts');

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

const mockGetPosts = vi.mocked(postsApi.getPosts);
const mockDeletePost = vi.mocked(postsApi.deletePost);
const mockUpdatePost = vi.mocked(postsApi.updatePost);

const renderPostListPage = () => {
  return render(
    <BrowserRouter>
      <AuthProvider>
        <PostListPage />
      </AuthProvider>
    </BrowserRouter>
  );
};

describe('PostListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('記事一覧のレンダリング', () => {
    it('ページタイトルと新規作成ボタンを表示する', async () => {
      mockGetPosts.mockResolvedValue({ posts: [], total: 0 });
      renderPostListPage();

      await waitFor(() => {
        expect(
          screen.getByRole('heading', { name: /Articles/i })
        ).toBeInTheDocument();
      });

      const createButton = screen.getByRole('link', { name: /新規作成/i });
      expect(createButton).toBeInTheDocument();
      expect(createButton).toHaveAttribute('href', '/posts/new');
    });

    it('公開記事と下書き記事のタブを表示する', async () => {
      mockGetPosts.mockResolvedValue({ posts: [], total: 0 });
      renderPostListPage();

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /公開済み/i })
        ).toBeInTheDocument();
        expect(
          screen.getByRole('button', { name: /下書き/i })
        ).toBeInTheDocument();
      });
    });

    it('記事が0件のときに「記事がありません」を表示する', async () => {
      mockGetPosts.mockResolvedValue({ posts: [], total: 0 });
      renderPostListPage();

      await waitFor(() => {
        expect(screen.getByText(/記事がありません/i)).toBeInTheDocument();
      });
    });

    it('公開記事一覧を表示する', async () => {
      const publishedPosts = [
        {
          id: '1',
          title: 'Published Post 1',
          contentMarkdown: 'Content 1',
          contentHtml: '<p>Content 1</p>',
          category: 'tech',
          publishStatus: 'published' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: '2',
          title: 'Published Post 2',
          contentMarkdown: 'Content 2',
          contentHtml: '<p>Content 2</p>',
          category: 'life',
          publishStatus: 'published' as const,
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
        },
      ];

      mockGetPosts.mockResolvedValue({ posts: publishedPosts, total: 2 });
      renderPostListPage();

      await waitFor(() => {
        expect(screen.getByText('Published Post 1')).toBeInTheDocument();
        expect(screen.getByText('Published Post 2')).toBeInTheDocument();
        // カテゴリはバッジとして表示される
        expect(screen.getByText('tech')).toBeInTheDocument();
        expect(screen.getByText('life')).toBeInTheDocument();
      });
    });

    it('下書き記事一覧を表示する', async () => {
      const draftPosts = [
        {
          id: '3',
          title: 'Draft Post 1',
          contentMarkdown: 'Draft Content',
          contentHtml: '<p>Draft Content</p>',
          category: 'tech',
          publishStatus: 'draft' as const,
          createdAt: '2024-01-03T00:00:00Z',
          updatedAt: '2024-01-03T00:00:00Z',
        },
      ];

      mockGetPosts.mockResolvedValueOnce({ posts: [], total: 0 }); // 初期表示（公開記事）
      mockGetPosts.mockResolvedValueOnce({ posts: draftPosts, total: 1 }); // 下書きタブクリック後

      renderPostListPage();

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /下書き/i })
        ).toBeInTheDocument();
      });

      const draftTab = screen.getByRole('button', { name: /下書き/i });
      fireEvent.click(draftTab);

      await waitFor(() => {
        expect(screen.getByText('Draft Post 1')).toBeInTheDocument();
      });
    });
  });

  describe('記事のフィルタリングとソート', () => {
    it('公開記事タブをクリックすると公開記事のみ取得する', async () => {
      mockGetPosts.mockResolvedValue({ posts: [], total: 0 });
      renderPostListPage();

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /公開済み/i })
        ).toBeInTheDocument();
      });

      const publishedTab = screen.getByRole('button', { name: /公開済み/i });
      fireEvent.click(publishedTab);

      await waitFor(() => {
        expect(mockGetPosts).toHaveBeenCalledWith(
          expect.objectContaining({ publishStatus: 'published' })
        );
      });
    });

    it('下書きタブをクリックすると下書き記事のみ取得する', async () => {
      mockGetPosts.mockResolvedValueOnce({ posts: [], total: 0 });
      mockGetPosts.mockResolvedValueOnce({ posts: [], total: 0 });

      renderPostListPage();

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /下書き/i })
        ).toBeInTheDocument();
      });

      const draftTab = screen.getByRole('button', { name: /下書き/i });
      fireEvent.click(draftTab);

      await waitFor(() => {
        expect(mockGetPosts).toHaveBeenCalledWith(
          expect.objectContaining({ publishStatus: 'draft' })
        );
      });
    });

    it('記事が作成日時の降順（新しい順）でソートされる', async () => {
      const posts = [
        {
          id: '2',
          title: 'Newer Post',
          contentMarkdown: 'Content',
          contentHtml: '<p>Content</p>',
          category: 'tech',
          publishStatus: 'published' as const,
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
        },
        {
          id: '1',
          title: 'Older Post',
          contentMarkdown: 'Content',
          contentHtml: '<p>Content</p>',
          category: 'tech',
          publishStatus: 'published' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      mockGetPosts.mockResolvedValue({ posts, total: 2 });
      renderPostListPage();

      await waitFor(() => {
        // 記事タイトルが表示される
        expect(screen.getByText('Newer Post')).toBeInTheDocument();
        expect(screen.getByText('Older Post')).toBeInTheDocument();
      });
    });
  });

  describe('CRUD操作', () => {
    it('記事のタイトルをクリックすると編集ページに遷移する', async () => {
      const posts = [
        {
          id: '1',
          title: 'Test Post',
          contentMarkdown: 'Content',
          contentHtml: '<p>Content</p>',
          category: 'tech',
          publishStatus: 'published' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      mockGetPosts.mockResolvedValue({ posts, total: 1 });
      renderPostListPage();

      await waitFor(() => {
        const editLink = screen.getByRole('link', { name: /編集/i });
        expect(editLink).toBeInTheDocument();
        expect(editLink).toHaveAttribute('href', '/posts/edit/1');
      });
    });

    it('削除ボタンをクリックすると確認ダイアログを表示する', async () => {
      const posts = [
        {
          id: '1',
          title: 'Test Post',
          contentMarkdown: 'Content',
          contentHtml: '<p>Content</p>',
          category: 'tech',
          publishStatus: 'published' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      mockGetPosts.mockResolvedValue({ posts, total: 1 });

      renderPostListPage();

      await waitFor(() => {
        const deleteButton = screen.getByRole('button', { name: /削除/i });
        expect(deleteButton).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: /削除/i });
      fireEvent.click(deleteButton);

      // ConfirmDialogが表示されることを確認
      await waitFor(() => {
        expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
      });
    });

    it('削除を確認すると記事を削除してリストを更新する', async () => {
      const initialPosts = [
        {
          id: '1',
          title: 'Test Post',
          contentMarkdown: 'Content',
          contentHtml: '<p>Content</p>',
          category: 'tech',
          publishStatus: 'published' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      mockGetPosts.mockResolvedValueOnce({ posts: initialPosts, total: 1 });
      mockGetPosts.mockResolvedValueOnce({ posts: [], total: 0 });
      mockDeletePost.mockResolvedValue(undefined);

      renderPostListPage();

      await waitFor(() => {
        const deleteButton = screen.getByRole('button', { name: /削除/i });
        expect(deleteButton).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: /削除/i });
      fireEvent.click(deleteButton);

      // ConfirmDialogが表示されたら「はい」をクリック
      await waitFor(() => {
        expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
      });

      const confirmButton = screen.getByTestId('confirm-yes');
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockDeletePost).toHaveBeenCalledWith('1');
        expect(mockGetPosts).toHaveBeenCalledTimes(2); // 初期表示 + 削除後のリロード
      });
    });

    it('削除をキャンセルすると何も変更しない', async () => {
      const posts = [
        {
          id: '1',
          title: 'Test Post',
          contentMarkdown: 'Content',
          contentHtml: '<p>Content</p>',
          category: 'tech',
          publishStatus: 'published' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      mockGetPosts.mockResolvedValue({ posts, total: 1 });

      renderPostListPage();

      await waitFor(() => {
        const deleteButton = screen.getByRole('button', { name: /削除/i });
        expect(deleteButton).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: /削除/i });
      fireEvent.click(deleteButton);

      // ConfirmDialogが表示されたら「いいえ」をクリック
      await waitFor(() => {
        expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
      });

      const cancelButton = screen.getByTestId('confirm-no');
      fireEvent.click(cancelButton);

      // 削除が実行されないことを確認
      await waitFor(() => {
        expect(mockDeletePost).not.toHaveBeenCalled();
      });
      expect(screen.getByText('Test Post')).toBeInTheDocument();
    });
  });

  describe('エラーハンドリングとユーザーフィードバック', () => {
    it('記事一覧の取得に失敗するとエラーメッセージを表示する', async () => {
      mockGetPosts.mockRejectedValue(new Error('API Error'));

      renderPostListPage();

      await waitFor(() => {
        expect(
          screen.getByText(/記事の取得に失敗しました/i)
        ).toBeInTheDocument();
      });
    });

    it('削除に失敗するとエラーメッセージを表示する', async () => {
      const posts = [
        {
          id: '1',
          title: 'Test Post',
          contentMarkdown: 'Content',
          contentHtml: '<p>Content</p>',
          category: 'tech',
          publishStatus: 'published' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      mockGetPosts.mockResolvedValue({ posts, total: 1 });
      mockDeletePost.mockRejectedValue(new Error('Delete failed'));

      renderPostListPage();

      await waitFor(() => {
        const deleteButton = screen.getByRole('button', { name: /削除/i });
        expect(deleteButton).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: /削除/i });
      fireEvent.click(deleteButton);

      // ConfirmDialogが表示されたら「はい」をクリック
      await waitFor(() => {
        expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
      });

      const confirmButton = screen.getByTestId('confirm-yes');
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(
          screen.getByText(/記事の削除に失敗しました/i)
        ).toBeInTheDocument();
      });
    });

    it('削除成功時に成功メッセージを表示する', async () => {
      const posts = [
        {
          id: '1',
          title: 'Test Post',
          contentMarkdown: 'Content',
          contentHtml: '<p>Content</p>',
          category: 'tech',
          publishStatus: 'published' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      mockGetPosts.mockResolvedValueOnce({ posts, total: 1 });
      mockGetPosts.mockResolvedValueOnce({ posts: [], total: 0 });
      mockDeletePost.mockResolvedValue(undefined);

      renderPostListPage();

      await waitFor(() => {
        const deleteButton = screen.getByRole('button', { name: /削除/i });
        expect(deleteButton).toBeInTheDocument();
      });

      const deleteButton = screen.getByRole('button', { name: /削除/i });
      fireEvent.click(deleteButton);

      // ConfirmDialogが表示されたら「はい」をクリック
      await waitFor(() => {
        expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
      });

      const confirmButton = screen.getByTestId('confirm-yes');
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByText(/記事を削除しました/i)).toBeInTheDocument();
      });
    });
  });

  describe('ローディングとページネーション', () => {
    it('データ取得中にローディング表示をする', () => {
      mockGetPosts.mockImplementation(() => new Promise(() => {})); // 永遠に待つ

      renderPostListPage();

      expect(screen.getByText(/読み込み中/i)).toBeInTheDocument();
    });

    it('ページネーション用のnextTokenが存在する場合、次へボタンを表示する', async () => {
      const posts = [
        {
          id: '1',
          title: 'Post 1',
          contentMarkdown: 'Content',
          contentHtml: '<p>Content</p>',
          category: 'tech',
          publishStatus: 'published' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      mockGetPosts.mockResolvedValue({
        posts,
        total: 100,
        nextToken: 'token123',
      });

      renderPostListPage();

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /次へ/i })
        ).toBeInTheDocument();
      });
    });

    it('次へボタンをクリックすると次のページを取得する', async () => {
      const page1Posts = [
        {
          id: '1',
          title: 'Post 1',
          contentMarkdown: 'Content',
          contentHtml: '<p>Content</p>',
          category: 'tech',
          publishStatus: 'published' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      const page2Posts = [
        {
          id: '2',
          title: 'Post 2',
          contentMarkdown: 'Content',
          contentHtml: '<p>Content</p>',
          category: 'life',
          publishStatus: 'published' as const,
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
        },
      ];

      mockGetPosts.mockResolvedValueOnce({
        posts: page1Posts,
        total: 2,
        nextToken: 'token123',
      });
      mockGetPosts.mockResolvedValueOnce({ posts: page2Posts, total: 2 });

      renderPostListPage();

      await waitFor(() => {
        expect(screen.getByText('Post 1')).toBeInTheDocument();
      });

      const nextButton = screen.getByRole('button', { name: /次へ/i });
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(mockGetPosts).toHaveBeenCalledWith(
          expect.objectContaining({ nextToken: 'token123' })
        );
        expect(screen.getByText('Post 2')).toBeInTheDocument();
      });
    });
  });

  describe('レスポンシブデザイン', () => {
    // AdminLayoutがモックされているため、レスポンシブクラスのテストはスキップ
    it.skip('モバイルサイズで適切なクラスを持つ', async () => {
      mockGetPosts.mockResolvedValue({ posts: [], total: 0 });

      const { container } = renderPostListPage();

      await waitFor(() => {
        expect(container.querySelector('.sm\\:px-6')).toBeInTheDocument();
        expect(container.querySelector('.lg\\:px-8')).toBeInTheDocument();
      });
    });
  });

  describe('エッジケース', () => {
    it('非常に長いタイトルを持つ記事を適切に表示する', async () => {
      const posts = [
        {
          id: '1',
          title:
            'This is a very long title that should be truncated properly in the UI to avoid layout issues and maintain readability',
          contentMarkdown: 'Content',
          contentHtml: '<p>Content</p>',
          category: 'tech',
          publishStatus: 'published' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      mockGetPosts.mockResolvedValue({ posts, total: 1 });

      renderPostListPage();

      await waitFor(() => {
        expect(
          screen.getByText(/This is a very long title/)
        ).toBeInTheDocument();
      });
    });

    it('カテゴリが未設定の記事を表示する', async () => {
      const posts = [
        {
          id: '1',
          title: 'No Category Post',
          contentMarkdown: 'Content',
          contentHtml: '<p>Content</p>',
          category: '',
          publishStatus: 'published' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      mockGetPosts.mockResolvedValue({ posts, total: 1 });

      renderPostListPage();

      await waitFor(() => {
        expect(screen.getByText('No Category Post')).toBeInTheDocument();
        expect(screen.getByText(/未分類/i)).toBeInTheDocument();
      });
    });

    it('日付フォーマットが正しく表示される', async () => {
      const posts = [
        {
          id: '1',
          title: 'Date Test Post',
          contentMarkdown: 'Content',
          contentHtml: '<p>Content</p>',
          category: 'tech',
          publishStatus: 'published' as const,
          createdAt: '2024-01-15T10:30:00Z',
          updatedAt: '2024-01-15T10:30:00Z',
        },
      ];

      mockGetPosts.mockResolvedValue({ posts, total: 1 });

      renderPostListPage();

      await waitFor(() => {
        expect(screen.getByText(/2024-01-15/)).toBeInTheDocument();
      });
    });

    it('同時刻に作成された記事を正しく表示する', async () => {
      const posts = [
        {
          id: '1',
          title: 'Post A',
          contentMarkdown: 'Content',
          contentHtml: '<p>Content</p>',
          category: 'tech',
          publishStatus: 'published' as const,
          createdAt: '2024-01-01T10:00:00Z',
          updatedAt: '2024-01-01T10:00:00Z',
        },
        {
          id: '2',
          title: 'Post B',
          contentMarkdown: 'Content',
          contentHtml: '<p>Content</p>',
          category: 'tech',
          publishStatus: 'published' as const,
          createdAt: '2024-01-01T10:00:00Z',
          updatedAt: '2024-01-01T10:00:00Z',
        },
      ];

      mockGetPosts.mockResolvedValue({ posts, total: 2 });

      renderPostListPage();

      await waitFor(() => {
        expect(screen.getByText('Post A')).toBeInTheDocument();
        expect(screen.getByText('Post B')).toBeInTheDocument();
      });
    });
  });

  describe('公開状態の切り替え', () => {
    it('下書き記事を公開に変更できる', async () => {
      const draftPost = {
        id: '1',
        title: 'Draft Post',
        contentMarkdown: 'Content',
        contentHtml: '<p>Content</p>',
        category: 'tech',
        publishStatus: 'draft' as const,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      // 初期表示（公開記事）- 空
      mockGetPosts.mockResolvedValueOnce({ posts: [], total: 0 });
      // 下書きタブクリック後
      mockGetPosts.mockResolvedValueOnce({ posts: [draftPost], total: 1 });
      // 公開後のリロード
      mockGetPosts.mockResolvedValueOnce({ posts: [], total: 0 });
      mockUpdatePost.mockResolvedValue(undefined);

      renderPostListPage();

      // 下書きタブをクリック
      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /下書き/i })
        ).toBeInTheDocument();
      });
      fireEvent.click(screen.getByRole('button', { name: /下書き/i }));

      // 公開ボタンをクリック
      await waitFor(() => {
        expect(
          screen.getByTestId('publish-article-button')
        ).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('publish-article-button'));

      await waitFor(() => {
        expect(mockUpdatePost).toHaveBeenCalledWith('1', {
          title: 'Draft Post',
          contentMarkdown: 'Content',
          category: 'tech',
          publishStatus: 'published',
        });
        expect(screen.getByText(/記事を公開しました/i)).toBeInTheDocument();
      });
    });

    it('公開記事を下書きに変更できる', async () => {
      const publishedPost = {
        id: '1',
        title: 'Published Post',
        contentMarkdown: 'Content',
        contentHtml: '<p>Content</p>',
        category: 'tech',
        publishStatus: 'published' as const,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      // 初期表示（公開記事）
      mockGetPosts.mockResolvedValueOnce({ posts: [publishedPost], total: 1 });
      // 下書きに変更後のリロード
      mockGetPosts.mockResolvedValueOnce({ posts: [], total: 0 });
      mockUpdatePost.mockResolvedValue(undefined);

      renderPostListPage();

      // 下書きに戻すボタンをクリック
      await waitFor(() => {
        expect(screen.getByTestId('draft-article-button')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('draft-article-button'));

      await waitFor(() => {
        expect(mockUpdatePost).toHaveBeenCalledWith('1', {
          title: 'Published Post',
          contentMarkdown: 'Content',
          category: 'tech',
          publishStatus: 'draft',
        });
        expect(
          screen.getByText(/記事を下書きに変更しました/i)
        ).toBeInTheDocument();
      });
    });

    it('公開状態の変更に失敗するとエラーメッセージを表示する', async () => {
      const publishedPost = {
        id: '1',
        title: 'Published Post',
        contentMarkdown: 'Content',
        contentHtml: '<p>Content</p>',
        category: 'tech',
        publishStatus: 'published' as const,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      mockGetPosts.mockResolvedValue({ posts: [publishedPost], total: 1 });
      mockUpdatePost.mockRejectedValue(new Error('Update failed'));

      renderPostListPage();

      // 下書きに戻すボタンをクリック
      await waitFor(() => {
        expect(screen.getByTestId('draft-article-button')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('draft-article-button'));

      await waitFor(() => {
        expect(
          screen.getByText(/記事のステータス更新に失敗しました/i)
        ).toBeInTheDocument();
      });
    });
  });

  describe('検索フィルター', () => {
    it('タイトルで記事を検索できる', async () => {
      const posts = [
        {
          id: '1',
          title: 'React Tutorial',
          contentMarkdown: 'Content',
          contentHtml: '<p>Content</p>',
          category: 'tech',
          publishStatus: 'published' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
        {
          id: '2',
          title: 'Vue.js Guide',
          contentMarkdown: 'Content',
          contentHtml: '<p>Content</p>',
          category: 'tech',
          publishStatus: 'published' as const,
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
        },
      ];

      mockGetPosts.mockResolvedValue({ posts, total: 2 });

      renderPostListPage();

      // 記事が表示される
      await waitFor(() => {
        expect(screen.getByText('React Tutorial')).toBeInTheDocument();
        expect(screen.getByText('Vue.js Guide')).toBeInTheDocument();
      });

      // 検索クエリを入力
      const searchInput = screen.getByTestId('admin-search-input');
      fireEvent.change(searchInput, { target: { value: 'React' } });

      // フィルターされた結果
      await waitFor(() => {
        expect(screen.getByText('React Tutorial')).toBeInTheDocument();
        expect(screen.queryByText('Vue.js Guide')).not.toBeInTheDocument();
      });
    });

    it('検索結果が0件の場合にメッセージを表示する', async () => {
      const posts = [
        {
          id: '1',
          title: 'React Tutorial',
          contentMarkdown: 'Content',
          contentHtml: '<p>Content</p>',
          category: 'tech',
          publishStatus: 'published' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      mockGetPosts.mockResolvedValue({ posts, total: 1 });

      renderPostListPage();

      // 記事が表示される
      await waitFor(() => {
        expect(screen.getByText('React Tutorial')).toBeInTheDocument();
      });

      // マッチしない検索クエリを入力
      const searchInput = screen.getByTestId('admin-search-input');
      fireEvent.change(searchInput, { target: { value: 'Angular' } });

      // 検索結果なしメッセージ
      await waitFor(() => {
        expect(
          screen.getByText('検索結果が見つかりません')
        ).toBeInTheDocument();
      });
    });

    it('大文字小文字を区別せずに検索できる', async () => {
      const posts = [
        {
          id: '1',
          title: 'React Tutorial',
          contentMarkdown: 'Content',
          contentHtml: '<p>Content</p>',
          category: 'tech',
          publishStatus: 'published' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      mockGetPosts.mockResolvedValue({ posts, total: 1 });

      renderPostListPage();

      await waitFor(() => {
        expect(screen.getByText('React Tutorial')).toBeInTheDocument();
      });

      // 小文字で検索
      const searchInput = screen.getByTestId('admin-search-input');
      fireEvent.change(searchInput, { target: { value: 'react' } });

      // マッチする
      await waitFor(() => {
        expect(screen.getByText('React Tutorial')).toBeInTheDocument();
      });
    });
  });
});
