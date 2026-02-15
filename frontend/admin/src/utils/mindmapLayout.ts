import type { Node, Edge } from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import type { MindmapNode } from '../api/mindmaps';

export interface MindmapNodeData {
  label: string;
  color?: string;
  linkUrl?: string;
  note?: string;
  height?: number;
  onTextChange?: (newText: string) => void;
  isEditing?: boolean;
  onEditingChange?: (editing: boolean) => void;
  [key: string]: unknown;
}

const NODE_WIDTH = 180;
const NODE_HEIGHT = 40;

/**
 * MindmapNodeツリーをReactFlowのnodes/edges配列に変換する
 */
export function convertTreeToReactFlow(root: MindmapNode): {
  nodes: Node<MindmapNodeData>[];
  edges: Edge[];
} {
  const nodes: Node<MindmapNodeData>[] = [];
  const edges: Edge[] = [];

  function traverse(node: MindmapNode, parentId?: string) {
    nodes.push({
      id: node.id,
      type: 'mindmapNode',
      position: { x: 0, y: 0 },
      data: {
        label: node.text,
        color: node.color,
        linkUrl: node.linkUrl,
        note: node.note,
      },
    });

    if (parentId) {
      edges.push({
        id: `${parentId}-${node.id}`,
        source: parentId,
        target: node.id,
      });
    }

    for (const child of node.children) {
      traverse(child, node.id);
    }
  }

  traverse(root);
  return { nodes, edges };
}

/**
 * ReactFlowのnodes/edges配列をMindmapNodeツリーに変換する
 */
export function convertReactFlowToTree(
  nodes: Node<MindmapNodeData>[],
  edges: Edge[]
): MindmapNode | null {
  if (nodes.length === 0) return null;

  // Build child map from edges
  const childMap = new Map<string, string[]>();
  const childSet = new Set<string>();

  for (const edge of edges) {
    const children = childMap.get(edge.source) ?? [];
    children.push(edge.target);
    childMap.set(edge.source, children);
    childSet.add(edge.target);
  }

  // Find root (node that is not a child of any other node)
  const rootNode = nodes.find((n) => !childSet.has(n.id));
  if (!rootNode) return null;

  // Build node data lookup
  const nodeMap = new Map<string, Node<MindmapNodeData>>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }

  const visited = new Set<string>();

  function buildTree(nodeId: string): MindmapNode | null {
    if (visited.has(nodeId)) return null;
    visited.add(nodeId);

    const node = nodeMap.get(nodeId);
    if (!node) return null;
    const childIds = childMap.get(nodeId) ?? [];

    return {
      id: node.id,
      text: node.data.label,
      color: node.data.color,
      linkUrl: node.data.linkUrl,
      note: node.data.note,
      children: childIds
        .map((childId) => buildTree(childId))
        .filter((child): child is MindmapNode => child !== null),
    };
  }

  return buildTree(rootNode.id);
}

/**
 * ツリーに子ノードを追加する（イミュータブル）
 */
export function addChildToTree(
  tree: MindmapNode,
  parentId: string,
  newNodeId: string
): MindmapNode {
  if (tree.id === parentId) {
    return {
      ...tree,
      children: [
        ...tree.children,
        { id: newNodeId, text: 'New Node', children: [] },
      ],
    };
  }
  return {
    ...tree,
    children: tree.children.map((child) =>
      addChildToTree(child, parentId, newNodeId)
    ),
  };
}

/**
 * ツリー内のノードテキストを更新する（イミュータブル）
 */
export function updateNodeTextInTree(
  tree: MindmapNode,
  nodeId: string,
  text: string
): MindmapNode {
  if (tree.id === nodeId) {
    return { ...tree, text };
  }
  return {
    ...tree,
    children: tree.children.map((child) =>
      updateNodeTextInTree(child, nodeId, text)
    ),
  };
}

/**
 * ツリーからノードを削除する（イミュータブル、ルートノードは削除不可）
 */
export function deleteNodeFromTree(
  tree: MindmapNode,
  nodeId: string
): MindmapNode {
  if (tree.id === nodeId) {
    return tree; // ルートノードは削除不可
  }
  return {
    ...tree,
    children: tree.children
      .filter((child) => child.id !== nodeId)
      .map((child) => deleteNodeFromTree(child, nodeId)),
  };
}

/**
 * ノードが特定の祖先の子孫であるかを判定する
 */
export function isDescendantOf(
  tree: MindmapNode,
  nodeId: string,
  ancestorId: string
): boolean {
  if (nodeId === ancestorId) return false;

  function findNode(current: MindmapNode, id: string): MindmapNode | null {
    if (current.id === id) return current;
    for (const child of current.children) {
      const found = findNode(child, id);
      if (found) return found;
    }
    return null;
  }

  function hasDescendant(current: MindmapNode, targetId: string): boolean {
    for (const child of current.children) {
      if (child.id === targetId) return true;
      if (hasDescendant(child, targetId)) return true;
    }
    return false;
  }

  const ancestor = findNode(tree, ancestorId);
  if (!ancestor) return false;
  return hasDescendant(ancestor, nodeId);
}

/**
 * ツリー内でノードを別の親に移動する（イミュータブル）
 * 無効な移動（ルート移動、自身への移動、子孫への移動）の場合はnullを返す
 */
