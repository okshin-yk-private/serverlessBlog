import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MindmapEditor } from './MindmapEditor';
import type { MindmapNode } from '../api/mindmaps';

// Stateful mock that tracks setNodes/setEdges calls
let mockSetNodes: ReturnType<typeof vi.fn>;
let mockSetEdges: ReturnType<typeof vi.fn>;
let mockNodesState: unknown[];
let mockEdgesState: unknown[];
let capturedOnNodeDragStop: ((...args: unknown[]) => void) | null = null;
const mockGetIntersectingNodes = vi.fn();

vi.mock('@xyflow/react', () => {
  const ReactFlowMock = ({
    children,
    nodes,
    edges,
    onNodeDragStop,
    ...props
  }: Record<string, unknown>) => {
    capturedOnNodeDragStop = onNodeDragStop as
      | ((...args: unknown[]) => void)
      | null;
    return (
      <div
        data-testid="reactflow-canvas"
        data-node-count={(nodes as unknown[])?.length}
        data-edge-count={(edges as unknown[])?.length}
        data-nodes-json={JSON.stringify(nodes)}
        data-has-drag-handler={onNodeDragStop ? 'true' : 'false'}
        {...props}
      >
        {children}
      </div>
    );
  };
  const BackgroundMock = () => <div data-testid="reactflow-background" />;
  const ControlsMock = () => <div data-testid="reactflow-controls" />;
  return {
    ReactFlow: ReactFlowMock,
    Background: BackgroundMock,
    Controls: ControlsMock,
    Handle: () => <div data-testid="handle" />,
    Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
    useNodesState: (initial: unknown[]) => {
      mockNodesState = initial;
      mockSetNodes = vi.fn((updater) => {
        if (typeof updater === 'function') {
          const result = updater(mockNodesState);
          if (result !== undefined) {
            mockNodesState = result;
          }
        } else {
          mockNodesState = updater;
        }
      });
      return [initial, mockSetNodes, vi.fn()];
    },
    useEdgesState: (initial: unknown[]) => {
      mockEdgesState = initial;
      mockSetEdges = vi.fn((updater) => {
        if (typeof updater === 'function') {
          const result = updater(mockEdgesState);
          if (result !== undefined) {
            mockEdgesState = result;
          }
        } else {
          mockEdgesState = updater;
        }
      });
      return [initial, mockSetEdges, vi.fn()];
    },
    useReactFlow: () => ({
      getIntersectingNodes: mockGetIntersectingNodes,
    }),
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
  };
});

