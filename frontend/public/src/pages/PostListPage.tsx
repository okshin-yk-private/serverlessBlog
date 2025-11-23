/**
 * PostListPage Component
 *
 * Task 5.1: 記事一覧ページの実装（TDD）
 * Requirements: R33 (公開サイト), R6 (記事一覧取得機能)
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { fetchPosts } from '../services/api';
import type { Post } from '../types/post';
import { SEOHead } from '../components/SEOHead';

const PostListPage: React.FC = () => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextToken, setNextToken] = useState<string | undefined>(undefined);
  const [category, setCategory] = useState<string>('');
  const [tags, setTags] = useState<string>('');
  const [hasPrevious, setHasPrevious] = useState(false);

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
    return (
      <div className="container">
        <p>読み込み中...</p>
      </div>
    );
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
    return 'ブログ記事一覧';
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
    <div className="container">
      {/* SEO Meta Tags */}
      <SEOHead
        title={generateSEOTitle()}
        description={generateSEODescription()}
        keywords={tags ? [tags] : ['blog', 'technology', 'life']}
        url={window.location.href}
        type="website"
      />

      <h1>ブログ記事一覧</h1>

      {/* カテゴリフィルタ */}
      <div className="filter-section">
        <label htmlFor="category-select">カテゴリ:</label>
        <select
          id="category-select"
          data-testid="category-filter"
          value={category}
          onChange={handleCategoryChange}
          aria-label="カテゴリ"
        >
          <option value="" data-testid="category-option">
            すべて
          </option>
          <option value="technology" data-testid="category-option">
            Technology
          </option>
          <option value="life" data-testid="category-option">
            Life
          </option>
        </select>
      </div>

      {/* タグフィルタ */}
      <div className="filter-section">
        <label htmlFor="tag-input">タグ:</label>
        <input
          id="tag-input"
          data-testid="search-input"
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="タグを入力"
          aria-label="タグ"
        />
        <button
          onClick={handleTagSearch}
          data-testid="search-button"
          aria-label="検索"
        >
          検索
        </button>
      </div>

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
                <div className="excerpt" data-testid="article-excerpt">
                  {/* 記事の要約（最初の100文字） */}
                  {post.contentHtml
                    ? post.contentHtml
                        .substring(0, 100)
                        .replace(/<[^>]*>/g, '') + '...'
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

      <style>{`
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 30px 20px;
        }

        .container > h1 {
          font-size: 2.5rem;
          font-weight: 700;
          color: #1a202c;
          margin-bottom: 35px;
          letter-spacing: -0.5px;
        }

        .error-message {
          background-color: #fee;
          border: 1px solid #fcc;
          border-radius: 4px;
          padding: 10px 15px;
          margin-bottom: 20px;
          color: #c33;
        }

        .filter-section {
          margin-bottom: 25px;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .filter-section label {
          font-weight: 600;
          color: #2d3748;
          font-size: 1rem;
        }

        .filter-section select,
        .filter-section input {
          padding: 10px 14px;
          border: 2px solid #e2e8f0;
          border-radius: 6px;
          font-size: 1rem;
          transition: border-color 0.2s;
          background-color: white;
        }

        .filter-section select:focus,
        .filter-section input:focus {
          outline: none;
          border-color: #1e40af;
        }

        .filter-section button {
          padding: 10px 20px;
          border: none;
          border-radius: 6px;
          background: linear-gradient(135deg, #0f172a 0%, #1e40af 100%);
          color: white;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
          font-size: 1rem;
        }

        .filter-section button:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(30, 64, 175, 0.4);
        }

        .filter-section button:active {
          transform: translateY(0);
        }

        .post-list-container {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        @media (min-width: 768px) {
          .post-list-container {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (min-width: 1024px) {
          .post-list-container {
            grid-template-columns: repeat(3, 1fr);
          }
        }

        .post-card {
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          padding: 20px;
          background-color: #fff;
          transition: box-shadow 0.2s;
        }

        .post-card:hover {
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        }

        .post-link {
          text-decoration: none;
          color: inherit;
          display: block;
        }

        .post-card h2 {
          margin: 0 0 10px 0;
          font-size: 1.5rem;
          color: #333;
        }

        .post-link:hover h2 {
          color: #1e40af;
        }

        .post-meta {
          display: flex;
          gap: 10px;
          color: #666;
          font-size: 0.9rem;
        }

        .pagination {
          margin-top: 40px;
          display: flex;
          gap: 15px;
          justify-content: center;
        }

        .pagination button {
          padding: 12px 24px;
          border: none;
          border-radius: 6px;
          background: linear-gradient(135deg, #0f172a 0%, #1e40af 100%);
          color: white;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
          font-size: 1rem;
        }

        .pagination button:disabled {
          background: #e2e8f0;
          color: #a0aec0;
          cursor: not-allowed;
          transform: none;
        }

        .pagination button:not(:disabled):hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(30, 64, 175, 0.4);
        }

        .pagination button:not(:disabled):active {
          transform: translateY(0);
        }
      `}</style>
    </div>
  );
};

export default PostListPage;
