/**
 * PostDetailPage Component
 *
 * Task 5.2: 記事詳細ページの実装（TDD）
 * Requirements: R33 (公開サイト), R7 (記事詳細取得機能), R12 (Markdownサポート)
 */

import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchPost } from '../services/api';
import type { Post } from '../types/post';
import { SEOHead } from '../components/SEOHead';

const PostDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const loadPost = async () => {
      if (!id) {
        setError('記事IDが指定されていません');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        setNotFound(false);

        const data = await fetchPost(id);
        setPost(data);
      } catch (err: any) {
        // Check if error is 404
        if (err?.response?.status === 404) {
          setNotFound(true);
          setError('記事が見つかりませんでした');
        } else {
          setError('記事の読み込みに失敗しました');
        }
        console.error('Failed to fetch post:', err);
      } finally {
        setLoading(false);
      }
    };

    loadPost();
  }, [id]);

  if (loading) {
    return (
      <div className="container">
        <p>読み込み中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container">
        <p>{error}</p>
        <Link to="/">← 一覧に戻る</Link>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="container">
        <p>記事が見つかりませんでした</p>
        <Link to="/">← 一覧に戻る</Link>
      </div>
    );
  }

  // Generate description from contentHtml (extract first 150 characters of text)
  const generateDescription = (html: string): string => {
    const text = html.replace(/<[^>]*>/g, ''); // Strip HTML tags
    return text.substring(0, 150) + (text.length > 150 ? '...' : '');
  };

  return (
    <div className="container" data-testid="post-detail-container">
      {/* SEO Meta Tags */}
      <SEOHead
        title={post.title}
        description={generateDescription(post.contentHtml)}
        keywords={post.tags}
        url={`${window.location.origin}/posts/${post.id}`}
        imageUrl={post.imageUrls && post.imageUrls.length > 0 ? post.imageUrls[0] : undefined}
        type="article"
        publishedDate={post.publishedAt || post.createdAt}
      />

      <Link to="/" className="back-link" data-testid="back-button">
        ← 一覧に戻る
      </Link>

      <article className="post-detail">
        <header className="post-header">
          <h1 data-testid="article-title">{post.title}</h1>
          <div className="post-meta" data-testid="article-meta">
            <span className="category" data-testid="article-category">{post.category}</span>
            <span className="date" data-testid="article-date">
              {new Date(post.createdAt).toLocaleDateString('ja-JP')}
            </span>
            <span className="author" data-testid="article-author">
              {post.authorId || 'Admin'}
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
        </header>

        {/* 画像表示 */}
        {post.imageUrls && post.imageUrls.length > 0 && (
          <div className="images">
            {post.imageUrls.map((url, index) => (
              <img key={index} src={url} alt={`Image ${index + 1}`} data-testid="article-image" />
            ))}
          </div>
        )}

        {/* HTMLコンテンツ表示 */}
        <div
          className="post-content"
          data-testid="article-content"
          dangerouslySetInnerHTML={{ __html: post.contentHtml }}
        />
      </article>

      {/* 関連記事セクション（将来の拡張用） */}
      {post.category && (
        <section className="related-articles" data-testid="related-articles">
          <h2>関連記事</h2>
          <div data-testid="related-article-card">
            {/* 関連記事がここに表示されます（将来実装） */}
            <p>関連記事は現在準備中です</p>
          </div>
        </section>
      )}

      <style>{`
        .container {
          max-width: 800px;
          margin: 0 auto;
          padding: 20px;
        }

        .back-link {
          display: inline-block;
          margin-bottom: 20px;
          color: #0066cc;
          text-decoration: none;
        }

        .back-link:hover {
          text-decoration: underline;
        }

        .post-detail {
          background-color: #fff;
          padding: 30px;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        }

        .post-header {
          margin-bottom: 30px;
        }

        .post-header h1 {
          margin: 0 0 15px 0;
          font-size: 2rem;
          line-height: 1.3;
        }

        .post-meta {
          display: flex;
          gap: 15px;
          color: #666;
          font-size: 0.9rem;
          margin-bottom: 15px;
        }

        .category {
          background-color: #e3f2fd;
          padding: 4px 12px;
          border-radius: 4px;
          color: #1976d2;
        }

        .tags {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .tag {
          background-color: #f5f5f5;
          padding: 4px 10px;
          border-radius: 4px;
          font-size: 0.85rem;
          color: #555;
        }

        .images {
          display: flex;
          flex-direction: column;
          gap: 15px;
          margin-bottom: 30px;
        }

        .images img {
          max-width: 100%;
          height: auto;
          border-radius: 8px;
        }

        .post-content {
          line-height: 1.8;
          color: #333;
        }

        .post-content h1,
        .post-content h2,
        .post-content h3,
        .post-content h4,
        .post-content h5,
        .post-content h6 {
          margin-top: 1.5em;
          margin-bottom: 0.5em;
        }

        .post-content p {
          margin-bottom: 1em;
        }

        .post-content img {
          max-width: 100%;
          height: auto;
        }

        .post-content code {
          background-color: #f5f5f5;
          padding: 2px 6px;
          border-radius: 3px;
          font-family: 'Courier New', monospace;
        }

        .post-content pre {
          background-color: #f5f5f5;
          padding: 15px;
          border-radius: 5px;
          overflow-x: auto;
        }

        .post-content pre code {
          background-color: transparent;
          padding: 0;
        }

        .related-articles {
          margin-top: 50px;
          padding: 30px;
          background-color: #f9f9f9;
          border-radius: 8px;
        }

        .related-articles h2 {
          margin: 0 0 20px 0;
          font-size: 1.5rem;
        }

        @media (max-width: 768px) {
          .container {
            padding: 15px;
          }

          .post-detail {
            padding: 20px;
          }

          .post-header h1 {
            font-size: 1.5rem;
          }
        }
      `}</style>
    </div>
  );
};

export default PostDetailPage;