export function moveNodeInTree(
  tree: MindmapNode,
  nodeId: string,
  newParentId: string
): MindmapNode | null {
  // Cannot move root node
  if (nodeId === tree.id) return null;
  // Cannot move to self
  if (nodeId === newParentId) return null;
  // Cannot move to own descendant (circular)
  if (isDescendantOf(tree, newParentId, nodeId)) return null;

  // Find the node to move
  function findNode(current: MindmapNode, id: string): MindmapNode | null {
    if (current.id === id) return current;
    for (const child of current.children) {
      const found = findNode(child, id);
      if (found) return found;
    }
    return null;
  }

  const movingNode = findNode(tree, nodeId);
  if (!movingNode) return null;

  const newParent = findNode(tree, newParentId);
  if (!newParent) return null;

  // Step 1: Remove node from its current position
  function removeNode(current: MindmapNode, targetId: string): MindmapNode {
    return {
      ...current,
      children: current.children
        .filter((child) => child.id !== targetId)
        .map((child) => removeNode(child, targetId)),
    };
  }

  // Step 2: Add node to the new parent
  function addToParent(
    current: MindmapNode,
    parentId: string,
    node: MindmapNode
  ): MindmapNode {
    if (current.id === parentId) {
      return {
        ...current,
        children: [...current.children, node],
      };
    }
    return {
      ...current,
      children: current.children.map((child) =>
        addToParent(child, parentId, node)
      ),
    };
  }

  // Deep clone the moving node to preserve subtree
  const clonedNode: MindmapNode = structuredClone(movingNode);

  const treeWithoutNode = removeNode(tree, nodeId);
  return addToParent(treeWithoutNode, newParentId, clonedNode);
}

/**
 * ツリー内のノードをIDで検索する
 */
export function findNodeInTree(
  tree: MindmapNode,
  nodeId: string
): MindmapNode | null {
  if (tree.id === nodeId) return tree;
  for (const child of tree.children) {
    const found = findNodeInTree(child, nodeId);
    if (found) return found;
  }
  return null;
}

/**
 * ツリー内で指定ノードの親ノードを検索する
 * ルートノードの場合はnullを返す
 */
export function findParentInTree(
  tree: MindmapNode,
  childId: string
): MindmapNode | null {
  if (tree.id === childId) return null; // root has no parent

  for (const child of tree.children) {
    if (child.id === childId) return tree;
    const found = findParentInTree(child, childId);
    if (found) return found;
  }
  return null;
}

/**
 * ツリーに兄弟ノードを追加する（イミュータブル）
 * ルートノードには兄弟追加不可（nullを返す）
 * 選択ノードの直後に新ノードを挿入する
 */
export function addSiblingToTree(
  tree: MindmapNode,
  siblingOfId: string,
  newNodeId: string
): MindmapNode | null {
  // Root node cannot have siblings
  if (tree.id === siblingOfId) return null;

  const parent = findParentInTree(tree, siblingOfId);
  if (!parent) return null;

  function insertSibling(node: MindmapNode): MindmapNode {
    if (node.id === parent!.id) {
      const idx = node.children.findIndex((c) => c.id === siblingOfId);
      const newChildren = [...node.children];
      newChildren.splice(idx + 1, 0, {
        id: newNodeId,
        text: 'New Node',
        children: [],
      });
      return { ...node, children: newChildren };
    }
    return {
      ...node,
      children: node.children.map((child) => insertSibling(child)),
    };
  }

  return insertSibling(tree);
}

/**
 * ツリー内のノードのメタデータを更新する（イミュータブル）
 */
export function updateNodeMetadataInTree(
  tree: MindmapNode,
  nodeId: string,
  metadata: Partial<Pick<MindmapNode, 'color' | 'linkUrl' | 'note'>>
): MindmapNode {
  if (tree.id === nodeId) {
    return { ...tree, ...metadata };
  }
  return {
    ...tree,
    children: tree.children.map((child) =>
      updateNodeMetadataInTree(child, nodeId, metadata)
    ),
  };
}

/**
 * MindmapNodeツリーをMarkdownのネストされたリスト形式に変換する
 */
export function convertTreeToMarkdown(root: MindmapNode): string {
  let result = '';

  function traverse(node: MindmapNode, depth: number) {
    const indent = '  '.repeat(depth);
    const text = node.linkUrl ? `[${node.text}](${node.linkUrl})` : node.text;
    result += `${indent}- ${text}\n`;

    if (node.note) {
      const noteIndent = '  '.repeat(depth + 1);
      const lines = node.note.split('\n');
      for (const line of lines) {
        result += `${noteIndent}> ${line}\n`;
      }
    }

    for (const child of node.children) {
      traverse(child, depth + 1);
    }
  }

  traverse(root, 0);
  return result;
}

/**
 * dagreレイアウトエンジンでノードの位置を計算する
 */
export function applyDagreLayout(
  nodes: Node<MindmapNodeData>[],
  edges: Edge[],
  direction: 'TB' | 'LR' = 'TB'
): Node<MindmapNodeData>[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    nodesep: 50,
    ranksep: 80,
  });

  for (const node of nodes) {
    const nodeHeight =
      (node.data as MindmapNodeData & { height?: number }).height ??
      NODE_HEIGHT;
    g.setNode(node.id, { width: NODE_WIDTH, height: nodeHeight });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return nodes.map((node) => {
    const dagreNode = g.node(node.id);
    const nodeHeight =
      (node.data as MindmapNodeData & { height?: number }).height ??
      NODE_HEIGHT;
    return {
      ...node,
      position: {
        x: dagreNode.x - NODE_WIDTH / 2,
        y: dagreNode.y - nodeHeight / 2,
      },
    };
  });
}
