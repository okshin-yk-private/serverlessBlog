/**
 * mindmap-viewer.ts - D3.jsマインドマップビューア
 *
 * Task 11.1: D3.jsによるインタラクティブツリー描画の実装
 *
 * Requirements:
 * - 3.3: ノードデータを読み取り、インタラクティブなツリービューとして描画
 * - 3.4: ズーム・パン操作によるマインドマップの拡大縮小・移動
 * - 3.5: ノードクリックでハイライト表示、ノート付きノードはツールチップ表示
 * - 7.5: リンク付きノードクリックで新しいタブにURLを開く
 * - 7.6: ノート付きノードクリックでノート内容をツールチップ表示
 * - 9.2: モバイル対応レスポンシブSVG
 * - 9.7: モバイルデバイスでの閲覧に対応するレスポンシブデザイン
 */

import { hierarchy, tree, type HierarchyPointNode } from 'd3-hierarchy';
import { select } from 'd3-selection';
import { zoom, type ZoomBehavior } from 'd3-zoom';

// --- Types ---

export interface MindmapNode {
  id: string;
  text: string;
  color?: string;
  linkUrl?: string;
  note?: string;
  children: MindmapNode[];
}

// --- Constants ---

const NODE_WIDTH = 160;
const NODE_HEIGHT = 40;
const NODE_PADDING_X = 12;
const NODE_PADDING_Y = 8;
const NODE_RX = 8;
const DEFAULT_NODE_COLOR = '#f3f4f6';
const ROOT_NODE_COLOR = '#2D2A5A';
const EDGE_COLOR = '#d1d5db';
const TEXT_COLOR = '#374151';
const ROOT_TEXT_COLOR = '#ffffff';
const ICON_SIZE = 14;
const ICON_GAP = 4;
const MAX_VIEWBOX_WIDTH = 10000;
const MAX_VIEWBOX_HEIGHT = 8000;
const VIEWBOX_PADDING = 80;
const ALLOWED_URL_SCHEMES = ['http:', 'https:'];

// --- Data Functions ---

/**
 * Parse mindmap node data from the embedded JSON script element.
 */
export function parseMindmapData(): MindmapNode | null {
  const dataElement = document.getElementById('mindmap-data');
  if (!dataElement) return null;

  try {
    const jsonText = dataElement.textContent || '';
    return JSON.parse(jsonText) as MindmapNode;
  } catch {
    return null;
  }
}

/**
 * Compute a horizontal tree layout using d3-hierarchy.
 * Returns a positioned hierarchy with x/y coordinates for each node.
 */
export function computeTreeLayout(
  root: MindmapNode,
  width: number,
  height: number
): HierarchyPointNode<MindmapNode> {
  const rootHierarchy = hierarchy<MindmapNode>(root, (d) => d.children);

  const treeLayout = tree<MindmapNode>().nodeSize([
    NODE_HEIGHT + 20,
    NODE_WIDTH + 40,
  ]);

  const layoutRoot = treeLayout(rootHierarchy);

  // Adjust to fit within dimensions with margin
  const margin = 60;
  const nodes = layoutRoot.descendants();

  // Find bounds
  let minX = Infinity;
  let maxX = -Infinity;
  for (const node of nodes) {
    if (node.x < minX) minX = node.x;
    if (node.x > maxX) maxX = node.x;
  }

  // Center vertically
  const treeHeight = maxX - minX;
  const offsetY = (height - treeHeight) / 2 - minX;

  for (const node of nodes) {
    node.x += offsetY;
    node.y += margin;
  }

  return layoutRoot;
}

/**
 * Count total number of nodes in the tree.
 */
export function countNodes(root: MindmapNode): number {
  let count = 1;
  for (const child of root.children) {
    count += countNodes(child);
  }
  return count;
}

/**
 * Convert a MindmapNode tree to a Markdown nested list.
 */
export function nodeToMarkdown(node: MindmapNode, depth: number = 0): string {
  const indent = '  '.repeat(depth);
  let line = `${indent}- ${node.text}`;

  if (node.linkUrl) {
    line += ` [link](${node.linkUrl})`;
  }

  let result = line + '\n';

  if (node.note) {
    result += `${indent}  > ${node.note}\n`;
  }

  for (const child of node.children) {
    result += nodeToMarkdown(child, depth + 1);
  }

  return result;
}

// --- Rendering ---

/**
 * Render the mindmap as an interactive SVG tree inside the given container.
 */
