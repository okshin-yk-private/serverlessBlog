import { useState, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getPosts, deletePost, updatePost } from '../api/posts';
import type { Post } from '../api/posts';
import ConfirmDialog from '../components/ConfirmDialog';
import AdminLayout from '../components/AdminLayout';

type TabType = 'published' | 'draft';

const PostListPage = () => {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<TabType>('published');
  const [posts, setPosts] = useState<Post[]>([]);
  const [nextToken, setNextToken] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 削除確認ダイアログ用のstate
  const [showConfirmDialog, setShowConfirmDialog] = useState<boolean>(false);
  const [postToDelete, setPostToDelete] = useState<string | null>(null);

  const loadPosts = async (publishStatus: TabType, token?: string) => {
    try {
      setLoading(true);
      setError(null);
      const response = await getPosts({
        publishStatus,
        nextToken: token,
        limit: 100,
      });
      setPosts(response.posts);
      setNextToken(response.nextToken);
    } catch (err) {
      console.error('記事取得エラー:', err);
      setError('記事の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPosts(activeTab);
  }, [activeTab, location.key]); // location.keyを追加してナビゲーション時に再読み込み

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setNextToken(undefined);
    setSearchQuery(''); // タブ切り替え時に検索クエリをリセット
  };

  const handleNextPage = () => {
    if (nextToken) {
      loadPosts(activeTab, nextToken);
    }
  };

  const handleDeleteClick = (id: string) => {
    setPostToDelete(id);
    setShowConfirmDialog(true);
  };

  const handleDeleteConfirm = async () => {
    if (!postToDelete) return;

    try {
      setError(null);
      setSuccessMessage(null);
      await deletePost(postToDelete);
      setSuccessMessage('記事を削除しました');
      setShowConfirmDialog(false);
      setPostToDelete(null);
      await loadPosts(activeTab);
    } catch (err) {
      console.error('削除エラー:', err);
      setError('記事の削除に失敗しました');
      setShowConfirmDialog(false);
      setPostToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setShowConfirmDialog(false);
    setPostToDelete(null);
  };

  const handlePublishToggle = async (post: Post) => {
    try {
      setError(null);
      setSuccessMessage(null);
      const newStatus: 'draft' | 'published' =
        post.publishStatus === 'published' ? 'draft' : 'published';

      await updatePost(post.id, {
        title: post.title,
        contentMarkdown: post.contentMarkdown,
        category: post.category,
        publishStatus: newStatus,
      });

      setSuccessMessage(
        `記事を${newStatus === 'published' ? '公開' : '下書きに変更'}しました`
      );
      await loadPosts(activeTab);
    } catch (err) {
      console.error('ステータス更新エラー:', err);
      setError('記事のステータス更新に失敗しました');
    }
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toISOString().split('T')[0];
  };

  // 検索フィルター
  const filteredPosts = useMemo(() => {
    if (!searchQuery.trim()) {
      return posts;
    }
    return posts.filter((post) =>
      post.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [posts, searchQuery]);

  if (loading) {
    return (
      <AdminLayout title="Articles">
        <div className="admin-loading">読み込み中...</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Articles"
      subtitle="記事の管理・編集"
      actions={
        <Link
          to="/posts/new"
          data-testid="new-article-button"
          className="admin-btn admin-btn-primary"
        >
          + 新規作成
        </Link>
      }
    >
      {error && (
        <div
          className="admin-alert admin-alert-error"
          data-testid="error-message"
        >
          {error}
        </div>
      )}

      {successMessage && (
        <div
          className="admin-alert admin-alert-success"
          data-testid="success-message"
        >
          {successMessage}
        </div>
      )}

      {/* 検索バー */}
      <div style={{ marginBottom: '24px' }}>
        <input
          type="text"
          data-testid="admin-search-input"
          placeholder="タイトルで検索..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="admin-input"
          style={{ maxWidth: '400px' }}
        />
      </div>

      {/* タブ */}
      <div className="admin-tabs" data-testid="admin-filter-dropdown">
        <button
          className={`admin-tab ${activeTab === 'published' ? 'active' : ''}`}
          onClick={() => handleTabChange('published')}
          data-testid="publish-filter-tab"
        >
          公開済み
        </button>
        <button
          className={`admin-tab ${activeTab === 'draft' ? 'active' : ''}`}
          onClick={() => handleTabChange('draft')}
          data-testid="draft-filter-tab"
        >
          下書き
        </button>
      </div>

      {/* 記事リスト */}
      {filteredPosts.length === 0 ? (
        <div className="admin-card">
          <div className="admin-empty">
            <p className="admin-empty-title">
              {searchQuery ? '検索結果が見つかりません' : '記事がありません'}
            </p>
          </div>
        </div>
      ) : (
        <div className="admin-list" data-testid="admin-article-list">
          {filteredPosts.map((post) => (
            <div
              key={post.id}
              data-testid="admin-article-item"
              className="admin-list-item"
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '16px',
                }}
              >
                <div style={{ flex: 1 }}>
                  <h3
                    style={{
                      fontSize: '1.125rem',
                      fontWeight: 600,
                      color: '#111827',
                      margin: '0 0 8px 0',
                    }}
                    data-testid="admin-article-title"
                  >
                    {post.title}
                  </h3>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      flexWrap: 'wrap',
                      fontSize: '0.875rem',
                      color: '#6b7280',
                    }}
                  >
                    <span
                      data-testid="admin-article-status"
                      className={`admin-badge ${activeTab === 'published' ? 'admin-badge-success' : 'admin-badge-warning'}`}
                    >
                      {activeTab === 'published' ? '公開済み' : '下書き'}
                    </span>
                    <span className="admin-badge admin-badge-dark">
                      {post.category || '未分類'}
                    </span>
                    <span>{formatDate(post.createdAt)}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  {/* 公開/下書き切り替えボタン */}
                  {post.publishStatus === 'draft' ? (
                    <button
                      onClick={() => handlePublishToggle(post)}
                      data-testid="publish-article-button"
                      className="admin-btn admin-btn-success admin-btn-sm"
                    >
                      公開
                    </button>
                  ) : (
                    <button
                      onClick={() => handlePublishToggle(post)}
                      data-testid="draft-article-button"
                      className="admin-btn admin-btn-warning admin-btn-sm"
                    >
                      下書きに戻す
                    </button>
                  )}
                  <Link
                    to={`/posts/edit/${post.id}`}
                    data-testid="edit-article-button"
                    className="admin-btn admin-btn-secondary admin-btn-sm"
                  >
                    編集
                  </Link>
                  <button
                    onClick={() => handleDeleteClick(post.id)}
                    data-testid="delete-article-button"
                    className="admin-btn admin-btn-danger admin-btn-sm"
                  >
                    削除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {nextToken && (
        <div
          style={{
            marginTop: '32px',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <button
            onClick={handleNextPage}
            className="admin-btn admin-btn-secondary"
          >
            次へ
          </button>
        </div>
      )}

      {/* 削除確認ダイアログ */}
      <ConfirmDialog
        isOpen={showConfirmDialog}
        message="本当にこの記事を削除しますか？"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
    </AdminLayout>
  );
};

export default PostListPage;
