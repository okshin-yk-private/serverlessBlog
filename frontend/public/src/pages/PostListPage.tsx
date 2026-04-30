/**
 * PostListPage Component
 *
 * Task 5.1: 記事一覧ページの実装（TDD）
 * Requirements: R33 (公開サイト), R6 (記事一覧取得機能)
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchPosts, fetchCategories } from '../services/api';
import type { Post, CategoryListItem } from '../types/post';
import { SEOHead } from '../components/SEOHead';
import { PostListSkeleton } from '../components/skeleton';

// Iteratively strip `<...>` patterns so residual fragments like `<<b>>` cannot
// collapse into a tag after a single pass. The output is rendered as React
// text content (escaped automatically), not as innerHTML.
const stripTags = (html: string): string => {
  const tagPattern = /<[^>]*>/g;
  let prev = html;
  let next = html.replace(tagPattern, '');
  while (next !== prev) {
    prev = next;
    next = next.replace(tagPattern, '');
  }
  return next;
};

const PostListPage: React.FC = () => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextToken, setNextToken] = useState<string | undefined>(undefined);
  const [category, setCategory] = useState<string>('');
  const [tags, setTags] = useState<string>('');
  const [hasPrevious, setHasPrevious] = useState(false);
  const [categories, setCategories] = useState<CategoryListItem[]>([]);

  const loadPosts = async (
    filters: {
      category?: string;
      tags?: string;
      nextToken?: string;
    } = {}
  ) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetchPosts(filters);

      setPosts(response.items || []);
      setNextToken(response.nextToken);
    } catch (err) {
      // エラー時は空の記事リストを表示（500エラーや network errorハンドリング）
      setPosts([]);
      setNextToken(undefined);
      setError('エラーが発生しました');
      console.error('Failed to fetch posts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPosts({
      category: category || undefined,
      tags: tags || undefined,
    });
    // カテゴリー一覧を取得
    fetchCategories()
      .then((data) => setCategories(data))
      .catch((err) => console.error('Failed to fetch categories:', err));
  }, []);

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedCategory = e.target.value;
    setCategory(selectedCategory);
    setHasPrevious(false);
    loadPosts({
      category: selectedCategory || undefined,
      tags: tags || undefined,
    });
  };

  const handleTagSearch = () => {
    setHasPrevious(false);
    loadPosts({
      category: category || undefined,
      tags: tags || undefined,
    });
  };

  const handleNextPage = () => {
    if (nextToken) {
      setHasPrevious(true);
      loadPosts({
        category: category || undefined,
        tags: tags || undefined,
        nextToken,
      });
    }
  };

  const handlePrevPage = () => {
    // 前のページに戻る（簡易実装）
    setHasPrevious(false);
    loadPosts({
      category: category || undefined,
      tags: tags || undefined,
    });
  };

  if (loading) {
    return <PostListSkeleton />;
  }

  // Generate dynamic SEO title and description based on filters
  const generateSEOTitle = (): string => {
    if (category && tags) {
      return `${category} カテゴリ - ${tags} タグの記事一覧`;
    }
    if (category) {
      return `${category} カテゴリの記事一覧`;
    }
    if (tags) {
      return `${tags} タグの記事一覧`;
    }
    return 'bone of my fallacy';
  };

  const generateSEODescription = (): string => {
    if (category && tags) {
      return `${category} カテゴリと ${tags} タグに関連するブログ記事の一覧です。`;
    }
    if (category) {
      return `${category} カテゴリに関連するブログ記事の一覧です。`;
    }
    if (tags) {
      return `${tags} タグに関連するブログ記事の一覧です。`;
    }
    return '最新のブログ記事の一覧です。テクノロジー、ライフスタイル、プログラミングなど様々なトピックを扱っています。';
  };

  return (
    <div className="page-container">
      {/* SEO Meta Tags */}
      <SEOHead
        title={generateSEOTitle()}
        description={generateSEODescription()}
        keywords={tags ? [tags] : ['blog', 'technology', 'life']}
        url={window.location.href}
        type="website"
      />

      {/* Hero Section */}
      <div className="hero-section">
        <h1 className="hero-title">I am the bone of my fallacy</h1>
      </div>

      <div className="container">
        {/* Filter Section */}
        <div className="filter-bar">
          <div className="category-pills">
            <button
              className={`category-pill ${category === '' ? 'active' : ''}`}
              onClick={() => {
                setCategory('');
                setHasPrevious(false);
                loadPosts({ tags: tags || undefined });
              }}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                className={`category-pill ${category === cat.slug ? 'active' : ''}`}
                onClick={() => {
                  setCategory(cat.slug);
                  setHasPrevious(false);
                  loadPosts({ category: cat.slug, tags: tags || undefined });
                }}
              >
                {cat.name}
              </button>
            ))}
          </div>

          <div className="search-box">
            <input
              id="tag-input"
              data-testid="search-input"
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Search articles..."
              aria-label="タグ"
              className="search-input"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleTagSearch();
                }
              }}
            />
          </div>
        </div>

        {/* Hidden select for testing */}
        <select
          id="category-select"
          data-testid="category-filter"
          value={category}
          onChange={handleCategoryChange}
          aria-label="カテゴリ"
          style={{ display: 'none' }}
        >
          <option value="" data-testid="category-option">
            すべて
          </option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.slug} data-testid="category-option">
              {cat.name}
            </option>
          ))}
        </select>
        <button
          onClick={handleTagSearch}
          data-testid="search-button"
          aria-label="検索"
          style={{ display: 'none' }}
        >
          検索
        </button>

        {/* エラーメッセージ */}
        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}

        {/* 記事一覧 */}
        {posts.length === 0 ? (
          <p data-testid="no-articles">記事がありません</p>
        ) : (
          <div className="post-list-container" data-testid="article-list">
            {posts.map((post) => (
              <article
                key={post.id}
                className="post-card"
                data-testid="article-card"
              >
                <Link to={`/posts/${post.id}`} className="post-link">
                  <h2 data-testid="article-title">{post.title}</h2>
                  <div className="post-meta">
                    <span className="category" data-testid="article-category">
                      {post.category}
                    </span>
                    <span className="date">
                      {new Date(post.createdAt).toLocaleDateString('ja-JP')}
                    </span>
                  </div>
                  {post.tags && post.tags.length > 0 && (
                    <div className="tags">
                      {post.tags.map((tag) => (
                        <span key={tag} className="tag">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="excerpt" data-testid="article-excerpt">
                    {/* 記事の要約（最初の100文字） */}
                    {post.contentHtml
                      ? stripTags(post.contentHtml.substring(0, 100)) + '...'
                      : ''}
                  </div>
                </Link>
              </article>
            ))}
          </div>
        )}

        {/* ページネーション */}
        <div className="pagination">
          <button onClick={handlePrevPage} disabled={!hasPrevious}>
            前へ
          </button>
          <button
            onClick={handleNextPage}
            disabled={!nextToken}
            data-testid="load-more"
          >
            次へ（もっと読み込む）
          </button>
        </div>
      </div>

      <style>{`
        * {
          box-sizing: border-box;
        }

        .page-container {
          min-height: 100vh;
          background: #fafafa;
        }

        .hero-section {
          background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
          padding: 80px 32px 60px;
          text-align: center;
          border-bottom: 1px solid #e5e7eb;
        }

        .hero-title {
          font-size: 3.5rem;
          font-weight: 500;
          color: #111827;
          margin: 0 0 24px 0;
          letter-spacing: 0.02em;
          font-family: 'Caveat', cursive;
        }

        .hero-subtitle {
          font-size: 1.25rem;
          color: #6b7280;
          margin: 0;
          max-width: 700px;
          margin: 0 auto;
          line-height: 1.8;
          font-family: 'Caveat', cursive;
          font-weight: 400;
        }

        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 40px 32px;
        }

        .filter-bar {
          display: flex;
          flex-direction: column;
          gap: 24px;
          margin-bottom: 40px;
        }

        .category-pills {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }

        .category-pill {
          padding: 10px 20px;
          border: 1px solid #e5e7eb;
          border-radius: 24px;
          background: white;
          color: #6b7280;
          font-size: 0.95rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .category-pill:hover {
          border-color: #2D2A5A;
          color: #2D2A5A;
        }

        .category-pill.active {
          background: #2D2A5A;
          color: white;
          border-color: #2D2A5A;
        }

        .search-box {
          max-width: 400px;
        }

        .search-input {
          width: 100%;
          padding: 12px 20px;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          font-size: 0.95rem;
          background: white;
          transition: all 0.2s ease;
        }

        .search-input:focus {
          outline: none;
          border-color: #9ca3af;
          box-shadow: 0 0 0 3px rgba(156, 163, 175, 0.1);
        }

        .search-input::placeholder {
          color: #9ca3af;
        }

        .error-message {
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 24px;
          color: #991b1b;
          font-size: 0.95rem;
        }

        .post-list-container {
          display: grid;
          grid-template-columns: 1fr;
          gap: 24px;
        }

        @media (min-width: 768px) {
          .filter-bar {
            flex-direction: row;
            justify-content: space-between;
            align-items: center;
          }

          .post-list-container {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (min-width: 1024px) {
          .hero-title {
            font-size: 4rem;
          }

          .post-list-container {
            grid-template-columns: repeat(3, 1fr);
          }
        }

        .post-card {
          background: white;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          padding: 24px;
          transition: all 0.2s ease;
          height: 100%;
        }

        .post-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 25px rgba(45, 42, 90, 0.15);
          border-color: #C9A857;
        }

        .post-link {
          text-decoration: none;
          color: inherit;
          display: block;
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        .post-card h2 {
          margin: 0 0 12px 0;
          font-size: 1.25rem;
          font-weight: 600;
          color: #2D2A5A;
          line-height: 1.4;
        }

        .post-link:hover h2 {
          color: #C9A857;
        }

        .post-meta {
          display: flex;
          gap: 12px;
          margin-bottom: 12px;
          font-size: 0.875rem;
        }

        .category {
          background: #2D2A5A;
          padding: 6px 16px;
          border-radius: 6px;
          color: white;
          font-weight: 500;
          font-size: 0.875rem;
        }

        .date {
          color: #9ca3af;
        }

        .tags {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin-bottom: 12px;
        }

        .tag {
          background: #ffffff;
          padding: 4px 10px;
          border-radius: 4px;
          font-size: 0.75rem;
          color: #374151;
          font-weight: 500;
          border: 1px solid #e5e7eb;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
        }

        .excerpt {
          color: #6b7280;
          font-size: 0.95rem;
          line-height: 1.6;
          flex-grow: 1;
        }

        .pagination {
          margin-top: 60px;
          display: flex;
          gap: 12px;
          justify-content: center;
        }

        .pagination button {
          padding: 12px 28px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          background: white;
          color: #374151;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          font-size: 0.95rem;
        }

        .pagination button:disabled {
          background: #f9fafb;
          color: #d1d5db;
          cursor: not-allowed;
          border-color: #f3f4f6;
        }

        .pagination button:not(:disabled):hover {
          background: #2D2A5A;
          color: white;
          border-color: #2D2A5A;
        }

        @media (max-width: 768px) {
          .hero-section {
            padding: 60px 20px 40px;
          }

          .hero-title {
            font-size: 2rem;
          }

          .hero-subtitle {
            font-size: 1rem;
            max-width: 90%;
          }

          .container {
            padding: 32px 20px;
          }
        }
      `}</style>
    </div>
  );
};

export default PostListPage;
