import { useMemo, useEffect, useCallback, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import type {
  OnNodesChange,
  OnEdgesChange,
  Node,
  NodeDragHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { MindmapNode } from '../api/mindmaps';
import { MindmapCustomNode } from './MindmapCustomNode';
import {
  convertTreeToReactFlow,
  convertReactFlowToTree,
  applyDagreLayout,
  addChildToTree,
  addSiblingToTree,
  addSiblingBeforeToTree,
  updateNodeTextInTree,
  deleteNodeFromTree,
  moveNodeInTree,
  updateNodeMetadataInTree,
  getAdjacentNodeId,
  getNavigationTarget,
  reorderNodeInTree,
  findNodeInTree,
  cloneSubtreeWithNewIds,
} from '../utils/mindmapLayout';
import type { MindmapNodeData } from '../utils/mindmapLayout';
import { NodePropertyPanel } from './NodePropertyPanel';
import { MindmapExport } from './MindmapExport';
import { MindmapShortcutHelp } from './MindmapShortcutHelp';

const nodeTypes = {
  mindmapNode: MindmapCustomNode,
};

export interface MindmapEditorProps {
  rootNode: MindmapNode;
  onNodesChange?: (rootNode: MindmapNode) => void;
  selectedNodeId?: string | null;
  onNodeSelect?: (nodeId: string | null) => void;
  onUndo?: () => MindmapNode | null;
  onRedo?: () => MindmapNode | null;
  canUndo?: boolean;
  canRedo?: boolean;
}

let idCounter = 0;
function generateNodeId(): string {
  idCounter += 1;
  return `node-${Date.now()}-${idCounter}`;
}

function MindmapEditorInner({
  rootNode,
  onNodesChange: onNodesChangeProp,
  selectedNodeId,
  onNodeSelect,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}: MindmapEditorProps) {
  const { getIntersectingNodes } = useReactFlow();
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(
    new Set()
  );
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const lastAddedNodeIdRef = useRef<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const clipboardRef = useRef<MindmapNode | null>(null);

  const handleToggleCollapse = useCallback((nodeId: string) => {
    setCollapsedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const computeLayout = useCallback(
    (tree: MindmapNode) => {
      const onTextChange = (nodeId: string) => (newText: string) => {
        if (onNodesChangeProp) {
          const updated = updateNodeTextInTree(tree, nodeId, newText);
          onNodesChangeProp(updated);
        }
      };

      // Filter collapsed children before conversion
      function filterCollapsed(node: MindmapNode): MindmapNode {
        if (collapsedNodeIds.has(node.id)) {
          return { ...node, children: [] };
        }
        return {
          ...node,
          children: node.children.map(filterCollapsed),
        };
      }

      const filteredTree = filterCollapsed(tree);
      const { nodes, edges } = convertTreeToReactFlow(filteredTree);

      // Build id→node map for O(1) child count lookup (avoids O(n^2))
      const nodeMap = new Map<string, MindmapNode>();
      function buildNodeMap(n: MindmapNode) {
        nodeMap.set(n.id, n);
        for (const child of n.children) buildNodeMap(child);
      }
      buildNodeMap(tree);

      // Inject callbacks and collapse/drop-target data into each node's data
      const nodesWithCallbacks = nodes.map((node) => {
        const originalNode = nodeMap.get(node.id);
        const childCount = originalNode?.children.length ?? 0;
        return {
          ...node,
          data: {
            ...node.data,
            onTextChange: onTextChange(node.id),
            isEditing: node.id === editingNodeId,
            onEditingChange: (editing: boolean) => {
              setEditingNodeId(editing ? node.id : null);
            },
            isDropTarget: node.id === dropTargetId,
            isCollapsed: collapsedNodeIds.has(node.id),
            childCount,
            onToggleCollapse:
              childCount > 0 ? () => handleToggleCollapse(node.id) : undefined,
          },
        };
      });
      const layoutedNodes = applyDagreLayout(nodesWithCallbacks, edges, 'LR');
      return { nodes: layoutedNodes, edges };
    },
    [
      onNodesChangeProp,
      editingNodeId,
      collapsedNodeIds,
      dropTargetId,
      handleToggleCollapse,
    ]
  );

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => computeLayout(rootNode),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const [nodes, setNodes, onNodesChangeInternal] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChangeInternal] = useEdgesState(initialEdges);

  // Sync internal state when rootNode prop changes
  const prevRootNodeRef = useRef(rootNode);
  useEffect(() => {
    if (prevRootNodeRef.current === rootNode && !lastAddedNodeIdRef.current)
      return;
    prevRootNodeRef.current = rootNode;

    // Auto-edit mode for newly added nodes
    const newNodeId = lastAddedNodeIdRef.current;
    if (newNodeId) {
      lastAddedNodeIdRef.current = null;
      onNodeSelect?.(newNodeId);
      setEditingNodeId(newNodeId);
    }

    const { nodes: newNodes, edges: newEdges } = computeLayout(rootNode);
    setNodes(newNodes);
    setEdges(newEdges);
  }, [rootNode, setNodes, setEdges, computeLayout, onNodeSelect]);

  // Re-compute layout when editingNodeId / collapsedNodeIds / dropTargetId changes
  useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = computeLayout(rootNode);
    setNodes(newNodes);
    setEdges(newEdges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingNodeId, collapsedNodeIds, dropTargetId]);

  // Notify parent of tree changes via onNodesChange callback
  const handleNodesChange: OnNodesChange = useCallback(
    (changes) => {
      onNodesChangeInternal(changes);

      const hasStructuralChange = changes.some(
        (c) =>
          c.type !== 'position' &&
          c.type !== 'select' &&
          c.type !== 'dimensions'
      );
      if (!hasStructuralChange || !onNodesChangeProp) return;

      setTimeout(() => {
        setNodes((currentNodes) => {
          setEdges((currentEdges) => {
            const tree = convertReactFlowToTree(
              currentNodes as import('@xyflow/react').Node<MindmapNodeData>[],
              currentEdges
            );
            if (tree) {
              onNodesChangeProp(tree);
            }
            return currentEdges;
          });
          return currentNodes;
        });
      }, 0);
    },
    [onNodesChangeInternal, onNodesChangeProp, setNodes, setEdges]
  );

  const handleEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      onEdgesChangeInternal(changes);
    },
    [onEdgesChangeInternal]
  );

  // Apply selectedNodeId from props to internal node state
  useEffect(() => {
    setNodes((currentNodes) =>
      currentNodes.map((node) => ({
        ...node,
        selected: node.id === selectedNodeId,
      }))
    );
  }, [selectedNodeId, setNodes]);

  // CRUD action handlers
  const handleAddChild = useCallback(() => {
    if (!selectedNodeId || !onNodesChangeProp) return;
    const newNodeId = generateNodeId();
    lastAddedNodeIdRef.current = newNodeId;
    const updated = addChildToTree(rootNode, selectedNodeId, newNodeId);
    onNodesChangeProp(updated);
  }, [selectedNodeId, rootNode, onNodesChangeProp]);

  const handleAddSibling = useCallback(() => {
    if (!selectedNodeId || !onNodesChangeProp || selectedNodeId === rootNode.id)
      return;
    const newNodeId = generateNodeId();
    const updated = addSiblingToTree(rootNode, selectedNodeId, newNodeId);
    if (updated) {
      lastAddedNodeIdRef.current = newNodeId;
      onNodesChangeProp(updated);
    }
  }, [selectedNodeId, rootNode, onNodesChangeProp]);

  const handleAddSiblingBefore = useCallback(() => {
    if (!selectedNodeId || !onNodesChangeProp || selectedNodeId === rootNode.id)
      return;
    const newNodeId = generateNodeId();
    const updated = addSiblingBeforeToTree(rootNode, selectedNodeId, newNodeId);
    if (updated) {
      lastAddedNodeIdRef.current = newNodeId;
      onNodesChangeProp(updated);
    }
  }, [selectedNodeId, rootNode, onNodesChangeProp]);

  const handleDelete = useCallback(() => {
    if (!selectedNodeId || !onNodesChangeProp || selectedNodeId === rootNode.id)
      return;
    const adjacentId = getAdjacentNodeId(rootNode, selectedNodeId);
    const updated = deleteNodeFromTree(rootNode, selectedNodeId);
    onNodesChangeProp(updated);
    onNodeSelect?.(adjacentId);
  }, [selectedNodeId, rootNode, onNodesChangeProp, onNodeSelect]);

  const handleNodeDragStop: NodeDragHandler = useCallback(
    (_event, draggedNode) => {
      setDropTargetId(null);
      if (!onNodesChangeProp) return;
      const intersecting = getIntersectingNodes(draggedNode as Node);
      const dropTarget = intersecting.find(
        (n: Node) => n.id !== draggedNode.id
      );
      if (!dropTarget) return;

      const result = moveNodeInTree(rootNode, draggedNode.id, dropTarget.id);
      if (result) {
        onNodesChangeProp(result);
      }
    },
    [rootNode, onNodesChangeProp, getIntersectingNodes]
  );

  const handleNodeDrag: NodeDragHandler = useCallback(
    (_event, draggedNode) => {
      const intersecting = getIntersectingNodes(draggedNode as Node);
      const target = intersecting.find((n: Node) => n.id !== draggedNode.id);
      setDropTargetId(target?.id ?? null);
    },
    [getIntersectingNodes]
  );

  const handleMetadataChange = useCallback(
    (
      nodeId: string,
      metadata: Partial<Pick<MindmapNode, 'color' | 'linkUrl' | 'note'>>
    ) => {
      if (!onNodesChangeProp) return;
      const updated = updateNodeMetadataInTree(rootNode, nodeId, metadata);
      onNodesChangeProp(updated);
    },
    [rootNode, onNodesChangeProp]
  );

  // Keyboard shortcut handler (priority order per plan)
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // 1. Skip all when editing
      if (editingNodeId) return;
      // 2. Guard: skip BUTTON/INPUT/TEXTAREA/SELECT targets
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'BUTTON' ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT'
      ) {
        return;
      }

      // --- Selection-independent shortcuts (work even without a selected node) ---

      // 3. Ctrl+Z → undo
      if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        if (onUndo) {
          const prev = onUndo();
          if (prev) onNodesChangeProp?.(prev);
        }
        return;
      }

      // 4. Ctrl+Shift+Z / Ctrl+Y → redo
      if (
        (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey) ||
        (e.key === 'y' && (e.ctrlKey || e.metaKey))
      ) {
        e.preventDefault();
        if (onRedo) {
          const next = onRedo();
          if (next) onNodesChangeProp?.(next);
        }
        return;
      }

      // 5. ? → toggle shortcut help (no selection required)
      if (e.key === '?') {
        e.preventDefault();
        setShowShortcuts((prev) => !prev);
        return;
      }

      // --- Selection-dependent shortcuts ---
      if (!selectedNodeId) return;

      // 6. Ctrl+C → copy
      if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const node = findNodeInTree(rootNode, selectedNodeId);
        if (node) {
          clipboardRef.current = structuredClone(node);
        }
        return;
      }

      // 7. Ctrl+V → paste
      if (e.key === 'v' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (clipboardRef.current && onNodesChangeProp) {
          const cloned = cloneSubtreeWithNewIds(
            clipboardRef.current,
            generateNodeId
          );
          const updated = addChildToTree(rootNode, selectedNodeId, cloned.id);
          // Replace the placeholder "New Node" with the cloned subtree
          function replaceNode(
            tree: MindmapNode,
            targetId: string,
            replacement: MindmapNode
          ): MindmapNode {
            if (tree.id === targetId) return replacement;
            return {
              ...tree,
              children: tree.children.map((child) =>
                replaceNode(child, targetId, replacement)
              ),
            };
          }
          const withCloned = replaceNode(updated, cloned.id, cloned);
          lastAddedNodeIdRef.current = cloned.id;
          onNodesChangeProp(withCloned);
        }
        return;
      }

      // 8. Alt+ArrowUp → reorder up
      if (e.key === 'ArrowUp' && e.altKey) {
        e.preventDefault();
        if (onNodesChangeProp) {
          const result = reorderNodeInTree(rootNode, selectedNodeId, 'up');
          if (result) onNodesChangeProp(result);
        }
        return;
      }

      // 9. Alt+ArrowDown → reorder down
      if (e.key === 'ArrowDown' && e.altKey) {
        e.preventDefault();
        if (onNodesChangeProp) {
          const result = reorderNodeInTree(rootNode, selectedNodeId, 'down');
          if (result) onNodesChangeProp(result);
        }
        return;
      }

      // 10. Shift+Enter → add sibling before
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        handleAddSiblingBefore();
        return;
      }

      // 11. Tab → add child
      if (e.key === 'Tab') {
        e.preventDefault();
        handleAddChild();
        return;
      }

      // 12. Enter → add sibling after
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddSibling();
        return;
      }

      // 13. Delete/Backspace → delete
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDelete();
        return;
      }

      // 14. F2 / Space → edit
      if (e.key === 'F2' || e.key === ' ') {
        e.preventDefault();
        setEditingNodeId(selectedNodeId);
        return;
      }

      // 15. Arrow keys → navigate
      if (
        e.key === 'ArrowUp' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowLeft' ||
        e.key === 'ArrowRight'
      ) {
        e.preventDefault();
        const directionMap: Record<string, 'up' | 'down' | 'left' | 'right'> = {
          ArrowUp: 'up',
          ArrowDown: 'down',
          ArrowLeft: 'left',
          ArrowRight: 'right',
        };
        const targetId = getNavigationTarget(
          rootNode,
          selectedNodeId,
          directionMap[e.key]
        );
        if (targetId) {
          onNodeSelect?.(targetId);
        }
        return;
      }
    },
    [
      editingNodeId,
      selectedNodeId,
      rootNode,
      onNodesChangeProp,
      onNodeSelect,
      onUndo,
      onRedo,
      handleAddChild,
      handleAddSibling,
      handleAddSiblingBefore,
      handleDelete,
    ]
  );

  const isDeleteDisabled = !selectedNodeId || selectedNodeId === rootNode.id;

  return (
    <div
      ref={wrapperRef}
      data-testid="mindmap-editor"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{ outline: 'none' }}
    >
      <div
        style={{
          display: 'flex',
          gap: '8px',
          padding: '8px',
          borderBottom: '1px solid #e5e7eb',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
        data-testid="mindmap-toolbar"
      >
        <button
          onClick={handleAddChild}
          disabled={!selectedNodeId}
          style={{
            padding: '4px 12px',
            borderRadius: '4px',
            border: '1px solid #d1d5db',
            backgroundColor: !selectedNodeId ? '#f3f4f6' : '#ffffff',
            cursor: !selectedNodeId ? 'not-allowed' : 'pointer',
            fontSize: '13px',
          }}
        >
          Add Child
        </button>
        <button
          onClick={handleAddSibling}
          disabled={!selectedNodeId || selectedNodeId === rootNode.id}
          style={{
            padding: '4px 12px',
            borderRadius: '4px',
            border: '1px solid #d1d5db',
            backgroundColor:
              !selectedNodeId || selectedNodeId === rootNode.id
                ? '#f3f4f6'
                : '#ffffff',
            cursor:
              !selectedNodeId || selectedNodeId === rootNode.id
                ? 'not-allowed'
                : 'pointer',
            fontSize: '13px',
          }}
        >
          Add Sibling
        </button>
        <button
          onClick={handleDelete}
          disabled={isDeleteDisabled}
          style={{
            padding: '4px 12px',
            borderRadius: '4px',
            border: '1px solid #d1d5db',
            backgroundColor: isDeleteDisabled ? '#f3f4f6' : '#ffffff',
            cursor: isDeleteDisabled ? 'not-allowed' : 'pointer',
            fontSize: '13px',
            color: isDeleteDisabled ? '#9ca3af' : '#ef4444',
          }}
        >
          Delete
        </button>
        {onUndo && (
          <button
            onClick={() => {
              const prev = onUndo();
              if (prev) onNodesChangeProp?.(prev);
            }}
            disabled={!canUndo}
            data-testid="undo-button"
            style={{
              padding: '4px 12px',
              borderRadius: '4px',
              border: '1px solid #d1d5db',
              backgroundColor: !canUndo ? '#f3f4f6' : '#ffffff',
              cursor: !canUndo ? 'not-allowed' : 'pointer',
              fontSize: '13px',
            }}
          >
            Undo
          </button>
        )}
        {onRedo && (
          <button
            onClick={() => {
              const next = onRedo();
              if (next) onNodesChangeProp?.(next);
            }}
            disabled={!canRedo}
            data-testid="redo-button"
            style={{
              padding: '4px 12px',
              borderRadius: '4px',
              border: '1px solid #d1d5db',
              backgroundColor: !canRedo ? '#f3f4f6' : '#ffffff',
              cursor: !canRedo ? 'not-allowed' : 'pointer',
              fontSize: '13px',
            }}
          >
            Redo
          </button>
        )}
        <MindmapExport rootNode={rootNode} />
        <button
          onClick={() => setShowShortcuts(true)}
          data-testid="shortcut-help-button"
          style={{
            padding: '4px 12px',
            borderRadius: '4px',
            border: '1px solid #d1d5db',
            backgroundColor: '#ffffff',
            cursor: 'pointer',
            fontSize: '13px',
          }}
          title="Keyboard shortcuts"
        >
          ?
        </button>
      </div>
      <div style={{ display: 'flex', height: '500px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onNodeDragStop={handleNodeDragStop}
            onNodeDrag={handleNodeDrag}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            onNodeClick={(_event, node) => {
              onNodeSelect?.(node.id);
              // Refocus wrapper so keyboard shortcuts work after clicking a node
              if (!editingNodeId) {
                setTimeout(() => wrapperRef.current?.focus(), 0);
              }
            }}
            onPaneClick={() => {
              onNodeSelect?.(null);
            }}
          >
            <Controls />
            <Background />
          </ReactFlow>
        </div>
        <NodePropertyPanel
          rootNode={rootNode}
          selectedNodeId={selectedNodeId ?? null}
          onMetadataChange={handleMetadataChange}
        />
      </div>
      {showShortcuts && (
        <MindmapShortcutHelp onClose={() => setShowShortcuts(false)} />
      )}
    </div>
  );
}

export function MindmapEditor(props: MindmapEditorProps) {
  return (
    <ReactFlowProvider>
      <MindmapEditorInner {...props} />
    </ReactFlowProvider>
  );
}
