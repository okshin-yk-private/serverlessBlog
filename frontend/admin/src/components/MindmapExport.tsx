import { useState, useCallback } from 'react';
import type { MindmapNode } from '../api/mindmaps';
import { convertTreeToMarkdown } from '../utils/mindmapLayout';

export interface MindmapExportProps {
  rootNode: MindmapNode;
}

export function MindmapExport({ rootNode }: MindmapExportProps) {
  const [showOptions, setShowOptions] = useState(false);

  const [copyError, setCopyError] = useState(false);

  const handleCopyToClipboard = useCallback(async () => {
    const markdown = convertTreeToMarkdown(rootNode);
    try {
      await navigator.clipboard.writeText(markdown);
    } catch {
      setCopyError(true);
      setTimeout(() => setCopyError(false), 3000);
      return;
    }
    setShowOptions(false);
  }, [rootNode]);

  const handleDownload = useCallback(() => {
    const markdown = convertTreeToMarkdown(rootNode);
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mindmap.md';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setShowOptions(false);
  }, [rootNode]);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        data-testid="export-button"
        onClick={() => setShowOptions((prev) => !prev)}
        style={{
          padding: '4px 12px',
          borderRadius: '4px',
          border: '1px solid #d1d5db',
          backgroundColor: '#ffffff',
          cursor: 'pointer',
          fontSize: '13px',
        }}
      >
        Export
      </button>
      {showOptions && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '4px',
            backgroundColor: '#ffffff',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
            zIndex: 10,
            minWidth: '180px',
          }}
        >
          {copyError && (
            <div
              data-testid="copy-error"
              style={{
                padding: '8px 12px',
                color: '#ef4444',
                fontSize: '12px',
                borderBottom: '1px solid #e5e7eb',
              }}
            >
              コピーに失敗しました
            </div>
          )}
          <button
            data-testid="copy-clipboard-button"
            onClick={handleCopyToClipboard}
            style={{
              display: 'block',
              width: '100%',
              padding: '8px 12px',
              border: 'none',
              backgroundColor: 'transparent',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: '13px',
            }}
          >
            Copy to Clipboard
          </button>
          <button
            data-testid="download-button"
            onClick={handleDownload}
            style={{
              display: 'block',
              width: '100%',
              padding: '8px 12px',
              border: 'none',
              borderTop: '1px solid #e5e7eb',
              backgroundColor: 'transparent',
              cursor: 'pointer',
              textAlign: 'left',
              fontSize: '13px',
            }}
          >
            Download as Markdown
          </button>
        </div>
      )}
    </div>
  );
}
