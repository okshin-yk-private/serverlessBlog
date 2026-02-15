/**
 * mindmap-embed-viewer.ts - 記事埋め込みマインドマップビューア
 *
 * Task 11.2: 記事埋め込みマインドマップの描画実装
 *
 * Requirements:
 * - 5.3: 埋め込みマーカーを含む記事ページでマインドマップビューに置換して描画
 * - 5.4: Astro SSGビルド時に埋め込み対象のマインドマップデータをJSON形式で埋め込む
 * - 5.5: 埋め込み対象のマインドマップが削除/非公開の場合フォールバックメッセージを表示
 */

import { renderMindmap, type MindmapNode } from './mindmap-viewer';

// --- Re-export MindmapNode for consumers ---
export type { MindmapNode };

// --- Regex for extracting mindmap IDs from HTML ---
// Supports both single and double quotes, with optional whitespace around '='
const EMBED_ID_PATTERN = /data-mindmap-id\s*=\s*(?:"([^"]+)"|'([^']+)')/g;

// --- DOM Functions ---

/**
 * Find all mindmap embed containers in the document.
 */
export function findEmbedContainers(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>('.mindmap-embed[data-mindmap-id]')
  );
}

/**
 * Get embedded mindmap JSON data for the given mindmap ID.
 * Returns null if no data script element exists or JSON is invalid.
 */
export function getEmbedData(mindmapId: string): MindmapNode | null {
  const dataElement = document.querySelector<HTMLScriptElement>(
    `script[type="application/json"][data-embed-mindmap-id="${mindmapId}"]`
  );
  if (!dataElement) return null;

  try {
    const jsonText = dataElement.textContent || '';
    return JSON.parse(jsonText) as MindmapNode;
  } catch {
    return null;
  }
}

/**
 * Show fallback message when mindmap data is unavailable (deleted/unpublished).
 * Requirement 5.5
 */
export function showFallback(container: HTMLElement): void {
  container.classList.add('mindmap-embed-fallback');
  container.textContent = 'このマインドマップは利用できません';
}

/**
 * Render a compact embedded mindmap inside the given container.
 * Uses the same renderMindmap logic from mindmap-viewer but adds
 * embed-specific CSS class.
 */
export function renderEmbedMindmap(
  container: HTMLElement,
  data: MindmapNode
): void {
  container.classList.add('mindmap-embed-rendered');
  renderMindmap(container, data);
}

/**
 * Extract mindmap IDs from HTML content containing embed divs.
 * Used at build time to determine which mindmaps need to be fetched.
 * Returns deduplicated array of IDs.
 */
export function extractMindmapIds(html: string): string[] {
  if (!html) return [];

  const ids: string[] = [];
  let match: RegExpExecArray | null;

  // Reset lastIndex since we're using global flag
  EMBED_ID_PATTERN.lastIndex = 0;
  while ((match = EMBED_ID_PATTERN.exec(html)) !== null) {
    // match[1] is double-quoted value, match[2] is single-quoted value
    const id = match[1] || match[2];
    if (id && !ids.includes(id)) {
      ids.push(id);
    }
  }

  return ids;
}

// --- Init ---

/**
 * Initialize all embedded mindmap viewers in the current page.
 * Called on page load for article pages that may contain embedded mindmaps.
 */
export function initMindmapEmbeds(): void {
  const containers = document.querySelectorAll<HTMLElement>('.mindmap-embed');

  containers.forEach((container) => {
    const mindmapId = container.getAttribute('data-mindmap-id');
    if (!mindmapId) {
      showFallback(container);
      return;
    }

    const data = getEmbedData(mindmapId);
    if (!data) {
      showFallback(container);
      return;
    }

    renderEmbedMindmap(container, data);
  });
}
