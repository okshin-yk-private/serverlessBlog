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
  updateNodeTextInTree,
  deleteNodeFromTree,
  moveNodeInTree,
  updateNodeMetadataInTree,
} from '../utils/mindmapLayout';
import type { MindmapNodeData } from '../utils/mindmapLayout';
import { NodePropertyPanel } from './NodePropertyPanel';
import { MindmapExport } from './MindmapExport';

const nodeTypes = {
  mindmapNode: MindmapCustomNode,
};

export interface MindmapEditorProps {
  rootNode: MindmapNode;
  onNodesChange?: (rootNode: MindmapNode) => void;
  selectedNodeId?: string | null;
  onNodeSelect?: (nodeId: string | null) => void;
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
}: MindmapEditorProps) {
  const { getIntersectingNodes } = useReactFlow();
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const lastAddedNodeIdRef = useRef<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const computeLayout = useCallback(
    (tree: MindmapNode) => {
      const onTextChange = (nodeId: string) => (newText: string) => {
        if (onNodesChangeProp) {
          const updated = updateNodeTextInTree(tree, nodeId, newText);
          onNodesChangeProp(updated);
        }
      };

      const { nodes, edges } = convertTreeToReactFlow(tree);
      // Inject callbacks into each node's data
      const nodesWithCallbacks = nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          onTextChange: onTextChange(node.id),
          isEditing: node.id === editingNodeId,
          onEditingChange: (editing: boolean) => {
            setEditingNodeId(editing ? node.id : null);
          },
        },
      }));
      const layoutedNodes = applyDagreLayout(nodesWithCallbacks, edges, 'LR');
      return { nodes: layoutedNodes, edges };
    },
    [onNodesChangeProp, editingNodeId]
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

  // Re-compute layout when editingNodeId changes (to update isEditing in data)
  useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = computeLayout(rootNode);
    setNodes(newNodes);
    setEdges(newEdges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingNodeId]);

  // Notify parent of tree changes via onNodesChange callback
  // Skip tree conversion for position-only or select-only changes (performance)
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

  const handleDelete = useCallback(() => {
    if (!selectedNodeId || !onNodesChangeProp || selectedNodeId === rootNode.id)
      return;
    const updated = deleteNodeFromTree(rootNode, selectedNodeId);
    onNodesChangeProp(updated);
    onNodeSelect?.(null);
  }, [selectedNodeId, rootNode, onNodesChangeProp, onNodeSelect]);

  const handleNodeDragStop: NodeDragHandler = useCallback(
    (_event, draggedNode) => {
      if (!onNodesChangeProp) return;
      const intersecting = getIntersectingNodes(draggedNode as Node);
      // Use the first intersecting node that is not the dragged node itself
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

  // Keyboard shortcut handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Skip shortcuts when editing a node
      if (editingNodeId) return;
      // Skip if no node is selected
      if (!selectedNodeId) return;
      // Only handle shortcuts when the wrapper div or ReactFlow canvas has focus
      // (not toolbar buttons, inputs, etc.) to preserve keyboard navigation
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'BUTTON' ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT'
      ) {
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        handleAddChild();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleAddSibling();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        handleDelete();
      }
    },
    [
      editingNodeId,
      selectedNodeId,
      handleAddChild,
      handleAddSibling,
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
        <MindmapExport rootNode={rootNode} />
      </div>
      <div style={{ display: 'flex', height: '500px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onNodeDragStop={handleNodeDragStop}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            onNodeClick={(_event, node) => {
              onNodeSelect?.(node.id);
              // Refocus wrapper so keyboard shortcuts work after clicking a node
              // Skip when editing to avoid stealing focus from textarea
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
