import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getMindmap, updateMindmap } from '../api/mindmaps';
import type { MindmapNode } from '../api/mindmaps';
import { MindmapEditor } from '../components/MindmapEditor';
import AdminLayout from '../components/AdminLayout';
import { MindmapEditSkeleton } from '../components/skeleton';

const MindmapEditPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [publishStatus, setPublishStatus] = useState<'draft' | 'published'>(
    'draft'
  );
  const [rootNode, setRootNode] = useState<MindmapNode | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchMindmap = async () => {
      if (!id) {
        setError('マインドマップIDが指定されていません');
        setLoading(false);
        return;
      }

      try {
        const mindmap = await getMindmap(id);
        if (cancelled) return;
        setTitle(mindmap.title);
        setPublishStatus(mindmap.publishStatus);
        setRootNode(mindmap.nodes);
      } catch (err) {
        if (cancelled) return;
        console.error('マインドマップ取得エラー:', err);
        setError('マインドマップの取得に失敗しました');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchMindmap();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleNodesChange = useCallback((updatedRoot: MindmapNode) => {
    setRootNode(updatedRoot);
  }, []);

  const handleSave = async () => {
    setValidationError(null);
    setError(null);

    if (!title.trim()) {
      setValidationError('タイトルは必須です');
      return;
    }

    if (!id || !rootNode) {
      setError('マインドマップデータが不正です');
      return;
    }

    try {
      setSaving(true);
      await updateMindmap(id, {
        title: title.trim(),
        nodes: rootNode,
        publishStatus,
      });
      navigate('/mindmaps');
    } catch (err) {
      console.error('マインドマップ更新エラー:', err);
      setError('マインドマップの更新に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    navigate('/mindmaps');
  };

  if (loading) {
    return (
      <AdminLayout title="Edit Mindmap">
        <MindmapEditSkeleton />
      </AdminLayout>
    );
  }

  if (error && !rootNode) {
    return (
      <AdminLayout title="Edit Mindmap">
        <div className="admin-alert admin-alert-error">{error}</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Edit Mindmap" subtitle="マインドマップを編集">
      {error && (
        <div
          className="admin-alert admin-alert-error"
          data-testid="error-message"
        >
          {error}
        </div>
      )}

      <div className="admin-card">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* タイトル入力 */}
          <div>
            <label
              htmlFor="mindmap-title"
              style={{ display: 'block', fontWeight: 600, marginBottom: '4px' }}
            >
              タイトル
            </label>
            <input
              id="mindmap-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="admin-input"
              placeholder="マインドマップのタイトル"
              style={{ width: '100%' }}
            />
            {validationError && (
              <p
                style={{
                  color: '#ef4444',
                  fontSize: '0.875rem',
                  marginTop: '4px',
                }}
                data-testid="validation-error"
              >
                {validationError}
              </p>
            )}
          </div>

          {/* 公開状態 */}
          <div>
            <label
              htmlFor="mindmap-status"
              style={{ display: 'block', fontWeight: 600, marginBottom: '4px' }}
            >
              公開状態
            </label>
            <select
              id="mindmap-status"
              value={publishStatus}
              onChange={(e) =>
                setPublishStatus(e.target.value as 'draft' | 'published')
              }
              className="admin-input"
            >
              <option value="draft">下書き</option>
              <option value="published">公開</option>
            </select>
          </div>

          {/* マインドマップエディタ */}
          {rootNode && (
            <MindmapEditor
              key={id}
              rootNode={rootNode}
              onNodesChange={handleNodesChange}
              selectedNodeId={selectedNodeId}
              onNodeSelect={setSelectedNodeId}
            />
          )}

          {/* ボタン */}
          <div style={{ display: 'flex', gap: '12px', paddingTop: '8px' }}>
            <button
              onClick={handleSave}
              disabled={saving || !rootNode}
              className="admin-btn admin-btn-primary"
            >
              {saving ? '保存中...' : '保存'}
            </button>
            <button
              onClick={handleCancel}
              disabled={saving}
              className="admin-btn admin-btn-secondary"
            >
              キャンセル
            </button>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default MindmapEditPage;
