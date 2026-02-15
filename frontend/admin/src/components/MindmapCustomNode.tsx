import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { MindmapNodeData } from '../utils/mindmapLayout';

function MindmapCustomNodeComponent({ data, selected }: NodeProps) {
  const nodeData = data as MindmapNodeData;
  const bgColor = nodeData.color ?? '#ffffff';
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(nodeData.label);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditing]);

  // External editing trigger: when data.isEditing becomes true
  useEffect(() => {
    if (nodeData.isEditing && !isEditing) {
      setEditText(nodeData.label);
      setIsEditing(true);
    }
  }, [nodeData.isEditing, isEditing, nodeData.label]);

  const handleDoubleClick = useCallback(() => {
    if (nodeData.onTextChange) {
      setEditText(nodeData.label);
      setIsEditing(true);
      nodeData.onEditingChange?.(true);
    }
  }, [nodeData]);

  const commitEdit = useCallback(() => {
    setIsEditing(false);
    nodeData.onEditingChange?.(false);
    if (nodeData.onTextChange && editText !== nodeData.label) {
      nodeData.onTextChange(editText);
    }
  }, [editText, nodeData]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    nodeData.onEditingChange?.(false);
    setEditText(nodeData.label);
  }, [nodeData]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commitEdit();
      } else if (e.key === 'Enter' && e.shiftKey) {
        // Allow Shift+Enter for newline in textarea (natural behavior)
        e.stopPropagation();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      }
    },
    [commitEdit, cancelEdit]
  );

  const rows = Math.max(1, editText.split('\n').length);

  return (
    <div
      data-testid="mindmap-custom-node"
      style={{
        padding: '8px 16px',
        borderRadius: '8px',
        border: selected ? '2px solid #3b82f6' : '1px solid #d1d5db',
        backgroundColor: bgColor,
        minWidth: '120px',
        maxWidth: '220px',
        textAlign: 'center',
        fontSize: '14px',
        cursor: 'pointer',
        boxShadow: selected
          ? '0 0 0 2px rgba(59, 130, 246, 0.3)'
          : '0 1px 3px rgba(0,0,0,0.1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
      }}
    >
      <Handle
        type="target"
        position={Position.Left}
        style={{ visibility: 'hidden' }}
      />

      {isEditing ? (
        <textarea
          ref={textareaRef}
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          rows={rows}
          style={{
            border: 'none',
            outline: 'none',
            background: 'transparent',
            textAlign: 'center',
            fontSize: '14px',
            fontFamily: 'inherit',
            width: '100%',
            flex: 1,
            resize: 'none',
          }}
        />
      ) : (
        <span
          onDoubleClick={handleDoubleClick}
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            flex: 1,
          }}
        >
          {nodeData.label}
        </span>
      )}

      {nodeData.linkUrl && (
        <span
          title={nodeData.linkUrl}
          style={{ fontSize: '12px', flexShrink: 0 }}
        >
          🔗
        </span>
      )}

      {nodeData.note && (
        <span title={nodeData.note} style={{ fontSize: '12px', flexShrink: 0 }}>
          📝
        </span>
      )}

      <Handle
        type="source"
        position={Position.Right}
        style={{ visibility: 'hidden' }}
      />
    </div>
  );
}

export const MindmapCustomNode = memo(MindmapCustomNodeComponent);
