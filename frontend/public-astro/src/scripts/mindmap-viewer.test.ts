/**
 * mindmap-viewer.test.ts - D3.jsマインドマップビューアのユニットテスト
 *
 * Task 11.1: D3.jsによるインタラクティブツリー描画の実装
 *
 * Requirements:
 * - 3.3: ノードデータを読み取り、インタラクティブなツリービューとして描画
 * - 3.4: ズーム・パン操作によるマインドマップの拡大縮小・移動
 * - 3.5: ノードクリックでハイライト表示、ノート付きノードはツールチップ表示
 * - 7.5: リンク付きノードクリックで新しいタブにURLを開く
 * - 7.6: ノート付きノードクリックでノート内容をツールチップ表示
 * - 9.7: モバイル対応レスポンシブSVG
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { MindmapNode } from './mindmap-viewer';

// --- Test Data ---

const sampleRootNode: MindmapNode = {
  id: 'root-1',
  text: 'Root Node',
  children: [
    {
      id: 'child-1',
      text: 'Child 1',
      color: '#FF5733',
      children: [
        {
          id: 'grandchild-1',
          text: 'Grandchild 1',
          linkUrl: 'https://example.com',
          children: [],
        },
      ],
    },
    {
      id: 'child-2',
      text: 'Child 2',
      note: 'This is a note for Child 2',
      children: [],
    },
    {
      id: 'child-3',
      text: 'Child 3',
      color: '#33FF57',
      linkUrl: 'https://example.org',
      note: 'Note with link',
      children: [],
    },
  ],
};

const singleNode: MindmapNode = {
  id: 'single-root',
  text: 'Single Root',
  children: [],
};

// --- Helper ---

function setupDOM(data: MindmapNode): void {
  document.body.innerHTML = `
    <div id="mindmap-canvas" class="mindmap-canvas"></div>
    <script type="application/json" id="mindmap-data" data-mindmap-id="test-id">${JSON.stringify(data)}</script>
  `;
}

// --- Tests ---

describe('mindmap-viewer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('parseMindmapData', () => {
    it('should parse mindmap JSON data from embedded script element', async () => {
      setupDOM(sampleRootNode);
      const { parseMindmapData } = await import('./mindmap-viewer');
      const result = parseMindmapData();
      expect(result).not.toBeNull();
      expect(result!.id).toBe('root-1');
      expect(result!.text).toBe('Root Node');
      expect(result!.children).toHaveLength(3);
    });

    it('should return null when no data script element exists', async () => {
      document.body.innerHTML = '<div id="mindmap-canvas"></div>';
      const { parseMindmapData } = await import('./mindmap-viewer');
      const result = parseMindmapData();
      expect(result).toBeNull();
    });

    it('should return null for invalid JSON', async () => {
      document.body.innerHTML = `
        <div id="mindmap-canvas"></div>
        <script type="application/json" id="mindmap-data">invalid json</script>
      `;
      const { parseMindmapData } = await import('./mindmap-viewer');
      const result = parseMindmapData();
      expect(result).toBeNull();
    });

    it('should preserve node metadata (color, linkUrl, note)', async () => {
      setupDOM(sampleRootNode);
      const { parseMindmapData } = await import('./mindmap-viewer');
      const result = parseMindmapData();
      expect(result!.children[0].color).toBe('#FF5733');
      expect(result!.children[0].children[0].linkUrl).toBe(
        'https://example.com'
      );
      expect(result!.children[1].note).toBe('This is a note for Child 2');
    });
  });

  describe('computeTreeLayout', () => {
    it('should compute hierarchical tree positions for nodes', async () => {
      const { computeTreeLayout } = await import('./mindmap-viewer');
      const layout = computeTreeLayout(sampleRootNode, 800, 600);

      expect(layout).toBeDefined();
      // Root node should have x, y coordinates
      expect(typeof layout.x).toBe('number');
      expect(typeof layout.y).toBe('number');
      // Should have descendants matching node count
      expect(layout.descendants()).toHaveLength(5);
    });

    it('should handle single node tree', async () => {
      const { computeTreeLayout } = await import('./mindmap-viewer');
      const layout = computeTreeLayout(singleNode, 800, 600);

      expect(layout.descendants()).toHaveLength(1);
      expect(layout.data.text).toBe('Single Root');
    });

    it('should produce horizontal layout (parent left, children right)', async () => {
      const { computeTreeLayout } = await import('./mindmap-viewer');
      const layout = computeTreeLayout(sampleRootNode, 800, 600);

      const root = layout;
      const children = layout.children || [];
      // In horizontal layout, parent y should be less than children y
      for (const child of children) {
        expect(root.y).toBeLessThan(child.y);
      }
    });
  });

  describe('countNodes', () => {
    it('should count all nodes in the tree', async () => {
      const { countNodes } = await import('./mindmap-viewer');
      expect(countNodes(sampleRootNode)).toBe(5);
    });

    it('should return 1 for single node', async () => {
      const { countNodes } = await import('./mindmap-viewer');
      expect(countNodes(singleNode)).toBe(1);
    });
  });

  describe('renderMindmap', () => {
    it('should create SVG element inside the container', async () => {
      setupDOM(sampleRootNode);
      const { renderMindmap } = await import('./mindmap-viewer');
      const container = document.getElementById('mindmap-canvas')!;

      renderMindmap(container, sampleRootNode);

      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
    });

    it('should render node elements for each node in the tree', async () => {
      setupDOM(sampleRootNode);
      const { renderMindmap } = await import('./mindmap-viewer');
      const container = document.getElementById('mindmap-canvas')!;

      renderMindmap(container, sampleRootNode);

      const nodeGroups = container.querySelectorAll('.mindmap-node');
      expect(nodeGroups).toHaveLength(5);
    });

    it('should render edge paths connecting parent-child nodes', async () => {
      setupDOM(sampleRootNode);
      const { renderMindmap } = await import('./mindmap-viewer');
      const container = document.getElementById('mindmap-canvas')!;

      renderMindmap(container, sampleRootNode);

      const edges = container.querySelectorAll('.mindmap-edge');
      // 4 edges: root->child1, root->child2, root->child3, child1->grandchild1
      expect(edges).toHaveLength(4);
    });

    it('should apply node color as fill attribute', async () => {
      setupDOM(sampleRootNode);
      const { renderMindmap } = await import('./mindmap-viewer');
      const container = document.getElementById('mindmap-canvas')!;

      renderMindmap(container, sampleRootNode);

      const nodeGroups = container.querySelectorAll('.mindmap-node');
      // Find the node with color #FF5733 (child-1)
      let foundColoredNode = false;
      nodeGroups.forEach((node) => {
        const rect = node.querySelector('rect');
        if (rect && rect.getAttribute('fill') === '#FF5733') {
          foundColoredNode = true;
        }
      });
      expect(foundColoredNode).toBe(true);
    });

    it('should display link icon on nodes with linkUrl', async () => {
      setupDOM(sampleRootNode);
      const { renderMindmap } = await import('./mindmap-viewer');
      const container = document.getElementById('mindmap-canvas')!;

      renderMindmap(container, sampleRootNode);

      const linkIcons = container.querySelectorAll('.node-link-icon');
      // grandchild-1 and child-3 have linkUrl
      expect(linkIcons).toHaveLength(2);
    });

    it('should display note icon on nodes with note', async () => {
      setupDOM(sampleRootNode);
      const { renderMindmap } = await import('./mindmap-viewer');
      const container = document.getElementById('mindmap-canvas')!;

      renderMindmap(container, sampleRootNode);

      const noteIcons = container.querySelectorAll('.node-note-icon');
      // child-2 and child-3 have note
      expect(noteIcons).toHaveLength(2);
    });

    it('should render node text labels', async () => {
      setupDOM(sampleRootNode);
      const { renderMindmap } = await import('./mindmap-viewer');
      const container = document.getElementById('mindmap-canvas')!;

      renderMindmap(container, sampleRootNode);

      const svg = container.querySelector('svg')!;
      const textContent = svg.textContent || '';
      expect(textContent).toContain('Root Node');
      expect(textContent).toContain('Child 1');
      expect(textContent).toContain('Grandchild 1');
    });

    it('should set viewBox for responsive SVG', async () => {
      setupDOM(sampleRootNode);
      const { renderMindmap } = await import('./mindmap-viewer');
      const container = document.getElementById('mindmap-canvas')!;

      renderMindmap(container, sampleRootNode);

      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg!.getAttribute('viewBox')).toBeTruthy();
    });

    it('should apply default color to nodes without custom color', async () => {
      setupDOM(sampleRootNode);
      const { renderMindmap } = await import('./mindmap-viewer');
      const container = document.getElementById('mindmap-canvas')!;

      renderMindmap(container, sampleRootNode);

      // Root node should have default color
      const nodeGroups = container.querySelectorAll('.mindmap-node');
      const rootNodeRect = nodeGroups[0]?.querySelector('rect');
      expect(rootNodeRect).not.toBeNull();
      expect(rootNodeRect!.getAttribute('fill')).toBeTruthy();
    });

    it('should handle single root node', async () => {
      setupDOM(singleNode);
      const { renderMindmap } = await import('./mindmap-viewer');
      const container = document.getElementById('mindmap-canvas')!;

      renderMindmap(container, singleNode);

      const nodeGroups = container.querySelectorAll('.mindmap-node');
      expect(nodeGroups).toHaveLength(1);

      const edges = container.querySelectorAll('.mindmap-edge');
      expect(edges).toHaveLength(0);
    });
  });

  describe('node interactions', () => {
    it('should highlight node on click', async () => {
      setupDOM(sampleRootNode);
      const { renderMindmap } = await import('./mindmap-viewer');
      const container = document.getElementById('mindmap-canvas')!;

      renderMindmap(container, sampleRootNode);

      const nodeGroups = container.querySelectorAll('.mindmap-node');
      const firstNode = nodeGroups[0] as SVGGElement;

      // Click node
      firstNode.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(firstNode.classList.contains('highlighted')).toBe(true);
    });

    it('should remove highlight from previously highlighted node', async () => {
      setupDOM(sampleRootNode);
      const { renderMindmap } = await import('./mindmap-viewer');
      const container = document.getElementById('mindmap-canvas')!;

      renderMindmap(container, sampleRootNode);

      const nodeGroups = container.querySelectorAll('.mindmap-node');
      const firstNode = nodeGroups[0] as SVGGElement;
      const secondNode = nodeGroups[1] as SVGGElement;

      // Click first node
      firstNode.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(firstNode.classList.contains('highlighted')).toBe(true);

      // Click second node
      secondNode.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(firstNode.classList.contains('highlighted')).toBe(false);
      expect(secondNode.classList.contains('highlighted')).toBe(true);
    });

    it('should open link URL in new tab when clicking linked node', async () => {
      setupDOM(sampleRootNode);
      const { renderMindmap } = await import('./mindmap-viewer');
      const container = document.getElementById('mindmap-canvas')!;
      const mockOpen = vi.fn();
      vi.stubGlobal('open', mockOpen);

      renderMindmap(container, sampleRootNode);

      // Find the link icon with data-url="https://example.com" (grandchild-1)
      const linkIcon = container.querySelector(
        '.node-link-icon[data-url="https://example.com"]'
      ) as SVGElement;
      expect(linkIcon).not.toBeNull();

      linkIcon.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(mockOpen).toHaveBeenCalledWith(
        'https://example.com',
        '_blank',
        'noopener,noreferrer'
      );
    });

    it('should show tooltip with note content when clicking noted node', async () => {
      setupDOM(sampleRootNode);
      const { renderMindmap } = await import('./mindmap-viewer');
      const container = document.getElementById('mindmap-canvas')!;

      renderMindmap(container, sampleRootNode);

      // Find a note icon (child-2 has note)
      const noteIcons = container.querySelectorAll('.node-note-icon');
      const firstNoteIcon = noteIcons[0] as SVGElement;

      firstNoteIcon.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      const tooltip = document.querySelector('.mindmap-tooltip');
      expect(tooltip).not.toBeNull();
      expect(tooltip!.textContent).toContain('This is a note for Child 2');
    });

    it('should hide tooltip when clicking elsewhere', async () => {
      setupDOM(sampleRootNode);
      const { renderMindmap } = await import('./mindmap-viewer');
      const container = document.getElementById('mindmap-canvas')!;

      renderMindmap(container, sampleRootNode);

      // Show tooltip
      const noteIcons = container.querySelectorAll('.node-note-icon');
      const firstNoteIcon = noteIcons[0] as SVGElement;
      firstNoteIcon.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      let tooltip = document.querySelector('.mindmap-tooltip');
      expect(tooltip).not.toBeNull();

      // Click on SVG background to dismiss
      const svg = container.querySelector('svg')!;
      svg.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      tooltip = document.querySelector('.mindmap-tooltip');
      expect(tooltip).toBeNull();
    });
  });

  describe('zoom and pan', () => {
    it('should setup zoom transform on the SVG group', async () => {
      setupDOM(sampleRootNode);
      const { renderMindmap } = await import('./mindmap-viewer');
      const container = document.getElementById('mindmap-canvas')!;

      renderMindmap(container, sampleRootNode);

      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();

      // The zoom group should exist
      const zoomGroup = svg!.querySelector('.zoom-group');
      expect(zoomGroup).not.toBeNull();
    });
  });

  describe('initMindmapViewer', () => {
    it('should render mindmap when valid data is present', async () => {
      setupDOM(sampleRootNode);
      const { initMindmapViewer } = await import('./mindmap-viewer');

      initMindmapViewer();

      const svg = document.querySelector('#mindmap-canvas svg');
      expect(svg).not.toBeNull();
    });

    it('should not throw when canvas element is missing', async () => {
      document.body.innerHTML = '';
      const { initMindmapViewer } = await import('./mindmap-viewer');

      expect(() => initMindmapViewer()).not.toThrow();
    });

    it('should not throw when data element is missing', async () => {
      document.body.innerHTML = '<div id="mindmap-canvas"></div>';
      const { initMindmapViewer } = await import('./mindmap-viewer');

      expect(() => initMindmapViewer()).not.toThrow();
    });
  });

  describe('nodeToMarkdownExport', () => {
    it('should convert tree to nested markdown list', async () => {
      const { nodeToMarkdown } = await import('./mindmap-viewer');
      const result = nodeToMarkdown(sampleRootNode);

      expect(result).toContain('- Root Node');
      expect(result).toContain('  - Child 1');
      expect(result).toContain('    - Grandchild 1');
    });
  });

  describe('isSafeUrl', () => {
    it('should allow http URLs', async () => {
      const { isSafeUrl } = await import('./mindmap-viewer');
      expect(isSafeUrl('http://example.com')).toBe(true);
    });

    it('should allow https URLs', async () => {
      const { isSafeUrl } = await import('./mindmap-viewer');
      expect(isSafeUrl('https://example.com/path?q=1')).toBe(true);
    });

    it('should reject javascript: scheme', async () => {
      const { isSafeUrl } = await import('./mindmap-viewer');
      expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    });

    it('should reject data: scheme', async () => {
      const { isSafeUrl } = await import('./mindmap-viewer');
      expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    });

    it('should reject vbscript: scheme', async () => {
      const { isSafeUrl } = await import('./mindmap-viewer');
      expect(isSafeUrl('vbscript:MsgBox("XSS")')).toBe(false);
    });

    it('should reject file: scheme', async () => {
      const { isSafeUrl } = await import('./mindmap-viewer');
      expect(isSafeUrl('file:///etc/passwd')).toBe(false);
    });

    it('should reject invalid/malformed URLs', async () => {
      const { isSafeUrl } = await import('./mindmap-viewer');
      expect(isSafeUrl('not a url')).toBe(false);
    });

    it('should reject empty string', async () => {
      const { isSafeUrl } = await import('./mindmap-viewer');
      expect(isSafeUrl('')).toBe(false);
    });
  });

  describe('link URL security', () => {
    it('should not open window for javascript: linkUrl', async () => {
      const maliciousNode: MindmapNode = {
        id: 'root-1',
        text: 'Root',
        children: [
          {
            id: 'malicious-1',
            text: 'Malicious',
            linkUrl: 'javascript:alert(document.cookie)',
            children: [],
          },
        ],
      };

      setupDOM(maliciousNode);
      const { renderMindmap } = await import('./mindmap-viewer');
      const container = document.getElementById('mindmap-canvas')!;
      const mockOpen = vi.fn();
      vi.stubGlobal('open', mockOpen);

      renderMindmap(container, maliciousNode);

      const linkIcon = container.querySelector('.node-link-icon') as SVGElement;
      expect(linkIcon).not.toBeNull();

      linkIcon.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(mockOpen).not.toHaveBeenCalled();
    });

    it('should not open window for data: linkUrl', async () => {
      const maliciousNode: MindmapNode = {
        id: 'root-1',
        text: 'Root',
        children: [
          {
            id: 'malicious-2',
            text: 'Data URL',
            linkUrl: 'data:text/html,<script>alert(1)</script>',
            children: [],
          },
        ],
      };

      setupDOM(maliciousNode);
      const { renderMindmap } = await import('./mindmap-viewer');
      const container = document.getElementById('mindmap-canvas')!;
      const mockOpen = vi.fn();
      vi.stubGlobal('open', mockOpen);

      renderMindmap(container, maliciousNode);

      const linkIcon = container.querySelector('.node-link-icon') as SVGElement;
      expect(linkIcon).not.toBeNull();

      linkIcon.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(mockOpen).not.toHaveBeenCalled();
    });

    it('should open window for valid https linkUrl', async () => {
      setupDOM(sampleRootNode);
      const { renderMindmap } = await import('./mindmap-viewer');
      const container = document.getElementById('mindmap-canvas')!;
      const mockOpen = vi.fn();
      vi.stubGlobal('open', mockOpen);

      renderMindmap(container, sampleRootNode);

      const linkIcon = container.querySelector(
        '.node-link-icon[data-url="https://example.com"]'
      ) as SVGElement;
      expect(linkIcon).not.toBeNull();

      linkIcon.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(mockOpen).toHaveBeenCalledWith(
        'https://example.com',
        '_blank',
        'noopener,noreferrer'
      );
    });
  });
});
