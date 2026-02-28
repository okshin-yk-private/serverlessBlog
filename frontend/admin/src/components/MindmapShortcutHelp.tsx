import { memo } from 'react';

interface MindmapShortcutHelpProps {
  onClose: () => void;
}

const normalShortcuts = [
  { key: 'Tab', action: 'Add child node' },
  { key: 'Enter', action: 'Add sibling after' },
  { key: 'Shift+Enter', action: 'Add sibling before' },
  { key: 'Delete / Backspace', action: 'Delete node' },
  { key: 'F2 / Space', action: 'Edit selected node' },
  { key: '←', action: 'Navigate to parent' },
  { key: '→', action: 'Navigate to first child' },
  { key: '↑', action: 'Navigate to previous sibling' },
  { key: '↓', action: 'Navigate to next sibling' },
  { key: 'Alt+↑', action: 'Move node up' },
  { key: 'Alt+↓', action: 'Move node down' },
  { key: 'Ctrl+Z', action: 'Undo' },
  { key: 'Ctrl+Shift+Z', action: 'Redo' },
  { key: 'Ctrl+C', action: 'Copy subtree' },
  { key: 'Ctrl+V', action: 'Paste as child' },
  { key: '?', action: 'Toggle this help' },
];

const editingShortcuts = [
  { key: 'Enter', action: 'Commit edit' },
  { key: 'Ctrl+Enter', action: 'New line' },
  { key: 'Escape', action: 'Cancel edit' },
];

function MindmapShortcutHelpComponent({ onClose }: MindmapShortcutHelpProps) {
  return (
    <div
      data-testid="shortcut-help-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '560px',
          width: '90%',
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
            Keyboard Shortcuts
          </h3>
          <button
            onClick={onClose}
            data-testid="shortcut-help-close"
            style={{
              border: 'none',
              background: 'none',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '4px',
              color: '#6b7280',
            }}
          >
            ✕
          </button>
        </div>

        <h4
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: '#374151',
            margin: '0 0 8px 0',
          }}
        >
          Normal Mode
        </h4>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '4px 16px',
            marginBottom: '16px',
          }}
        >
          {normalShortcuts.map(({ key, action }) => (
            <div key={key} style={{ display: 'contents' }}>
              <kbd
                style={{
                  backgroundColor: '#f3f4f6',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  whiteSpace: 'nowrap',
                }}
              >
                {key}
              </kbd>
              <span style={{ fontSize: '13px', color: '#4b5563' }}>
                {action}
              </span>
            </div>
          ))}
        </div>

        <h4
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: '#374151',
            margin: '0 0 8px 0',
          }}
        >
          Editing Mode
        </h4>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '4px 16px',
          }}
        >
          {editingShortcuts.map(({ key, action }) => (
            <div key={key} style={{ display: 'contents' }}>
              <kbd
                style={{
                  backgroundColor: '#f3f4f6',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  whiteSpace: 'nowrap',
                }}
              >
                {key}
              </kbd>
              <span style={{ fontSize: '13px', color: '#4b5563' }}>
                {action}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export const MindmapShortcutHelp = memo(MindmapShortcutHelpComponent);
