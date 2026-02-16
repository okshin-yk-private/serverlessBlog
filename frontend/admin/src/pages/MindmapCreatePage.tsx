import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createMindmap } from '../api/mindmaps';
import type { MindmapNode } from '../api/mindmaps';
import { MindmapEditor } from '../components/MindmapEditor';
import { useMindmapHistory } from '../hooks/useMindmapHistory';
import AdminLayout from '../components/AdminLayout';

const defaultRootNode: MindmapNode = {
  id: 'root',
  text: 'Central Idea',
  children: [],
};

const MindmapCreatePage = () => {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [publishStatus, setPublishStatus] = useState<'draft' | 'published'>(
    'draft'
  );
  const [rootNode, setRootNode] = useState<MindmapNode>(defaultRootNode);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const history = useMindmapHistory(defaultRootNode);

  const handleNodesChange = useCallback(
    (updatedRoot: MindmapNode) => {
      history.pushState(updatedRoot);
      setRootNode(updatedRoot);
    },
    [history]
  );

  const handleSave = async () => {
    setValidationError(null);
    setError(null);

    if (!title.trim()) {
      setValidationError('タイトルは必須です');
      return;
    }

    try {
      setSaving(true);
      await createMindmap({
        title: title.trim(),
        nodes: rootNode,
        publishStatus,
      });
      navigate('/mindmaps');
    } catch (err) {
      console.error('マインドマップ作成エラー:', err);
      setError('マインドマップの作成に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    navigate('/mindmaps');
  };

  return (
    <AdminLayout title="New Mindmap" subtitle="新しいマインドマップを作成">
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
          <MindmapEditor
            rootNode={rootNode}
            onNodesChange={handleNodesChange}
            selectedNodeId={selectedNodeId}
            onNodeSelect={setSelectedNodeId}
            onUndo={history.undo}
            onRedo={history.redo}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
          />

          {/* ボタン */}
          <div style={{ display: 'flex', gap: '12px', paddingTop: '8px' }}>
            <button
              onClick={handleSave}
              disabled={saving}
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

export default MindmapCreatePage;
