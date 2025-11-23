/**
 * PostDetailPage Component Tests
 *
 * Task 5.2: 記事詳細ページの実装（TDD）
 * Requirements: R33 (公開サイト), R7 (記事詳細取得機能), R12 (Markdownサポート)
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PostDetailPage from './PostDetailPage';
import * as api from '../services/api';
import type { Post } from '../types/post';

// Mock the API module
vi.mock('../services/api');

describe('PostDetailPage', () => {
  const mockPost: Post = {
    id: 'post-123',
    title: 'Test Post Title',
    contentHtml: '<h1>Hello World</h1><p>This is test content.</p>',
    category: 'technology',
    tags: ['react', 'testing'],
    publishStatus: 'published',
    authorId: 'author-1',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-02T00:00:00Z',
    publishedAt: '2025-01-01T10:00:00Z',
    imageUrls: [
      'https://example.com/image1.jpg',
      'https://example.com/image2.jpg',
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Clean up meta tags from previous tests
    document
      .querySelectorAll('meta[name="description"]')
      .forEach((el) => el.remove());
    document
      .querySelectorAll('meta[name="keywords"]')
      .forEach((el) => el.remove());
    document
      .querySelectorAll('meta[property^="og:"]')
      .forEach((el) => el.remove());
    document
      .querySelectorAll('meta[name^="twitter:"]')
      .forEach((el) => el.remove());
    document
      .querySelectorAll('link[rel="canonical"]')
      .forEach((el) => el.remove());
    document
      .querySelectorAll('script[type="application/ld+json"]')
      .forEach((el) => el.remove());
  });

  describe('記事詳細レンダリング', () => {
    test('記事のタイトルが表示される', async () => {
      vi.mocked(api.fetchPost).mockResolvedValue(mockPost);

      render(
        <MemoryRouter initialEntries={['/posts/post-123']}>
          <Routes>
            <Route path="/posts/:id" element={<PostDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Test Post Title')).toBeInTheDocument();
      });
    });

    test('記事のカテゴリが表示される', async () => {
      vi.mocked(api.fetchPost).mockResolvedValue(mockPost);

      render(
        <MemoryRouter initialEntries={['/posts/post-123']}>
          <Routes>
            <Route path="/posts/:id" element={<PostDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('technology')).toBeInTheDocument();
      });
    });

    test('記事の作成日時が表示される', async () => {
      vi.mocked(api.fetchPost).mockResolvedValue(mockPost);

      render(
        <MemoryRouter initialEntries={['/posts/post-123']}>
          <Routes>
            <Route path="/posts/:id" element={<PostDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        const formattedDate = new Date(
          '2025-01-01T00:00:00Z'
        ).toLocaleDateString('ja-JP');
        expect(screen.getByText(formattedDate)).toBeInTheDocument();
      });
    });

    test('記事のタグが表示される', async () => {
      vi.mocked(api.fetchPost).mockResolvedValue(mockPost);

      render(
        <MemoryRouter initialEntries={['/posts/post-123']}>
          <Routes>
            <Route path="/posts/:id" element={<PostDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('react')).toBeInTheDocument();
        expect(screen.getByText('testing')).toBeInTheDocument();
      });
    });
  });

  describe('MarkdownからHTMLへの表示', () => {
    test('HTMLコンテンツが正しくレンダリングされる', async () => {
      vi.mocked(api.fetchPost).mockResolvedValue(mockPost);

      render(
        <MemoryRouter initialEntries={['/posts/post-123']}>
          <Routes>
            <Route path="/posts/:id" element={<PostDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        const contentElement = screen.getByTestId('article-content');
        expect(contentElement.innerHTML).toContain('<h1>Hello World</h1>');
        expect(contentElement.innerHTML).toContain(
          '<p>This is test content.</p>'
        );
      });
    });

    test('HTMLコンテンツがdangerouslySetInnerHTMLで設定される', async () => {
      const htmlPost: Post = {
        ...mockPost,
        contentHtml: '<strong>Bold Text</strong><em>Italic Text</em>',
      };

      vi.mocked(api.fetchPost).mockResolvedValue(htmlPost);

      render(
        <MemoryRouter initialEntries={['/posts/post-123']}>
          <Routes>
            <Route path="/posts/:id" element={<PostDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        const contentElement = screen.getByTestId('article-content');
        expect(contentElement.innerHTML).toContain(
          '<strong>Bold Text</strong>'
        );
        expect(contentElement.innerHTML).toContain('<em>Italic Text</em>');
      });
    });
  });

  describe('記事内の画像表示', () => {
    test('記事に画像URLが存在する場合、画像が表示される', async () => {
      vi.mocked(api.fetchPost).mockResolvedValue(mockPost);

      render(
        <MemoryRouter initialEntries={['/posts/post-123']}>
          <Routes>
            <Route path="/posts/:id" element={<PostDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        const images = screen.getAllByRole('img');
        expect(images).toHaveLength(2);
        expect(images[0]).toHaveAttribute(
          'src',
          'https://example.com/image1.jpg'
        );
        expect(images[1]).toHaveAttribute(
          'src',
          'https://example.com/image2.jpg'
        );
      });
    });

    test('画像URLが存在しない場合、画像が表示されない', async () => {
      const postWithoutImages: Post = {
        ...mockPost,
        imageUrls: undefined,
      };

      vi.mocked(api.fetchPost).mockResolvedValue(postWithoutImages);

      render(
        <MemoryRouter initialEntries={['/posts/post-123']}>
          <Routes>
            <Route path="/posts/:id" element={<PostDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Test Post Title')).toBeInTheDocument();
      });

      const images = screen.queryAllByRole('img');
      expect(images).toHaveLength(0);
    });

    test('画像URLが空配列の場合、画像が表示されない', async () => {
      const postWithEmptyImages: Post = {
        ...mockPost,
        imageUrls: [],
      };

      vi.mocked(api.fetchPost).mockResolvedValue(postWithEmptyImages);

      render(
        <MemoryRouter initialEntries={['/posts/post-123']}>
          <Routes>
            <Route path="/posts/:id" element={<PostDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Test Post Title')).toBeInTheDocument();
      });

      const images = screen.queryAllByRole('img');
      expect(images).toHaveLength(0);
    });
  });

  describe('ナビゲーションとルーティング', () => {
    test('一覧に戻るリンクが表示される', async () => {
      vi.mocked(api.fetchPost).mockResolvedValue(mockPost);

      render(
        <MemoryRouter initialEntries={['/posts/post-123']}>
          <Routes>
            <Route path="/posts/:id" element={<PostDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        const backLink = screen.getByText('← 一覧に戻る');
        expect(backLink).toBeInTheDocument();
        expect(backLink).toHaveAttribute('href', '/');
      });
    });

    test('URLパラメータから記事IDを取得してAPIを呼び出す', async () => {
      vi.mocked(api.fetchPost).mockResolvedValue(mockPost);

      render(
        <MemoryRouter initialEntries={['/posts/post-456']}>
          <Routes>
            <Route path="/posts/:id" element={<PostDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(api.fetchPost).toHaveBeenCalledWith('post-456');
      });
    });
  });

  describe('ローディング状態', () => {
    test('ローディング中に「読み込み中...」が表示される', async () => {
      vi.mocked(api.fetchPost).mockReturnValue(
        new Promise(() => {}) // Never resolves
      );

      render(
        <MemoryRouter initialEntries={['/posts/post-123']}>
          <Routes>
            <Route path="/posts/:id" element={<PostDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByText('読み込み中...')).toBeInTheDocument();
    });
  });

  describe('エラー状態', () => {
    test('APIエラー時にエラーメッセージが表示される', async () => {
      vi.mocked(api.fetchPost).mockRejectedValue(new Error('API Error'));

      render(
        <MemoryRouter initialEntries={['/posts/post-123']}>
          <Routes>
            <Route path="/posts/:id" element={<PostDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByText('記事の読み込みに失敗しました')
        ).toBeInTheDocument();
      });
    });

    test('ネットワークエラー時にエラーメッセージが表示される', async () => {
      vi.mocked(api.fetchPost).mockRejectedValue(new Error('Network Error'));

      render(
        <MemoryRouter initialEntries={['/posts/post-123']}>
          <Routes>
            <Route path="/posts/:id" element={<PostDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByText('記事の読み込みに失敗しました')
        ).toBeInTheDocument();
      });
    });
  });

  describe('404 Not Found', () => {
    test('記事が見つからない場合、404メッセージが表示される', async () => {
      const notFoundError = new Error('Not Found');
      (notFoundError as any).response = { status: 404 };

      vi.mocked(api.fetchPost).mockRejectedValue(notFoundError);

      render(
        <MemoryRouter initialEntries={['/posts/post-999']}>
          <Routes>
            <Route path="/posts/:id" element={<PostDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByText('記事が見つかりませんでした')
        ).toBeInTheDocument();
      });
    });
  });

  describe('レスポンシブデザイン', () => {
    test('コンテナ要素が存在する', async () => {
      vi.mocked(api.fetchPost).mockResolvedValue(mockPost);

      render(
        <MemoryRouter initialEntries={['/posts/post-123']}>
          <Routes>
            <Route path="/posts/:id" element={<PostDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        const container = screen.getByTestId('post-detail-container');
        expect(container).toBeInTheDocument();
      });
    });
  });

  describe('エッジケース', () => {
    test('記事IDが指定されていない場合、エラーメッセージが表示される', async () => {
      render(
        <MemoryRouter initialEntries={['/posts/']}>
          <Routes>
            <Route path="/posts/:id?" element={<PostDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByText('記事IDが指定されていません')
        ).toBeInTheDocument();
      });
    });

    test('APIが空のレスポンスを返した場合、エラーメッセージが表示される', async () => {
      vi.mocked(api.fetchPost).mockResolvedValue(null as any);

      render(
        <MemoryRouter initialEntries={['/posts/post-123']}>
          <Routes>
            <Route path="/posts/:id" element={<PostDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(
          screen.getByText('記事が見つかりませんでした')
        ).toBeInTheDocument();
      });
    });

    test('短いコンテンツ（150文字未満）の場合、descriptionに省略記号が付かない', async () => {
      const shortPost: Post = {
        ...mockPost,
        contentHtml: '<p>Short content</p>',
      };
      vi.mocked(api.fetchPost).mockResolvedValue(shortPost);

      render(
        <MemoryRouter initialEntries={['/posts/post-123']}>
          <Routes>
            <Route path="/posts/:id" element={<PostDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      // Wait for the SEOHead useEffect to complete
      await waitFor(() => {
        const descriptionMeta = document.querySelector(
          'meta[name="description"]'
        );
        expect(descriptionMeta?.getAttribute('content')).toBe('Short content');
      });
    });

    test('長いコンテンツ（150文字以上）の場合、descriptionに省略記号が付く', async () => {
      const longContent = 'A'.repeat(200);
      const longPost: Post = {
        ...mockPost,
        contentHtml: `<p>${longContent}</p>`,
      };
      vi.mocked(api.fetchPost).mockResolvedValue(longPost);

      render(
        <MemoryRouter initialEntries={['/posts/post-123']}>
          <Routes>
            <Route path="/posts/:id" element={<PostDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Test Post Title')).toBeInTheDocument();
      });

      // Check meta description has ellipsis
      const descriptionMeta = document.querySelector(
        'meta[name="description"]'
      );
      const description = descriptionMeta?.getAttribute('content') || '';
      expect(description).toHaveLength(153); // 150 chars + '...'
      expect(description.endsWith('...')).toBe(true);
    });

    test('publishedAtがない場合、createdAtをSEO日付として使用', async () => {
      const postWithoutPublishedAt: Post = {
        ...mockPost,
        publishedAt: undefined,
      };
      vi.mocked(api.fetchPost).mockResolvedValue(postWithoutPublishedAt);

      render(
        <MemoryRouter initialEntries={['/posts/post-123']}>
          <Routes>
            <Route path="/posts/:id" element={<PostDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Test Post Title')).toBeInTheDocument();
      });

      // Check JSON-LD uses createdAt
      const jsonLdScript = document.querySelector(
        'script[type="application/ld+json"]'
      );
      expect(jsonLdScript).toBeTruthy();
      const jsonLdContent = JSON.parse(jsonLdScript?.textContent || '{}');
      expect(jsonLdContent.datePublished).toBe('2025-01-01T00:00:00Z');
    });

    test('authorIdが空の場合、デフォルトで"Admin"が表示される', async () => {
      const postWithoutAuthor = { ...mockPost, authorId: '' };
      vi.mocked(api.fetchPost).mockResolvedValue(postWithoutAuthor);

      render(
        <MemoryRouter initialEntries={['/posts/post-123']}>
          <Routes>
            <Route path="/posts/:id" element={<PostDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        const authorElement = screen.getByTestId('article-author');
        expect(authorElement.textContent).toBe('Admin');
      });
    });

    test('tagsが配列でない場合、SEOHeadに空配列が渡される', async () => {
      const postWithInvalidTags = {
        ...mockPost,
        tags: undefined as any,
      };
      vi.mocked(api.fetchPost).mockResolvedValue(postWithInvalidTags);

      render(
        <MemoryRouter initialEntries={['/posts/post-123']}>
          <Routes>
            <Route path="/posts/:id" element={<PostDetailPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText('Test Post Title')).toBeInTheDocument();
      });

      // keywordsメタタグは空文字列のcontentで作成される
      const keywordsMeta = document.querySelector('meta[name="keywords"]');
      expect(keywordsMeta).toBeTruthy();
      expect(keywordsMeta?.getAttribute('content')).toBe('');
    });
  });
});
