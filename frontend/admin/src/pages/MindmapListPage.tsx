import { useState, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { listMindmaps, deleteMindmap } from '../api/mindmaps';
import type { Mindmap } from '../api/mindmaps';
import ConfirmDialog from '../components/ConfirmDialog';
import AdminLayout from '../components/AdminLayout';
import { MindmapListSkeleton } from '../components/skeleton';

type TabType = 'all' | 'published' | 'draft';

const MindmapListPage = () => {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [mindmaps, setMindmaps] = useState<Mindmap[]>([]);
  const [nextToken, setNextToken] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [showConfirmDialog, setShowConfirmDialog] = useState<boolean>(false);
  const [mindmapToDelete, setMindmapToDelete] = useState<string | null>(null);

  const loadMindmaps = async (token?: string) => {
    try {
      setLoading(true);
      setError(null);
      const response = await listMindmaps({
        limit: 100,
        nextToken: token,
      });
      setMindmaps(response.items);
      setNextToken(response.nextToken);
    } catch (err) {
      console.error('マインドマップ取得エラー:', err);
      setError('マインドマップの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMindmaps();
  }, [location.key]);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setSearchQuery('');
  };

  const handleNextPage = () => {
    if (nextToken) {
      loadMindmaps(nextToken);
    }
  };

  const handleDeleteClick = (id: string) => {
    setMindmapToDelete(id);
    setShowConfirmDialog(true);
  };

  const handleDeleteConfirm = async () => {
    if (!mindmapToDelete) return;

    try {
      setError(null);
      setSuccessMessage(null);
      await deleteMindmap(mindmapToDelete);
      setSuccessMessage('マインドマップを削除しました');
      setShowConfirmDialog(false);
      setMindmapToDelete(null);
      await loadMindmaps();
    } catch (err) {
      console.error('削除エラー:', err);
      setError('マインドマップの削除に失敗しました');
      setShowConfirmDialog(false);
      setMindmapToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setShowConfirmDialog(false);
    setMindmapToDelete(null);
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toISOString().split('T')[0];
  };

  const filteredMindmaps = useMemo(() => {
    let result = mindmaps;

    // タブによるフィルタ
    if (activeTab === 'published') {
      result = result.filter((m) => m.publishStatus === 'published');
    } else if (activeTab === 'draft') {
      result = result.filter((m) => m.publishStatus === 'draft');
    }

    // 検索フィルタ
    if (searchQuery.trim()) {
      result = result.filter((m) =>
        m.title.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return result;
  }, [mindmaps, activeTab, searchQuery]);

  if (loading) {
    return (
      <AdminLayout title="Mindmaps">
        <MindmapListSkeleton />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Mindmaps"
      subtitle="マインドマップの管理・編集"
      actions={
        <Link
          to="/mindmaps/new"
          data-testid="new-mindmap-button"
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
          className={`admin-tab ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => handleTabChange('all')}
          data-testid="all-filter-tab"
        >
          すべて
        </button>
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

      {/* マインドマップリスト */}
      {filteredMindmaps.length === 0 ? (
        <div className="admin-card">
          <div className="admin-empty">
            <p className="admin-empty-title">
              {searchQuery
                ? '検索結果が見つかりません'
                : 'マインドマップがありません'}
            </p>
          </div>
        </div>
      ) : (
        <div className="admin-list" data-testid="admin-mindmap-list">
          {filteredMindmaps.map((mindmap) => (
            <div
              key={mindmap.id}
              data-testid="admin-mindmap-item"
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
                    data-testid="admin-mindmap-title"
                  >
                    {mindmap.title}
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
                      data-testid="admin-mindmap-status"
                      className={`admin-badge ${mindmap.publishStatus === 'published' ? 'admin-badge-success' : 'admin-badge-warning'}`}
                    >
                      {mindmap.publishStatus === 'published'
                        ? '公開済み'
                        : '下書き'}
                    </span>
                    <span>{formatDate(mindmap.createdAt)}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                  <Link
                    to={`/mindmaps/edit/${mindmap.id}`}
                    data-testid="edit-mindmap-button"
                    className="admin-btn admin-btn-secondary admin-btn-sm"
                  >
                    編集
                  </Link>
                  <button
                    onClick={() => handleDeleteClick(mindmap.id)}
                    data-testid="delete-mindmap-button"
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

      <ConfirmDialog
        isOpen={showConfirmDialog}
        message="本当にこのマインドマップを削除しますか？"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
    </AdminLayout>
  );
};

export default MindmapListPage;