describe('MindmapEditor', () => {
  const defaultRootNode: MindmapNode = {
    id: 'root',
    text: 'Central Idea',
    children: [],
  };

  it('should render ReactFlow canvas', () => {
    render(
      <MindmapEditor rootNode={defaultRootNode} onNodesChange={vi.fn()} />
    );

    expect(screen.getByTestId('reactflow-canvas')).toBeInTheDocument();
  });

  it('should render with controls and background', () => {
    render(
      <MindmapEditor rootNode={defaultRootNode} onNodesChange={vi.fn()} />
    );

    expect(screen.getByTestId('reactflow-controls')).toBeInTheDocument();
    expect(screen.getByTestId('reactflow-background')).toBeInTheDocument();
  });

  it('should convert tree nodes to ReactFlow nodes', () => {
    const treeWithChildren: MindmapNode = {
      id: 'root',
      text: 'Root',
      children: [
        { id: 'child-1', text: 'Child 1', children: [] },
        { id: 'child-2', text: 'Child 2', children: [] },
      ],
    };

    render(
      <MindmapEditor rootNode={treeWithChildren} onNodesChange={vi.fn()} />
    );

    const canvas = screen.getByTestId('reactflow-canvas');
    expect(canvas.getAttribute('data-node-count')).toBe('3');
    expect(canvas.getAttribute('data-edge-count')).toBe('2');
  });

  it('should render a single root node with correct node/edge counts', () => {
    render(
      <MindmapEditor rootNode={defaultRootNode} onNodesChange={vi.fn()} />
    );

    const canvas = screen.getByTestId('reactflow-canvas');
    expect(canvas.getAttribute('data-node-count')).toBe('1');
    expect(canvas.getAttribute('data-edge-count')).toBe('0');
  });

  // Fix #1: rootNode prop changes should sync internal state
  it('should sync internal state when rootNode prop changes', () => {
    const { rerender } = render(
      <MindmapEditor rootNode={defaultRootNode} onNodesChange={vi.fn()} />
    );

    const updatedRootNode: MindmapNode = {
      id: 'root',
      text: 'Updated Root',
      children: [{ id: 'new-child', text: 'New Child', children: [] }],
    };

    act(() => {
      rerender(
        <MindmapEditor rootNode={updatedRootNode} onNodesChange={vi.fn()} />
      );
    });

    // setNodes and setEdges should have been called for the sync
    expect(mockSetNodes).toHaveBeenCalled();
    expect(mockSetEdges).toHaveBeenCalled();
  });

  // Fix #3: selectedNodeId should be applied to internal nodes
  it('should apply selectedNodeId to internal node state', () => {
    const treeWithChildren: MindmapNode = {
      id: 'root',
      text: 'Root',
      children: [{ id: 'child-1', text: 'Child 1', children: [] }],
    };

    act(() => {
      render(
        <MindmapEditor
          rootNode={treeWithChildren}
          onNodesChange={vi.fn()}
          selectedNodeId="child-1"
        />
      );
    });

    // setNodes should have been called with a function that sets selected
    expect(mockSetNodes).toHaveBeenCalled();
    const lastCall =
      mockSetNodes.mock.calls[mockSetNodes.mock.calls.length - 1];
    const updater = lastCall[0];
    if (typeof updater === 'function') {
      const result = updater([
        { id: 'root', selected: false },
        { id: 'child-1', selected: false },
      ]);
      const selectedNode = result.find(
        (n: { id: string }) => n.id === 'child-1'
      );
      const unselectedNode = result.find(
        (n: { id: string }) => n.id === 'root'
      );
      expect(selectedNode.selected).toBe(true);
      expect(unselectedNode.selected).toBe(false);
    }
  });

  // Toolbar tests
  it('should render Add Child and Delete buttons', () => {
    render(
      <MindmapEditor rootNode={defaultRootNode} onNodesChange={vi.fn()} />
    );

    expect(
      screen.getByRole('button', { name: /add child/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
  });

  it('should disable Add Child and Delete buttons when no node is selected', () => {
    render(
      <MindmapEditor
        rootNode={defaultRootNode}
        onNodesChange={vi.fn()}
        selectedNodeId={null}
      />
    );

    expect(screen.getByRole('button', { name: /add child/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /delete/i })).toBeDisabled();
  });

  it('should enable Add Child button when a node is selected', () => {
    render(
      <MindmapEditor
        rootNode={defaultRootNode}
        onNodesChange={vi.fn()}
        selectedNodeId="root"
      />
    );

    expect(screen.getByRole('button', { name: /add child/i })).toBeEnabled();
  });

  it('should disable Delete button when root node is selected', () => {
    const treeWithChildren: MindmapNode = {
      id: 'root',
      text: 'Root',
      children: [{ id: 'child-1', text: 'Child 1', children: [] }],
    };

    render(
      <MindmapEditor
        rootNode={treeWithChildren}
        onNodesChange={vi.fn()}
        selectedNodeId="root"
      />
    );

    expect(screen.getByRole('button', { name: /delete/i })).toBeDisabled();
  });

  it('should enable Delete button when a non-root node is selected', () => {
    const treeWithChildren: MindmapNode = {
      id: 'root',
      text: 'Root',
      children: [{ id: 'child-1', text: 'Child 1', children: [] }],
    };

    render(
      <MindmapEditor
        rootNode={treeWithChildren}
        onNodesChange={vi.fn()}
        selectedNodeId="child-1"
      />
    );

    expect(screen.getByRole('button', { name: /delete/i })).toBeEnabled();
  });

  it('should call onNodesChange with new child when Add Child is clicked', async () => {
    const user = userEvent.setup();
    const onNodesChange = vi.fn();

    render(
      <MindmapEditor
        rootNode={defaultRootNode}
        onNodesChange={onNodesChange}
        selectedNodeId="root"
      />
    );

    const addButton = screen.getByRole('button', { name: /add child/i });
    await user.click(addButton);

    expect(onNodesChange).toHaveBeenCalledTimes(1);
    const newTree = onNodesChange.mock.calls[0][0];
    expect(newTree.children).toHaveLength(1);
    expect(newTree.children[0].text).toBe('New Node');
  });

  it('should call onNodesChange with node removed when Delete is clicked', async () => {
    const user = userEvent.setup();
    const onNodesChange = vi.fn();
    const treeWithChildren: MindmapNode = {
      id: 'root',
      text: 'Root',
      children: [{ id: 'child-1', text: 'Child 1', children: [] }],
    };

    render(
      <MindmapEditor
        rootNode={treeWithChildren}
        onNodesChange={onNodesChange}
        selectedNodeId="child-1"
      />
    );

    const deleteButton = screen.getByRole('button', { name: /delete/i });
    await user.click(deleteButton);

    expect(onNodesChange).toHaveBeenCalledTimes(1);
    const newTree = onNodesChange.mock.calls[0][0];
    expect(newTree.children).toHaveLength(0);
  });

  // Drag & Drop tests
  it('should pass onNodeDragStop handler to ReactFlow', () => {
    render(
      <MindmapEditor rootNode={defaultRootNode} onNodesChange={vi.fn()} />
    );

    const canvas = screen.getByTestId('reactflow-canvas');
    expect(canvas.getAttribute('data-has-drag-handler')).toBe('true');
  });

  it('should call onNodesChange when a node is dropped on another node', () => {
    const onNodesChange = vi.fn();
    const treeWithChildren: MindmapNode = {
      id: 'root',
      text: 'Root',
      children: [
        { id: 'child-1', text: 'Child 1', children: [] },
        { id: 'child-2', text: 'Child 2', children: [] },
      ],
    };

    // Mock getIntersectingNodes to return child-2 as the drop target
    mockGetIntersectingNodes.mockReturnValue([
      { id: 'child-2', data: { label: 'Child 2' } },
    ]);

    render(
      <MindmapEditor
        rootNode={treeWithChildren}
        onNodesChange={onNodesChange}
      />
    );

    // Simulate drag stop on child-1
    act(() => {
      capturedOnNodeDragStop?.({} as unknown, {
        id: 'child-1',
        data: { label: 'Child 1' },
        position: { x: 0, y: 0 },
      });
    });

    expect(onNodesChange).toHaveBeenCalled();
    const newTree = onNodesChange.mock.calls[0][0];
    // child-1 should now be under child-2
    expect(newTree.children).toHaveLength(1);
    expect(newTree.children[0].id).toBe('child-2');
    const movedChild = newTree.children[0].children.find(
      (c: MindmapNode) => c.id === 'child-1'
    );
    expect(movedChild).toBeDefined();
  });

  it('should not move when dropped on empty space (no intersecting nodes)', () => {
    const onNodesChange = vi.fn();
    const treeWithChildren: MindmapNode = {
      id: 'root',
      text: 'Root',
      children: [{ id: 'child-1', text: 'Child 1', children: [] }],
    };

    mockGetIntersectingNodes.mockReturnValue([]);

    render(
      <MindmapEditor
        rootNode={treeWithChildren}
        onNodesChange={onNodesChange}
      />
    );

    act(() => {
      capturedOnNodeDragStop?.({} as unknown, {
        id: 'child-1',
        data: { label: 'Child 1' },
        position: { x: 0, y: 0 },
      });
    });

    // Should not call onNodesChange for invalid drop
    expect(onNodesChange).not.toHaveBeenCalled();
  });

  it('should not move root node via drag and drop', () => {
    const onNodesChange = vi.fn();
    const treeWithChildren: MindmapNode = {
      id: 'root',
      text: 'Root',
      children: [{ id: 'child-1', text: 'Child 1', children: [] }],
    };

    mockGetIntersectingNodes.mockReturnValue([
      { id: 'child-1', data: { label: 'Child 1' } },
    ]);

    render(
      <MindmapEditor
        rootNode={treeWithChildren}
        onNodesChange={onNodesChange}
      />
    );

    act(() => {
      capturedOnNodeDragStop?.({} as unknown, {
        id: 'root',
        data: { label: 'Root' },
        position: { x: 0, y: 0 },
      });
    });

    // moveNodeInTree returns null for root, so onNodesChange should not be called
    expect(onNodesChange).not.toHaveBeenCalled();
  });

  // Add Sibling button tests
  it('should render Add Sibling button', () => {
    render(
      <MindmapEditor rootNode={defaultRootNode} onNodesChange={vi.fn()} />
    );

    expect(
      screen.getByRole('button', { name: /add sibling/i })
    ).toBeInTheDocument();
  });

  it('should disable Add Sibling button when root node is selected', () => {
    render(
      <MindmapEditor
        rootNode={defaultRootNode}
        onNodesChange={vi.fn()}
        selectedNodeId="root"
      />
    );

    expect(screen.getByRole('button', { name: /add sibling/i })).toBeDisabled();
  });

  it('should enable Add Sibling button when a non-root node is selected', () => {
    const treeWithChildren: MindmapNode = {
      id: 'root',
      text: 'Root',
      children: [{ id: 'child-1', text: 'Child 1', children: [] }],
    };

    render(
      <MindmapEditor
        rootNode={treeWithChildren}
        onNodesChange={vi.fn()}
        selectedNodeId="child-1"
      />
    );

    expect(screen.getByRole('button', { name: /add sibling/i })).toBeEnabled();
  });

  it('should call onNodesChange with sibling when Add Sibling is clicked', async () => {
    const user = userEvent.setup();
    const onNodesChange = vi.fn();
    const treeWithChildren: MindmapNode = {
      id: 'root',
      text: 'Root',
      children: [{ id: 'child-1', text: 'Child 1', children: [] }],
    };

    render(
      <MindmapEditor
        rootNode={treeWithChildren}
        onNodesChange={onNodesChange}
        selectedNodeId="child-1"
      />
    );

    const addSiblingButton = screen.getByRole('button', {
      name: /add sibling/i,
    });
    await user.click(addSiblingButton);

    expect(onNodesChange).toHaveBeenCalledTimes(1);
    const newTree = onNodesChange.mock.calls[0][0];
    expect(newTree.children).toHaveLength(2);
    expect(newTree.children[1].text).toBe('New Node');
  });

  // Keyboard shortcut tests
  it('should add child node on Tab key when a node is selected', async () => {
    const user = userEvent.setup();
    const onNodesChange = vi.fn();

    render(
      <MindmapEditor
        rootNode={defaultRootNode}
        onNodesChange={onNodesChange}
        selectedNodeId="root"
      />
    );

    const editor = screen.getByTestId('mindmap-editor');
    editor.focus();
    await user.keyboard('{Tab}');

    expect(onNodesChange).toHaveBeenCalled();
    const newTree = onNodesChange.mock.calls[0][0];
    expect(newTree.children).toHaveLength(1);
    expect(newTree.children[0].text).toBe('New Node');
  });

  it('should add sibling node on Enter key when a non-root node is selected', async () => {
    const user = userEvent.setup();
    const onNodesChange = vi.fn();
    const treeWithChildren: MindmapNode = {
      id: 'root',
      text: 'Root',
      children: [{ id: 'child-1', text: 'Child 1', children: [] }],
    };

    render(
      <MindmapEditor
        rootNode={treeWithChildren}
        onNodesChange={onNodesChange}
        selectedNodeId="child-1"
      />
    );

    const editor = screen.getByTestId('mindmap-editor');
    editor.focus();
    await user.keyboard('{Enter}');

    expect(onNodesChange).toHaveBeenCalled();
    const newTree = onNodesChange.mock.calls[0][0];
    expect(newTree.children).toHaveLength(2);
  });

  it('should not add sibling on Enter key when root node is selected', async () => {
    const user = userEvent.setup();
    const onNodesChange = vi.fn();

    render(
      <MindmapEditor
        rootNode={defaultRootNode}
        onNodesChange={onNodesChange}
        selectedNodeId="root"
      />
    );

    const editor = screen.getByTestId('mindmap-editor');
    editor.focus();
    await user.keyboard('{Enter}');

    expect(onNodesChange).not.toHaveBeenCalled();
  });

  it('should not trigger shortcuts when no node is selected', async () => {
    const user = userEvent.setup();
    const onNodesChange = vi.fn();

    render(
      <MindmapEditor
        rootNode={defaultRootNode}
        onNodesChange={onNodesChange}
        selectedNodeId={null}
      />
    );

    const editor = screen.getByTestId('mindmap-editor');
    editor.focus();
    await user.keyboard('{Tab}');
    await user.keyboard('{Enter}');

    expect(onNodesChange).not.toHaveBeenCalled();
  });

  it('should not move a node to its own descendant', () => {
    const onNodesChange = vi.fn();
    const treeWithChildren: MindmapNode = {
      id: 'root',
      text: 'Root',
      children: [
        {
          id: 'child-1',
          text: 'Child 1',
          children: [
            { id: 'grandchild-1', text: 'Grandchild 1', children: [] },
          ],
        },
      ],
    };

    // Try to drop child-1 onto grandchild-1 (its descendant)
    mockGetIntersectingNodes.mockReturnValue([
      { id: 'grandchild-1', data: { label: 'Grandchild 1' } },
    ]);

    render(
      <MindmapEditor
        rootNode={treeWithChildren}
        onNodesChange={onNodesChange}
      />
    );

    act(() => {
      capturedOnNodeDragStop?.({} as unknown, {
        id: 'child-1',
        data: { label: 'Child 1' },
        position: { x: 0, y: 0 },
      });
    });

    // moveNodeInTree returns null for circular move, so onNodesChange should not be called
    expect(onNodesChange).not.toHaveBeenCalled();
  });
});