export function renderMindmap(container: HTMLElement, data: MindmapNode): void {
  // Clear any existing content
  container.innerHTML = '';

  // Use a generous initial size for layout computation; the actual viewBox
  // will be derived from the computed node bounds below.
  const initialWidth = 4000;
  const initialHeight = 3000;

  const layoutRoot = computeTreeLayout(data, initialWidth, initialHeight);
  const nodes = layoutRoot.descendants();
  const links = layoutRoot.links();

  // Compute viewBox from actual layout bounds (Finding 3)
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    const left = node.y - NODE_WIDTH / 2;
    const right = node.y + NODE_WIDTH / 2;
    const top = node.x - NODE_HEIGHT / 2;
    const bottom = node.x + NODE_HEIGHT / 2;
    if (left < minY) minY = left;
    if (right > maxY) maxY = right;
    if (top < minX) minX = top;
    if (bottom > maxX) maxX = bottom;
  }

  const svgWidth = Math.min(
    Math.max(800, maxY - minY + VIEWBOX_PADDING * 2),
    MAX_VIEWBOX_WIDTH
  );
  const svgHeight = Math.min(
    Math.max(500, maxX - minX + VIEWBOX_PADDING * 2),
    MAX_VIEWBOX_HEIGHT
  );
  const viewBoxX = minY - VIEWBOX_PADDING;
  const viewBoxY = minX - VIEWBOX_PADDING;

  // Create SVG
  const svg = select(container)
    .append('svg')
    .attr('width', '100%')
    .attr('height', '100%')
    .attr('viewBox', `${viewBoxX} ${viewBoxY} ${svgWidth} ${svgHeight}`)
    .attr('preserveAspectRatio', 'xMidYMid meet')
    .style('cursor', 'grab');

  // Create zoom group
  const zoomGroup = svg.append('g').attr('class', 'zoom-group');

  // Setup zoom/pan (Req 3.4)
  const zoomBehavior: ZoomBehavior<SVGSVGElement, unknown> = zoom<
    SVGSVGElement,
    unknown
  >()
    .scaleExtent([0.2, 3])
    .on('zoom', (event) => {
      zoomGroup.attr('transform', event.transform);
    });

  svg.call(zoomBehavior);

  // Click on SVG background to dismiss tooltip & remove highlight (Finding 4)
  svg.on('click', (event: MouseEvent) => {
    const target = event.target as Element;
    // Dismiss unless clicking on a node or its interactive icons
    if (!target.closest('.mindmap-node, .node-note-icon, .node-link-icon')) {
      removeTooltip();
      removeHighlight(container);
    }
  });

  // Render edges (Req 3.3)
  const edgesGroup = zoomGroup.append('g').attr('class', 'edges');

  edgesGroup
    .selectAll('path')
    .data(links)
    .enter()
    .append('path')
    .attr('class', 'mindmap-edge')
    .attr('d', (d) => {
      const sourceX = d.source.y + NODE_WIDTH / 2;
      const sourceY = d.source.x;
      const targetX = d.target.y - NODE_WIDTH / 2;
      const targetY = d.target.x;
      const midX = (sourceX + targetX) / 2;
      return `M${sourceX},${sourceY} C${midX},${sourceY} ${midX},${targetY} ${targetX},${targetY}`;
    })
    .attr('fill', 'none')
    .attr('stroke', EDGE_COLOR)
    .attr('stroke-width', 2);

  // Render nodes (Req 3.3, 7.2, 7.3, 7.4)
  const nodesGroup = zoomGroup.append('g').attr('class', 'nodes');

  const nodeGroups = nodesGroup
    .selectAll('g')
    .data(nodes)
    .enter()
    .append('g')
    .attr('class', 'mindmap-node')
    .attr(
      'transform',
      (d) => `translate(${d.y - NODE_WIDTH / 2}, ${d.x - NODE_HEIGHT / 2})`
    )
    .attr('data-node-id', (d) => d.data.id);

  // Node background rect
  nodeGroups
    .append('rect')
    .attr('width', NODE_WIDTH)
    .attr('height', NODE_HEIGHT)
    .attr('rx', NODE_RX)
    .attr('ry', NODE_RX)
    .attr('fill', (d) => {
      if (d.data.color) return d.data.color;
      return d.depth === 0 ? ROOT_NODE_COLOR : DEFAULT_NODE_COLOR;
    })
    .attr('stroke', (d) => (d.depth === 0 ? ROOT_NODE_COLOR : '#e5e7eb'))
    .attr('stroke-width', 1.5);

  // Node text
  nodeGroups
    .append('text')
    .attr('x', NODE_PADDING_X)
    .attr('y', NODE_HEIGHT / 2)
    .attr('dy', '0.35em')
    .attr('fill', (d) => {
      if (d.data.color) return getContrastColor(d.data.color);
      return d.depth === 0 ? ROOT_TEXT_COLOR : TEXT_COLOR;
    })
    .attr('font-size', '13px')
    .attr('font-family', "'Caveat', cursive")
    .text((d) => truncateText(d.data.text, 18));

  // Icons area (positioned at right side of node) (Finding 2: use .each for direct access)
  nodeGroups.each(function (d) {
    const nodeGroup = select(this);
    const nodeData = d.data;
    let iconOffsetX = NODE_WIDTH - NODE_PADDING_X;

    // Note icon (Req 7.4, 7.6)
    if (nodeData.note) {
      iconOffsetX -= ICON_SIZE + ICON_GAP;
      nodeGroup
        .append('g')
        .attr('class', 'node-note-icon')
        .attr(
          'transform',
          `translate(${iconOffsetX}, ${(NODE_HEIGHT - ICON_SIZE) / 2})`
        )
        .attr('cursor', 'pointer')
        .attr('data-note', nodeData.note)
        .on('click', (event: MouseEvent) => {
          event.stopPropagation();
          showTooltip(event, nodeData.note!);
        })
        .append('path')
        .attr('d', 'M2 2h10v12H2V2zm2 3h6m-6 3h6m-6 3h4')
        .attr('fill', 'none')
        .attr('stroke', d.depth === 0 ? ROOT_TEXT_COLOR : '#6b7280')
        .attr('stroke-width', 1.2)
        .attr('stroke-linecap', 'round');
    }

    // Link icon (Req 7.3, 7.5) - validate URL scheme before opening (Finding 1)
    if (nodeData.linkUrl) {
      iconOffsetX -= ICON_SIZE + ICON_GAP;
      nodeGroup
        .append('g')
        .attr('class', 'node-link-icon')
        .attr(
          'transform',
          `translate(${iconOffsetX}, ${(NODE_HEIGHT - ICON_SIZE) / 2})`
        )
        .attr('cursor', 'pointer')
        .attr('data-url', nodeData.linkUrl)
        .on('click', (event: MouseEvent) => {
          event.stopPropagation();
          if (isSafeUrl(nodeData.linkUrl!)) {
            window.open(nodeData.linkUrl!, '_blank', 'noopener,noreferrer');
          }
        })
        .append('path')
        .attr(
          'd',
          'M5 2h4l3 3v7a2 2 0 01-2 2H5a2 2 0 01-2-2V4a2 2 0 012-2zm3 0v4h4'
        )
        .attr('fill', 'none')
        .attr('stroke', d.depth === 0 ? ROOT_TEXT_COLOR : '#6b7280')
        .attr('stroke-width', 1.2)
        .attr('stroke-linecap', 'round')
        .attr('stroke-linejoin', 'round');
    }
  });

  // Node click for highlight (Req 3.5)
  nodeGroups.on('click', function (event: MouseEvent) {
    event.stopPropagation();
    removeHighlight(container);
    select(this).classed('highlighted', true);
  });
}

