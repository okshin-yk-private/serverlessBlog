import { useMemo } from 'react';
import type { MindmapNode } from '../api/mindmaps';
import { findNodeInTree } from '../utils/mindmapLayout';

const NOTE_MAX_LENGTH = 1000;

export interface NodePropertyPanelProps {
  rootNode: MindmapNode;
  selectedNodeId: string | null;
  onMetadataChange: (
    nodeId: string,
    metadata: Partial<Pick<MindmapNode, 'color' | 'linkUrl' | 'note'>>
  ) => void;
}

export function NodePropertyPanel({
  rootNode,
  selectedNodeId,
  onMetadataChange,
}: NodePropertyPanelProps) {
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return findNodeInTree(rootNode, selectedNodeId);
  }, [rootNode, selectedNodeId]);

  if (!selectedNode) return null;

  const noteLength = selectedNode.note?.length ?? 0;
  const isNoteOverLimit = noteLength > NOTE_MAX_LENGTH;

  return (
    <div
      data-testid="node-property-panel"
      style={{
        width: '260px',
        borderLeft: '1px solid #e5e7eb',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        overflowY: 'auto',
      }}
    >
      <h3
        style={{
          margin: 0,
          fontSize: '14px',
          fontWeight: 600,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {selectedNode.text}
      </h3>

      {/* Color */}
      <div>
        <label
          htmlFor="node-color"
          style={{
            display: 'block',
            fontSize: '13px',
            fontWeight: 500,
            marginBottom: '4px',
          }}
        >
          色
        </label>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            id="node-color"
            type="color"
            value={selectedNode.color ?? '#ffffff'}
            onChange={(e) =>
              onMetadataChange(selectedNode.id, { color: e.target.value })
            }
            style={{
              width: '36px',
              height: '36px',
              padding: '2px',
              cursor: 'pointer',
            }}
          />
          <input
            data-testid="color-text-input"
            type="text"
            value={selectedNode.color ?? ''}
            onChange={(e) =>
              onMetadataChange(selectedNode.id, { color: e.target.value })
            }
            placeholder="#ffffff"
            style={{
              flex: 1,
              padding: '4px 8px',
              border: '1px solid #d1d5db',
              borderRadius: '4px',
              fontSize: '13px',
            }}
          />
        </div>
      </div>

      {/* Link URL */}
      <div>
        <label
          htmlFor="node-link-url"
          style={{
            display: 'block',
            fontSize: '13px',
            fontWeight: 500,
            marginBottom: '4px',
          }}
        >
          リンクURL
        </label>
        <input
          id="node-link-url"
          type="url"
          value={selectedNode.linkUrl ?? ''}
          onChange={(e) =>
            onMetadataChange(selectedNode.id, { linkUrl: e.target.value })
          }
          placeholder="https://..."
          style={{
            width: '100%',
            padding: '6px 8px',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            fontSize: '13px',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Note */}
      <div>
        <label
          htmlFor="node-note"
          style={{
            display: 'block',
            fontSize: '13px',
            fontWeight: 500,
            marginBottom: '4px',
          }}
        >
          ノート
        </label>
        <textarea
          id="node-note"
          value={selectedNode.note ?? ''}
          onChange={(e) =>
            onMetadataChange(selectedNode.id, { note: e.target.value })
          }
          placeholder="補足テキスト..."
          rows={4}
          style={{
            width: '100%',
            padding: '6px 8px',
            border: `1px solid ${isNoteOverLimit ? '#ef4444' : '#d1d5db'}`,
            borderRadius: '4px',
            fontSize: '13px',
            resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '12px',
            marginTop: '2px',
          }}
        >
          {isNoteOverLimit && (
            <span style={{ color: '#ef4444' }}>
              1000文字以内で入力してください
            </span>
          )}
          <span
            style={{
              color: isNoteOverLimit ? '#ef4444' : '#9ca3af',
              marginLeft: 'auto',
            }}
          >
            {noteLength} / {NOTE_MAX_LENGTH}
          </span>
        </div>
      </div>
    </div>
  );
}
