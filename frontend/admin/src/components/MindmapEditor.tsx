import { useMemo, useEffect, useCallback, useRef } from 'react';
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

  const computeLayout = useCallback(
    (tree: MindmapNode) => {
      const onTextChange = (nodeId: string) => (newText: string) => {
        if (onNodesChangeProp) {
          const updated = updateNodeTextInTree(tree, nodeId, newText);
          onNodesChangeProp(updated);
        }
      };

      const { nodes, edges } = convertTreeToReactFlow(tree);
      // Inject onTextChange callback into each node's data
      const nodesWithCallbacks = nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          onTextChange: onTextChange(node.id),
        },
      }));
      const layoutedNodes = applyDagreLayout(nodesWithCallbacks, edges, 'TB');
      return { nodes: layoutedNodes, edges };
    },
    [onNodesChangeProp]
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
    if (prevRootNodeRef.current === rootNode) return;
    prevRootNodeRef.current = rootNode;
    const { nodes: newNodes, edges: newEdges } = computeLayout(rootNode);
    setNodes(newNodes);
    setEdges(newEdges);
  }, [rootNode, setNodes, setEdges, computeLayout]);

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
    const updated = addChildToTree(rootNode, selectedNodeId, newNodeId);
    onNodesChangeProp(updated);
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

  const isDeleteDisabled = !selectedNodeId || selectedNodeId === rootNode.id;

  return (
    <div data-testid="mindmap-editor">
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