// --- Tooltip ---

function showTooltip(event: MouseEvent, text: string): void {
  removeTooltip();

  const tooltip = document.createElement('div');
  tooltip.className = 'mindmap-tooltip';
  tooltip.textContent = text;

  // Position near the click
  tooltip.style.position = 'fixed';
  tooltip.style.left = `${event.clientX + 10}px`;
  tooltip.style.top = `${event.clientY + 10}px`;
  tooltip.style.background = '#1f2937';
  tooltip.style.color = '#f9fafb';
  tooltip.style.padding = '8px 12px';
  tooltip.style.borderRadius = '6px';
  tooltip.style.fontSize = '13px';
  tooltip.style.maxWidth = '300px';
  tooltip.style.zIndex = '1000';
  tooltip.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
  tooltip.style.lineHeight = '1.4';
  tooltip.style.wordBreak = 'break-word';

  document.body.appendChild(tooltip);
}

function removeTooltip(): void {
  const existing = document.querySelector('.mindmap-tooltip');
  if (existing) existing.remove();
}

// --- Helpers ---

/**
 * Validate that a URL uses a safe scheme (http/https only).
 * Returns true if the URL is safe to open, false otherwise.
 */
export function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_URL_SCHEMES.includes(parsed.protocol);
  } catch {
    return false;
  }
}

function removeHighlight(container: HTMLElement): void {
  container.querySelectorAll('.mindmap-node.highlighted').forEach((el) => {
    el.classList.remove('highlighted');
  });
}

function truncateText(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen - 1) + '\u2026' : text;
}

function getContrastColor(hexColor: string): string {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  // Relative luminance formula
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#374151' : '#ffffff';
}

// --- Init ---

/**
 * Initialize the mindmap viewer. Called on page load.
 */
export function initMindmapViewer(): void {
  const container = document.getElementById('mindmap-canvas');
  if (!container) return;

  const data = parseMindmapData();
  if (!data) return;

  renderMindmap(container, data);
}
