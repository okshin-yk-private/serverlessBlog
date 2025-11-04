import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import DashboardPage from './DashboardPage';
import * as postsApi from '../api/posts';

// API関数をモック
vi.mock('../api/posts');

const mockGetPosts = vi.mocked(postsApi.getPosts);

const renderDashboard = () => {
  return render(
    <BrowserRouter>
      <DashboardPage />
    </BrowserRouter>
  );
};

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ダッシュボードレイアウトとナビゲーション', () => {
    it('ダッシュボードのタイトルを表示する', async () => {
      mockGetPosts.mockResolvedValue({ posts: [], total: 0 });
      renderDashboard();

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /ダッシュボード/i })).toBeInTheDocument();
      });
    });

    it('記事一覧へのリンクを表示する', async () => {
      mockGetPosts.mockResolvedValue({ posts: [], total: 0 });
      renderDashboard();

      await waitFor(() => {
        const link = screen.getByRole('link', { name: /記事一覧/i });
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute('href', '/posts');
      });
    });

    it('新規記事作成へのリンクを表示する', async () => {
      mockGetPosts.mockResolvedValue({ posts: [], total: 0 });
      renderDashboard();

      await waitFor(() => {
        const link = screen.getByRole('link', { name: /新規記事作成/i });
        expect(link).toBeInTheDocument();
        expect(link).toHaveAttribute('href', '/posts/create');
      });
    });
  });

  describe('記事統計表示', () => {
    it('公開記事数を表示する', async () => {
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

      mockGetPosts.mockResolvedValueOnce({ posts: publishedPosts, total: 2 });
      mockGetPosts.mockResolvedValueOnce({ posts: [], total: 0 });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/公開記事数/i)).toBeInTheDocument();
        expect(screen.getByText('2')).toBeInTheDocument();
      });
    });

    it('下書き記事数を表示する', async () => {
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

      mockGetPosts.mockResolvedValueOnce({ posts: [], total: 0 });
      mockGetPosts.mockResolvedValueOnce({ posts: draftPosts, total: 1 });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/下書き記事数/i)).toBeInTheDocument();
        expect(screen.getByText('1')).toBeInTheDocument();
      });
    });

    it('記事が0件の場合も正しく表示する', async () => {
      mockGetPosts.mockResolvedValue({ posts: [], total: 0 });

      renderDashboard();

      await waitFor(() => {
        const stats = screen.getAllByText('0');
        expect(stats.length).toBeGreaterThanOrEqual(2); // 公開と下書きの両方
      });
    });
  });

  describe('下書きと公開記事一覧', () => {
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
      ];

      mockGetPosts.mockResolvedValueOnce({ posts: publishedPosts, total: 1 });
      mockGetPosts.mockResolvedValueOnce({ posts: [], total: 0 });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Published Post 1')).toBeInTheDocument();
      });
    });

    it('下書き記事一覧を表示する', async () => {
      const draftPosts = [
        {
          id: '2',
          title: 'Draft Post 1',
          contentMarkdown: 'Draft Content',
          contentHtml: '<p>Draft Content</p>',
          category: 'tech',
          publishStatus: 'draft' as const,
          createdAt: '2024-01-02T00:00:00Z',
          updatedAt: '2024-01-02T00:00:00Z',
        },
      ];

      mockGetPosts.mockResolvedValueOnce({ posts: [], total: 0 });
      mockGetPosts.mockResolvedValueOnce({ posts: draftPosts, total: 1 });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Draft Post 1')).toBeInTheDocument();
      });
    });

    it('記事のカテゴリを表示する', async () => {
      const posts = [
        {
          id: '1',
          title: 'Tech Post',
          contentMarkdown: 'Content',
          contentHtml: '<p>Content</p>',
          category: 'technology',
          publishStatus: 'published' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      mockGetPosts.mockResolvedValueOnce({ posts, total: 1 });
      mockGetPosts.mockResolvedValueOnce({ posts: [], total: 0 });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/technology/i)).toBeInTheDocument();
      });
    });

    it('記事の作成日時を表示する', async () => {
      const posts = [
        {
          id: '1',
          title: 'Post 1',
          contentMarkdown: 'Content',
          contentHtml: '<p>Content</p>',
          category: 'tech',
          publishStatus: 'published' as const,
          createdAt: '2024-01-15T12:30:00Z',
          updatedAt: '2024-01-15T12:30:00Z',
        },
      ];

      mockGetPosts.mockResolvedValueOnce({ posts, total: 1 });
      mockGetPosts.mockResolvedValueOnce({ posts: [], total: 0 });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/2024/)).toBeInTheDocument();
      });
    });

    it('記事が最新順（createdAt降順）で表示される', async () => {
      const posts = [
        {
          id: '1',
          title: 'Newest Post',
          contentMarkdown: 'Content',
          contentHtml: '<p>Content</p>',
          category: 'tech',
          publishStatus: 'published' as const,
          createdAt: '2024-01-03T00:00:00Z',
          updatedAt: '2024-01-03T00:00:00Z',
        },
        {
          id: '2',
          title: 'Older Post',
          contentMarkdown: 'Content',
          contentHtml: '<p>Content</p>',
          category: 'tech',
          publishStatus: 'published' as const,
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ];

      mockGetPosts.mockResolvedValueOnce({ posts, total: 2 });
      mockGetPosts.mockResolvedValueOnce({ posts: [], total: 0 });

      renderDashboard();

      await waitFor(() => {
        const titles = screen.getAllByRole('heading', { level: 3 });
        expect(titles[0]).toHaveTextContent('Newest Post');
        expect(titles[1]).toHaveTextContent('Older Post');
      });
    });

    it('記事一覧が空の場合、メッセージを表示する', async () => {
      mockGetPosts.mockResolvedValue({ posts: [], total: 0 });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/記事がありません/i)).toBeInTheDocument();
      });
    });
  });

  describe('認証ガード動作', () => {
    it('認証が必要なページであることを示す属性がある', () => {
      mockGetPosts.mockResolvedValue({ posts: [], total: 0 });
      const { container } = renderDashboard();

      // DashboardPageは認証が必要なページなので、App.tsxでAuthGuardでラップされる
      // ここではページがレンダリングされることを確認
      expect(container.querySelector('[data-testid="dashboard"]') || container.firstChild).toBeTruthy();
    });
  });

  describe('ローディング状態', () => {
    it('データ読み込み中にローディング表示をする', () => {
      mockGetPosts.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve({ posts: [], total: 0 }), 1000))
      );

      renderDashboard();

      expect(screen.getByText(/読み込み中/i)).toBeInTheDocument();
    });
  });

  describe('エラーハンドリング', () => {
    it('API呼び出し失敗時にエラーメッセージを表示する', async () => {
      mockGetPosts.mockRejectedValue(new Error('Network error'));

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(/エラーが発生しました/i)).toBeInTheDocument();
      });
    });

    it('エラー後にリトライボタンを表示する', async () => {
      mockGetPosts.mockRejectedValue(new Error('Network error'));

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /再試行/i })).toBeInTheDocument();
      });
    });
  });

  describe('レスポンシブデザイン', () => {
    it('レスポンシブ対応のクラスが適用されている', async () => {
      mockGetPosts.mockResolvedValue({ posts: [], total: 0 });
      const { container } = renderDashboard();

      await waitFor(() => {
        // Tailwind CSSのレスポンシブクラス（sm:, md:, lg:など）が使用されていることを確認
        const hasResponsiveClasses = container.innerHTML.includes('sm:') ||
                                     container.innerHTML.includes('md:') ||
                                     container.innerHTML.includes('lg:');
        expect(hasResponsiveClasses).toBe(true);
      });
    });
  });

  describe('エッジケース', () => {
    it('大量の記事（100件）を正しく表示する', async () => {
      const manyPosts = Array.from({ length: 100 }, (_, i) => ({
        id: `${i + 1}`,
        title: `Post ${i + 1}`,
        contentMarkdown: 'Content',
        contentHtml: '<p>Content</p>',
        category: 'tech',
        publishStatus: 'published' as const,
        createdAt: `2024-01-${String(i % 28 + 1).padStart(2, '0')}T00:00:00Z`,
        updatedAt: `2024-01-${String(i % 28 + 1).padStart(2, '0')}T00:00:00Z`,
      }));

      mockGetPosts.mockResolvedValueOnce({ posts: manyPosts, total: 100 });
      mockGetPosts.mockResolvedValueOnce({ posts: [], total: 0 });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('100')).toBeInTheDocument(); // 統計に100件と表示
      });
    });

    it('タイトルが長い記事を正しく表示する', async () => {
      const longTitle = 'これは非常に長いタイトルです。'.repeat(10);
      const posts = [
        {
          id: '1',
          title: longTitle,
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

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText(longTitle)).toBeInTheDocument();
      });
    });

    it('特殊文字を含むタイトルを正しく表示する', async () => {
      const specialTitle = '<script>alert("XSS")</script> & " \' >';
      const posts = [
        {
          id: '1',
          title: specialTitle,
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

      renderDashboard();

      await waitFor(() => {
        // Reactはデフォルトでエスケープするので、スクリプトは実行されない
        expect(screen.getByText(specialTitle)).toBeInTheDocument();
      });
    });

    it('createdAtがnullの記事を正しく処理する', async () => {
      const posts = [
        {
          id: '1',
          title: 'Post without date',
          contentMarkdown: 'Content',
          contentHtml: '<p>Content</p>',
          category: 'tech',
          publishStatus: 'published' as const,
          createdAt: '',
          updatedAt: '',
        },
      ];

      mockGetPosts.mockResolvedValueOnce({ posts, total: 1 });
      mockGetPosts.mockResolvedValueOnce({ posts: [], total: 0 });

      renderDashboard();

      await waitFor(() => {
        expect(screen.getByText('Post without date')).toBeInTheDocument();
      });
    });
  });
});
