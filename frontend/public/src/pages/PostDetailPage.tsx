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

        const data = await fetchPost(id);
        setPost(data);
      } catch (err: any) {
        // Check if error is 404
        if (err?.response?.status === 404) {
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
        keywords={Array.isArray(post.tags) ? post.tags : []}
        url={`${window.location.origin}/posts/${post.id}`}
        imageUrl={
          post.imageUrls && post.imageUrls.length > 0
            ? post.imageUrls[0]
            : undefined
        }
        type="article"
        author={post.authorId || 'Admin'}
        publishedDate={post.publishedAt || post.createdAt}
        modifiedDate={post.updatedAt}
      />

      <Link to="/" className="back-link" data-testid="back-button">
        ← 一覧に戻る
      </Link>

      <article className="post-detail">
        <header className="post-header">
          <h1 data-testid="article-title">{post.title}</h1>
          <div className="post-meta" data-testid="article-meta">
            <span className="category" data-testid="article-category">
              {post.category}
            </span>
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
              <img
                key={index}
                src={url}
                alt={`Image ${index + 1}`}
                data-testid="article-image"
              />
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
          padding: 30px 20px;
        }

        .back-link {
          display: inline-flex;
          align-items: center;
          margin-bottom: 25px;
          color: #1e40af;
          text-decoration: none;
          font-weight: 600;
          font-size: 1rem;
          transition: color 0.2s;
        }

        .back-link:hover {
          color: #0f172a;
        }

        .post-detail {
          background-color: #fff;
          padding: 40px;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
        }

        .post-header {
          margin-bottom: 40px;
          border-bottom: 2px solid #f0f0f0;
          padding-bottom: 25px;
        }

        .post-header h1 {
          margin: 0 0 20px 0;
          font-size: 2.5rem;
          font-weight: 700;
          line-height: 1.3;
          color: #1a202c;
          letter-spacing: -0.5px;
        }

        .post-meta {
          display: flex;
          gap: 15px;
          color: #666;
          font-size: 0.95rem;
          margin-bottom: 18px;
          flex-wrap: wrap;
        }

        .category {
          background: linear-gradient(135deg, #0f172a 0%, #1e40af 100%);
          padding: 6px 14px;
          border-radius: 6px;
          color: white;
          font-weight: 600;
        }

        .tags {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .tag {
          background-color: #e2e8f0;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 0.9rem;
          color: #2d3748;
          font-weight: 500;
        }

        .images {
          display: flex;
          flex-direction: column;
          gap: 20px;
          margin-bottom: 35px;
        }

        .images img {
          max-width: 100%;
          height: auto;
          border-radius: 10px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .post-content {
          line-height: 1.8;
          color: #2d3748;
          font-size: 1.05rem;
        }

        .post-content h1,
        .post-content h2,
        .post-content h3,
        .post-content h4,
        .post-content h5,
        .post-content h6 {
          margin-top: 2em;
          margin-bottom: 0.75em;
          font-weight: 700;
          color: #1a202c;
          line-height: 1.3;
        }

        .post-content h2 {
          font-size: 1.8rem;
          border-bottom: 2px solid #e2e8f0;
          padding-bottom: 0.5em;
        }

        .post-content h3 {
          font-size: 1.5rem;
        }

        .post-content p {
          margin-bottom: 1.2em;
        }

        .post-content img {
          max-width: 100%;
          height: auto;
          border-radius: 8px;
          margin: 1.5em 0;
        }

        .post-content code {
          background-color: #2d3748;
          color: #48bb78;
          padding: 3px 8px;
          border-radius: 4px;
          font-family: 'Courier New', 'Consolas', monospace;
          font-size: 0.9em;
        }

        .post-content pre {
          background-color: #2d3748;
          padding: 20px;
          border-radius: 8px;
          overflow-x: auto;
          margin: 1.5em 0;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }

        .post-content pre code {
          background-color: transparent;
          color: #48bb78;
          padding: 0;
        }

        .related-articles {
          margin-top: 60px;
          padding: 35px;
          background: linear-gradient(135deg, #f7f8fa 0%, #e9ecef 100%);
          border-radius: 12px;
        }

        .related-articles h2 {
          margin: 0 0 25px 0;
          font-size: 1.8rem;
          font-weight: 700;
          color: #1a202c;
        }

        @media (max-width: 768px) {
          .container {
            padding: 20px 15px;
          }

          .post-detail {
            padding: 25px;
          }

          .post-header h1 {
            font-size: 1.8rem;
          }

          .post-content {
            font-size: 1rem;
          }

          .post-content h2 {
            font-size: 1.5rem;
          }

          .post-content h3 {
            font-size: 1.3rem;
          }
        }
      `}</style>
    </div>
  );
};

export default PostDetailPage;
