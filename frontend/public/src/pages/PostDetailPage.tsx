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
import { PostDetailSkeleton } from '../components/skeleton';

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
    return <PostDetailSkeleton />;
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
        * {
          box-sizing: border-box;
        }

        .container {
          max-width: 900px;
          margin: 0 auto;
          padding: 48px 32px 80px;
          background: #fafafa;
          min-height: 100vh;
        }

        .back-link {
          display: inline-flex;
          align-items: center;
          margin-bottom: 32px;
          color: #6b7280;
          text-decoration: none;
          font-weight: 500;
          font-size: 0.95rem;
          transition: all 0.2s ease;
          padding: 8px 16px;
          border-radius: 8px;
          border: 1px solid transparent;
        }

        .back-link:hover {
          color: #111827;
          background: white;
          border-color: #e5e7eb;
        }

        .post-detail {
          background: white;
          padding: 56px;
          border-radius: 16px;
          border: 1px solid #e5e7eb;
        }

        .post-header {
          margin-bottom: 48px;
          padding-bottom: 32px;
          border-bottom: 1px solid #e5e7eb;
        }

        .post-header h1 {
          margin: 0 0 24px 0;
          font-size: 2.75rem;
          font-weight: 700;
          line-height: 1.2;
          color: #111827;
          letter-spacing: -0.025em;
        }

        .post-meta {
          display: flex;
          gap: 16px;
          font-size: 0.95rem;
          margin-bottom: 20px;
          flex-wrap: wrap;
          align-items: center;
        }

        .category {
          background: #111827;
          padding: 6px 16px;
          border-radius: 6px;
          color: white;
          font-weight: 500;
          font-size: 0.875rem;
        }

        .date,
        .author {
          color: #6b7280;
        }

        .tags {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .tag {
          background: #ffffff;
          padding: 6px 14px;
          border-radius: 6px;
          font-size: 0.875rem;
          color: #374151;
          font-weight: 500;
          border: 1px solid #e5e7eb;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
        }

        .images {
          display: flex;
          flex-direction: column;
          gap: 24px;
          margin-bottom: 40px;
        }

        .images img {
          max-width: 100%;
          height: auto;
          border-radius: 12px;
          border: 1px solid #e5e7eb;
        }

        .post-content {
          line-height: 1.8;
          color: #374151;
          font-size: 1.0625rem;
        }

        .post-content h1,
        .post-content h2,
        .post-content h3,
        .post-content h4,
        .post-content h5,
        .post-content h6 {
          margin-top: 2.5em;
          margin-bottom: 0.875em;
          font-weight: 700;
          color: #111827;
          line-height: 1.3;
          letter-spacing: -0.015em;
        }

        .post-content h2 {
          font-size: 1.875rem;
          border-bottom: 1px solid #e5e7eb;
          padding-bottom: 0.5em;
        }

        .post-content h3 {
          font-size: 1.5rem;
        }

        .post-content h4 {
          font-size: 1.25rem;
        }

        .post-content p {
          margin-bottom: 1.5em;
        }

        .post-content a {
          color: #111827;
          text-decoration: underline;
          text-underline-offset: 2px;
          transition: color 0.2s ease;
        }

        .post-content a:hover {
          color: #6b7280;
        }

        .post-content strong {
          color: #111827;
          font-weight: 600;
        }

        .post-content ul,
        .post-content ol {
          margin: 1.5em 0;
          padding-left: 1.75em;
        }

        .post-content li {
          margin-bottom: 0.5em;
        }

        .post-content img {
          max-width: 100%;
          height: auto;
          border-radius: 12px;
          margin: 2em 0;
          border: 1px solid #e5e7eb;
        }

        .post-content code {
          background: #f3f4f6;
          color: #111827;
          padding: 3px 8px;
          border-radius: 6px;
          font-family: 'Monaco', 'Courier New', monospace;
          font-size: 0.9em;
        }

        .post-content pre {
          background: #1f2937;
          padding: 24px;
          border-radius: 12px;
          overflow-x: auto;
          margin: 2em 0;
        }

        .post-content pre code {
          background: transparent;
          color: #e5e7eb;
          padding: 0;
          font-size: 0.9rem;
        }

        .post-content blockquote {
          border-left: 4px solid #e5e7eb;
          padding-left: 1.5em;
          margin: 1.5em 0;
          color: #6b7280;
          font-style: italic;
        }

        .related-articles {
          margin-top: 80px;
          padding: 40px;
          background: #f9fafb;
          border-radius: 16px;
          border: 1px solid #e5e7eb;
        }

        .related-articles h2 {
          margin: 0 0 24px 0;
          font-size: 1.75rem;
          font-weight: 700;
          color: #111827;
        }

        .related-articles p {
          color: #6b7280;
          margin: 0;
        }

        @media (max-width: 768px) {
          .container {
            padding: 32px 20px 60px;
          }

          .post-detail {
            padding: 32px 24px;
            border-radius: 12px;
          }

          .post-header h1 {
            font-size: 2rem;
          }

          .post-content {
            font-size: 1rem;
          }

          .post-content h2 {
            font-size: 1.5rem;
          }

          .post-content h3 {
            font-size: 1.25rem;
          }

          .related-articles {
            padding: 24px;
          }
        }
      `}</style>
    </div>
  );
};

export default PostDetailPage;
