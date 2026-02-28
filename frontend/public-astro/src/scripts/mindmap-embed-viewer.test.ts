/**
 * mindmap-embed-viewer.test.ts - 記事埋め込みマインドマップビューアのユニットテスト
 *
 * Task 11.2: 記事埋め込みマインドマップの描画実装
 *
 * Requirements:
 * - 5.3: 埋め込みマーカーを含む記事ページでマインドマップビューに置換して描画
 * - 5.4: Astro SSGビルド時に埋め込み対象のマインドマップデータをJSON形式で埋め込む
 * - 5.5: 埋め込み対象のマインドマップが削除/非公開の場合フォールバックメッセージを表示
 *
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { MindmapNode } from './mindmap-viewer';

// --- Test Data ---

const sampleMindmapData: MindmapNode = {
  id: 'root-1',
  text: 'Root Node',
  children: [
    {
      id: 'child-1',
      text: 'Child 1',
      color: '#FF5733',
      children: [],
    },
    {
      id: 'child-2',
      text: 'Child 2',
      note: 'A note',
      children: [],
    },
  ],
};

const testMindmapId = '550e8400-e29b-41d4-a716-446655440000';
const testMindmapId2 = '660e8400-e29b-41d4-a716-446655440001';

// --- Helpers ---

function setupEmbedDOM(
  mindmapId: string,
  data: MindmapNode | null,
  options: {
    multiple?: boolean;
    secondId?: string;
    secondData?: MindmapNode | null;
  } = {}
): void {
  let html = `
    <div class="post-content">
      <p>Some article text before.</p>
      <div class="mindmap-embed" data-mindmap-id="${mindmapId}"></div>
      <p>Some article text after.</p>
  `;

  if (options.multiple && options.secondId) {
    html += `<div class="mindmap-embed" data-mindmap-id="${options.secondId}"></div>`;
  }

  html += `</div>`;

  // Add JSON data scripts
  if (data) {
    html += `<script type="application/json" data-embed-mindmap-id="${mindmapId}">${JSON.stringify(data)}</script>`;
  }

  if (options.multiple && options.secondId && options.secondData) {
    html += `<script type="application/json" data-embed-mindmap-id="${options.secondId}">${JSON.stringify(options.secondData)}</script>`;
  }

  document.body.innerHTML = html;
}

// --- Tests ---

describe('mindmap-embed-viewer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('findEmbedContainers', () => {
    it('should find all mindmap-embed div elements with data-mindmap-id', async () => {
      setupEmbedDOM(testMindmapId, sampleMindmapData);
      const { findEmbedContainers } = await import('./mindmap-embed-viewer');

      const containers = findEmbedContainers();

      expect(containers).toHaveLength(1);
      expect(containers[0].getAttribute('data-mindmap-id')).toBe(testMindmapId);
    });

    it('should find multiple embed containers', async () => {
      setupEmbedDOM(testMindmapId, sampleMindmapData, {
        multiple: true,
        secondId: testMindmapId2,
        secondData: sampleMindmapData,
      });
      const { findEmbedContainers } = await import('./mindmap-embed-viewer');

      const containers = findEmbedContainers();

      expect(containers).toHaveLength(2);
    });

    it('should return empty array when no embed containers exist', async () => {
      document.body.innerHTML =
        '<div class="post-content"><p>No embeds here.</p></div>';
      const { findEmbedContainers } = await import('./mindmap-embed-viewer');

      const containers = findEmbedContainers();

      expect(containers).toHaveLength(0);
    });
  });

  describe('getEmbedData', () => {
    it('should parse mindmap JSON data from associated script element', async () => {
      setupEmbedDOM(testMindmapId, sampleMindmapData);
      const { getEmbedData } = await import('./mindmap-embed-viewer');

      const data = getEmbedData(testMindmapId);

      expect(data).not.toBeNull();
      expect(data!.id).toBe('root-1');
      expect(data!.text).toBe('Root Node');
      expect(data!.children).toHaveLength(2);
    });

    it('should return null when no script element exists for the given ID', async () => {
      document.body.innerHTML = `<div class="mindmap-embed" data-mindmap-id="${testMindmapId}"></div>`;
      const { getEmbedData } = await import('./mindmap-embed-viewer');

      const data = getEmbedData(testMindmapId);

      expect(data).toBeNull();
    });

    it('should return null for invalid JSON in script element', async () => {
      document.body.innerHTML = `
        <div class="mindmap-embed" data-mindmap-id="${testMindmapId}"></div>
        <script type="application/json" data-embed-mindmap-id="${testMindmapId}">invalid json</script>
      `;
      const { getEmbedData } = await import('./mindmap-embed-viewer');

      const data = getEmbedData(testMindmapId);

      expect(data).toBeNull();
    });

    it('should preserve node metadata (color, note, linkUrl)', async () => {
      setupEmbedDOM(testMindmapId, sampleMindmapData);
      const { getEmbedData } = await import('./mindmap-embed-viewer');

      const data = getEmbedData(testMindmapId);

      expect(data!.children[0].color).toBe('#FF5733');
      expect(data!.children[1].note).toBe('A note');
    });
  });

  describe('showFallback', () => {
    it('should display fallback message when mindmap data is unavailable', async () => {
      document.body.innerHTML = `<div class="mindmap-embed" data-mindmap-id="${testMindmapId}"></div>`;
      const { showFallback } = await import('./mindmap-embed-viewer');

      const container = document.querySelector('.mindmap-embed') as HTMLElement;
      showFallback(container);

      expect(container.textContent).toContain(
        'このマインドマップは利用できません'
      );
    });

    it('should add fallback CSS class to the container', async () => {
      document.body.innerHTML = `<div class="mindmap-embed" data-mindmap-id="${testMindmapId}"></div>`;
      const { showFallback } = await import('./mindmap-embed-viewer');

      const container = document.querySelector('.mindmap-embed') as HTMLElement;
      showFallback(container);

      expect(container.classList.contains('mindmap-embed-fallback')).toBe(true);
    });
  });

  describe('renderEmbedMindmap', () => {
    it('should render SVG inside the embed container', async () => {
      setupEmbedDOM(testMindmapId, sampleMindmapData);
      const { renderEmbedMindmap } = await import('./mindmap-embed-viewer');

      const container = document.querySelector('.mindmap-embed') as HTMLElement;
      renderEmbedMindmap(container, sampleMindmapData);

      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
    });

    it('should render all nodes from the mindmap data', async () => {
      setupEmbedDOM(testMindmapId, sampleMindmapData);
      const { renderEmbedMindmap } = await import('./mindmap-embed-viewer');

      const container = document.querySelector('.mindmap-embed') as HTMLElement;
      renderEmbedMindmap(container, sampleMindmapData);

      const nodes = container.querySelectorAll('.mindmap-node');
      expect(nodes).toHaveLength(3); // root + 2 children
    });

    it('should render edges connecting nodes', async () => {
      setupEmbedDOM(testMindmapId, sampleMindmapData);
      const { renderEmbedMindmap } = await import('./mindmap-embed-viewer');

      const container = document.querySelector('.mindmap-embed') as HTMLElement;
      renderEmbedMindmap(container, sampleMindmapData);

      const edges = container.querySelectorAll('.mindmap-edge');
      expect(edges).toHaveLength(2); // root->child1, root->child2
    });

    it('should add embed-specific CSS class to container', async () => {
      setupEmbedDOM(testMindmapId, sampleMindmapData);
      const { renderEmbedMindmap } = await import('./mindmap-embed-viewer');

      const container = document.querySelector('.mindmap-embed') as HTMLElement;
      renderEmbedMindmap(container, sampleMindmapData);

      expect(container.classList.contains('mindmap-embed-rendered')).toBe(true);
    });
  });

  describe('initMindmapEmbeds', () => {
    it('should render mindmap in embed container when data is available', async () => {
      setupEmbedDOM(testMindmapId, sampleMindmapData);
      const { initMindmapEmbeds } = await import('./mindmap-embed-viewer');

      initMindmapEmbeds();

      const container = document.querySelector('.mindmap-embed') as HTMLElement;
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
    });

    it('should show fallback when mindmap data is missing', async () => {
      // No data script element
      document.body.innerHTML = `<div class="mindmap-embed" data-mindmap-id="${testMindmapId}"></div>`;
      const { initMindmapEmbeds } = await import('./mindmap-embed-viewer');

      initMindmapEmbeds();

      const container = document.querySelector('.mindmap-embed') as HTMLElement;
      expect(container.textContent).toContain(
        'このマインドマップは利用できません'
      );
    });

    it('should handle multiple embeds independently', async () => {
      setupEmbedDOM(testMindmapId, sampleMindmapData, {
        multiple: true,
        secondId: testMindmapId2,
        secondData: null, // Second one has no data
      });
      const { initMindmapEmbeds } = await import('./mindmap-embed-viewer');

      initMindmapEmbeds();

      const containers = document.querySelectorAll('.mindmap-embed');

      // First one should have SVG (data available)
      expect(containers[0].querySelector('svg')).not.toBeNull();

      // Second one should show fallback (no data)
      expect(containers[1].textContent).toContain(
        'このマインドマップは利用できません'
      );
    });

    it('should not throw when no embed containers exist', async () => {
      document.body.innerHTML =
        '<div class="post-content"><p>No embeds.</p></div>';
      const { initMindmapEmbeds } = await import('./mindmap-embed-viewer');

      expect(() => initMindmapEmbeds()).not.toThrow();
    });

    it('should skip containers without data-mindmap-id attribute', async () => {
      document.body.innerHTML = '<div class="mindmap-embed"></div>';
      const { initMindmapEmbeds } = await import('./mindmap-embed-viewer');

      initMindmapEmbeds();

      const container = document.querySelector('.mindmap-embed') as HTMLElement;
      // Should show fallback since no ID to look up data
      expect(container.textContent).toContain(
        'このマインドマップは利用できません'
      );
    });
  });

  describe('extractMindmapIds', () => {
    it('should extract mindmap IDs from HTML with embed divs', async () => {
      const { extractMindmapIds } = await import('./mindmap-embed-viewer');
      const html = `<p>Text</p><div class="mindmap-embed" data-mindmap-id="${testMindmapId}"></div><p>More</p>`;

      const ids = extractMindmapIds(html);

      expect(ids).toEqual([testMindmapId]);
    });

    it('should extract multiple IDs', async () => {
      const { extractMindmapIds } = await import('./mindmap-embed-viewer');
      const html = `
        <div class="mindmap-embed" data-mindmap-id="${testMindmapId}"></div>
        <div class="mindmap-embed" data-mindmap-id="${testMindmapId2}"></div>
      `;

      const ids = extractMindmapIds(html);

      expect(ids).toEqual([testMindmapId, testMindmapId2]);
    });

    it('should return empty array when no embed divs exist', async () => {
      const { extractMindmapIds } = await import('./mindmap-embed-viewer');
      const html = '<p>Regular content without any mindmap embeds.</p>';

      const ids = extractMindmapIds(html);

      expect(ids).toEqual([]);
    });

    it('should return empty array for empty string', async () => {
      const { extractMindmapIds } = await import('./mindmap-embed-viewer');

      const ids = extractMindmapIds('');

      expect(ids).toEqual([]);
    });

    it('should deduplicate repeated IDs', async () => {
      const { extractMindmapIds } = await import('./mindmap-embed-viewer');
      const html = `
        <div class="mindmap-embed" data-mindmap-id="${testMindmapId}"></div>
        <div class="mindmap-embed" data-mindmap-id="${testMindmapId}"></div>
      `;

      const ids = extractMindmapIds(html);

      expect(ids).toEqual([testMindmapId]);
    });

    it('should extract IDs from single-quoted attributes', async () => {
      const { extractMindmapIds } = await import('./mindmap-embed-viewer');
      const html = `<div class="mindmap-embed" data-mindmap-id='${testMindmapId}'></div>`;

      const ids = extractMindmapIds(html);

      expect(ids).toEqual([testMindmapId]);
    });

    it('should extract IDs when whitespace surrounds the equals sign', async () => {
      const { extractMindmapIds } = await import('./mindmap-embed-viewer');
      const html = `<div class="mindmap-embed" data-mindmap-id = "${testMindmapId}"></div>`;

      const ids = extractMindmapIds(html);

      expect(ids).toEqual([testMindmapId]);
    });

    it('should handle mixed quote styles in the same HTML', async () => {
      const { extractMindmapIds } = await import('./mindmap-embed-viewer');
      const html = `
        <div class="mindmap-embed" data-mindmap-id="${testMindmapId}"></div>
        <div class="mindmap-embed" data-mindmap-id='${testMindmapId2}'></div>
      `;

      const ids = extractMindmapIds(html);

      expect(ids).toEqual([testMindmapId, testMindmapId2]);
    });

    it('should handle attributes with newlines and extra whitespace', async () => {
      const { extractMindmapIds } = await import('./mindmap-embed-viewer');
      const html = `<div class="mindmap-embed"
        data-mindmap-id="${testMindmapId}"></div>`;

      const ids = extractMindmapIds(html);

      expect(ids).toEqual([testMindmapId]);
    });
  });
});
