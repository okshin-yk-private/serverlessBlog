import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getPosts } from '../api/posts';
import type { Post } from '../api/posts';
import AdminLayout from '../components/AdminLayout';

const DashboardPage = () => {
  const [publishedPosts, setPublishedPosts] = useState<Post[]>([]);
  const [draftPosts, setDraftPosts] = useState<Post[]>([]);
  const [publishedTotal, setPublishedTotal] = useState<number>(0);
  const [draftTotal, setDraftTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // 公開記事を取得
      const publishedResponse = await getPosts({
        publishStatus: 'published',
        limit: 5,
      });
      setPublishedPosts(publishedResponse.posts);
      setPublishedTotal(publishedResponse.total);

      // 下書き記事を取得
      const draftResponse = await getPosts({
        publishStatus: 'draft',
        limit: 5,
      });
      setDraftPosts(draftResponse.posts);
      setDraftTotal(draftResponse.total);
    } catch (err) {
      setError('エラーが発生しました');
      console.error('Failed to fetch dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  if (loading) {
    return (
      <AdminLayout title="Dashboard">
        <div className="admin-loading">読み込み中...</div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout title="Dashboard">
        <div className="admin-alert admin-alert-error">{error}</div>
        <button
          onClick={fetchDashboardData}
          className="admin-btn admin-btn-primary"
        >
          再試行
        </button>
      </AdminLayout>
    );
  }

  const allPosts = [...publishedPosts, ...draftPosts];
  const hasNoPosts = allPosts.length === 0;

  return (
    <AdminLayout title="Dashboard" subtitle="Polylex管理画面へようこそ">
      <div data-testid="dashboard">
        {/* 記事統計 */}
        <div className="admin-stat-grid">
          <div className="admin-stat-card">
            <p className="admin-stat-label">公開記事数</p>
            <p className="admin-stat-value accent">{publishedTotal}</p>
          </div>
          <div className="admin-stat-card">
            <p className="admin-stat-label">下書き記事数</p>
            <p className="admin-stat-value">{draftTotal}</p>
          </div>
        </div>

        {/* クイックアクション */}
        <div className="admin-card">
          <h2 className="admin-card-title">クイックアクション</h2>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <Link to="/posts" className="admin-btn admin-btn-secondary">
              記事一覧を見る
            </Link>
            <Link to="/posts/new" className="admin-btn admin-btn-primary">
              + 新規記事作成
            </Link>
          </div>
        </div>

        {/* 記事がない場合のメッセージ */}
        {hasNoPosts && (
          <div className="admin-card">
            <div className="admin-empty">
              <p className="admin-empty-title">記事がありません</p>
              <p className="admin-empty-desc">新しい記事を作成しましょう</p>
            </div>
          </div>
        )}

        {/* 公開記事一覧 */}
        {publishedPosts.length > 0 && (
          <div style={{ marginBottom: '32px' }}>
            <h2
              style={{
                fontSize: '1.25rem',
                fontWeight: 600,
                color: '#111827',
                marginBottom: '16px',
              }}
            >
              最近の公開記事
            </h2>
            <div className="admin-list">
              {publishedPosts.map((post) => (
                <div key={post.id} className="admin-list-item">
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                    }}
                  >
                    <div>
                      <h3
                        style={{
                          fontSize: '1.125rem',
                          fontWeight: 600,
                          color: '#111827',
                          margin: '0 0 8px 0',
                        }}
                      >
                        {post.title}
                      </h3>
                      <div
                        style={{
                          display: 'flex',
                          gap: '16px',
                          fontSize: '0.875rem',
                          color: '#6b7280',
                        }}
                      >
                        <span className="admin-badge admin-badge-dark">
                          {post.category}
                        </span>
                        <span>{formatDate(post.createdAt)}</span>
                      </div>
                    </div>
                    <Link
                      to={`/posts/edit/${post.id}`}
                      className="admin-btn admin-btn-secondary admin-btn-sm"
                    >
                      編集
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 下書き記事一覧 */}
        {draftPosts.length > 0 && (
          <div>
            <h2
              style={{
                fontSize: '1.25rem',
                fontWeight: 600,
                color: '#111827',
                marginBottom: '16px',
              }}
            >
              最近の下書き
            </h2>
            <div className="admin-list">
              {draftPosts.map((post) => (
                <div key={post.id} className="admin-list-item">
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                    }}
                  >
                    <div>
                      <h3
                        style={{
                          fontSize: '1.125rem',
                          fontWeight: 600,
                          color: '#111827',
                          margin: '0 0 8px 0',
                        }}
                      >
                        {post.title}
                      </h3>
                      <div
                        style={{
                          display: 'flex',
                          gap: '16px',
                          fontSize: '0.875rem',
                          color: '#6b7280',
                        }}
                      >
                        <span className="admin-badge admin-badge-warning">
                          {post.category}
                        </span>
                        <span>{formatDate(post.createdAt)}</span>
                      </div>
                    </div>
                    <Link
                      to={`/posts/edit/${post.id}`}
                      className="admin-btn admin-btn-secondary admin-btn-sm"
                    >
                      編集
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default DashboardPage;
