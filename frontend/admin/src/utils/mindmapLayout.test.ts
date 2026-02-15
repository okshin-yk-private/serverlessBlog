import { describe, it, expect } from 'vitest';
import type { MindmapNode } from '../api/mindmaps';
import {
  convertTreeToReactFlow,
  convertReactFlowToTree,
  applyDagreLayout,
  addChildToTree,
  addSiblingToTree,
  findParentInTree,
  updateNodeTextInTree,
  deleteNodeFromTree,
  isDescendantOf,
  moveNodeInTree,
  findNodeInTree,
  updateNodeMetadataInTree,
  convertTreeToMarkdown,
} from './mindmapLayout';

const createSimpleTree = (): MindmapNode => ({
  id: 'root',
  text: 'Root',
  children: [
    {
      id: 'child-1',
      text: 'Child 1',
      children: [],
    },
    {
      id: 'child-2',
      text: 'Child 2',
      children: [
        {
          id: 'grandchild-1',
          text: 'Grandchild 1',
          children: [],
        },
      ],
    },
  ],
});

describe('convertTreeToReactFlow', () => {
  it('should convert a single root node to nodes and edges', () => {
    const root: MindmapNode = {
      id: 'root',
      text: 'Root',
      children: [],
    };

    const { nodes, edges } = convertTreeToReactFlow(root);

    expect(nodes).toHaveLength(1);
    expect(edges).toHaveLength(0);
    expect(nodes[0]).toMatchObject({
      id: 'root',
      data: {
        label: 'Root',
        color: undefined,
        linkUrl: undefined,
        note: undefined,
      },
      type: 'mindmapNode',
    });
  });

  it('should convert a tree with children to nodes and edges', () => {
    const root = createSimpleTree();
    const { nodes, edges } = convertTreeToReactFlow(root);

    expect(nodes).toHaveLength(4);
    expect(edges).toHaveLength(3);

    // Check all node ids
    const nodeIds = nodes.map((n) => n.id);
    expect(nodeIds).toContain('root');
    expect(nodeIds).toContain('child-1');
    expect(nodeIds).toContain('child-2');
    expect(nodeIds).toContain('grandchild-1');

    // Check edges
    const edgeSources = edges.map((e) => `${e.source}->${e.target}`);
    expect(edgeSources).toContain('root->child-1');
    expect(edgeSources).toContain('root->child-2');
    expect(edgeSources).toContain('child-2->grandchild-1');
  });

  it('should preserve node metadata (color, linkUrl, note)', () => {
    const root: MindmapNode = {
      id: 'root',
      text: 'Root',
      color: '#FF5733',
      linkUrl: 'https://example.com',
      note: 'Some note',
      children: [],
    };

    const { nodes } = convertTreeToReactFlow(root);

    expect(nodes[0].data).toMatchObject({
      label: 'Root',
      color: '#FF5733',
      linkUrl: 'https://example.com',
      note: 'Some note',
    });
  });
});

describe('convertReactFlowToTree', () => {
  it('should convert flat nodes and edges back to a tree', () => {
    const root = createSimpleTree();
    const { nodes, edges } = convertTreeToReactFlow(root);

    const tree = convertReactFlowToTree(nodes, edges);

    expect(tree).not.toBeNull();
    expect(tree!.id).toBe('root');
    expect(tree!.text).toBe('Root');
    expect(tree!.children).toHaveLength(2);

    const child1 = tree!.children.find((c) => c.id === 'child-1');
    expect(child1).toBeDefined();
    expect(child1!.children).toHaveLength(0);

    const child2 = tree!.children.find((c) => c.id === 'child-2');
    expect(child2).toBeDefined();
    expect(child2!.children).toHaveLength(1);
    expect(child2!.children[0].id).toBe('grandchild-1');
  });

  it('should return null for empty nodes', () => {
    const tree = convertReactFlowToTree([], []);
    expect(tree).toBeNull();
  });

  it('should use first root candidate when multiple disconnected nodes exist', () => {
    const nodes = [
      {
        id: 'root',
        data: { label: 'Root' },
        position: { x: 0, y: 0 },
        type: 'mindmapNode' as const,
      },
      {
        id: 'orphan',
        data: { label: 'Orphan' },
        position: { x: 0, y: 0 },
        type: 'mindmapNode' as const,
      },
      {
        id: 'child-1',
        data: { label: 'Child' },
        position: { x: 0, y: 0 },
        type: 'mindmapNode' as const,
      },
    ];
    const edges = [{ id: 'e1', source: 'root', target: 'child-1' }];

    const tree = convertReactFlowToTree(nodes, edges);

    expect(tree).not.toBeNull();
    // Should still return a valid tree from the first root candidate
    expect(tree!.id).toBe('root');
    expect(tree!.children).toHaveLength(1);
  });

  it('should skip children whose node data is missing from nodeMap', () => {
    const nodes = [
      {
        id: 'root',
        data: { label: 'Root' },
        position: { x: 0, y: 0 },
        type: 'mindmapNode' as const,
      },
      {
        id: 'child-1',
        data: { label: 'Child 1' },
        position: { x: 0, y: 0 },
        type: 'mindmapNode' as const,
      },
    ];
    // Edge references a node that doesn't exist in the nodes array
    const edges = [
      { id: 'e1', source: 'root', target: 'child-1' },
      { id: 'e2', source: 'root', target: 'missing-node' },
    ];

    const tree = convertReactFlowToTree(nodes, edges);

    expect(tree).not.toBeNull();
    expect(tree!.id).toBe('root');
    // missing-node should be skipped, only child-1 remains
    expect(tree!.children).toHaveLength(1);
    expect(tree!.children[0].id).toBe('child-1');
  });

  it('should preserve metadata in round-trip conversion', () => {
    const root: MindmapNode = {
      id: 'root',
      text: 'Root',
      color: '#FF5733',
      linkUrl: 'https://example.com',
      note: 'A note',
      children: [
        {
          id: 'child-1',
          text: 'Child',
          color: '#00FF00',
          children: [],
        },
      ],
    };

    const { nodes, edges } = convertTreeToReactFlow(root);
    const tree = convertReactFlowToTree(nodes, edges);

    expect(tree!.color).toBe('#FF5733');
    expect(tree!.linkUrl).toBe('https://example.com');
    expect(tree!.note).toBe('A note');
    expect(tree!.children[0].color).toBe('#00FF00');
  });
});

describe('applyDagreLayout', () => {
  it('should assign positions to nodes', () => {
    const root = createSimpleTree();
    const { nodes, edges } = convertTreeToReactFlow(root);

    const layoutedNodes = applyDagreLayout(nodes, edges);

    // All nodes should have defined positions
    for (const node of layoutedNodes) {
      expect(node.position).toBeDefined();
      expect(typeof node.position.x).toBe('number');
      expect(typeof node.position.y).toBe('number');
      expect(Number.isNaN(node.position.x)).toBe(false);
      expect(Number.isNaN(node.position.y)).toBe(false);
    }
  });

  it('should position root node at center-top for TB direction', () => {
    const root: MindmapNode = {
      id: 'root',
      text: 'Root',
      children: [
        { id: 'child-1', text: 'Child 1', children: [] },
        { id: 'child-2', text: 'Child 2', children: [] },
      ],
    };

    const { nodes, edges } = convertTreeToReactFlow(root);
    const layoutedNodes = applyDagreLayout(nodes, edges, 'TB');

    const rootNode = layoutedNodes.find((n) => n.id === 'root');
    const child1 = layoutedNodes.find((n) => n.id === 'child-1');
    const child2 = layoutedNodes.find((n) => n.id === 'child-2');

    // Root should be above children in TB layout
    expect(rootNode!.position.y).toBeLessThan(child1!.position.y);
    expect(rootNode!.position.y).toBeLessThan(child2!.position.y);
  });

  it('should position root node at left for LR direction', () => {
    const root: MindmapNode = {
      id: 'root',
      text: 'Root',
      children: [{ id: 'child-1', text: 'Child 1', children: [] }],
    };

    const { nodes, edges } = convertTreeToReactFlow(root);
    const layoutedNodes = applyDagreLayout(nodes, edges, 'LR');

    const rootNode = layoutedNodes.find((n) => n.id === 'root');
    const child1 = layoutedNodes.find((n) => n.id === 'child-1');

    // Root should be to the left of children in LR layout
    expect(rootNode!.position.x).toBeLessThan(child1!.position.x);
  });

  it('should handle a single node without errors', () => {
    const root: MindmapNode = {
      id: 'root',
      text: 'Root',
      children: [],
    };

    const { nodes, edges } = convertTreeToReactFlow(root);
    const layoutedNodes = applyDagreLayout(nodes, edges);

    expect(layoutedNodes).toHaveLength(1);
    expect(layoutedNodes[0].position).toBeDefined();
  });
});

describe('addChildToTree', () => {
  it('should add a child to the root node', () => {
    const root: MindmapNode = {
      id: 'root',
      text: 'Root',
      children: [],
    };

    const result = addChildToTree(root, 'root', 'new-child-id');

    expect(result.children).toHaveLength(1);
    expect(result.children[0].id).toBe('new-child-id');
    expect(result.children[0].text).toBe('New Node');
    expect(result.children[0].children).toEqual([]);
  });

  it('should add a child to a nested node', () => {
    const root = createSimpleTree();

    const result = addChildToTree(root, 'child-1', 'new-child-id');

    const child1 = result.children.find((c) => c.id === 'child-1');
    expect(child1!.children).toHaveLength(1);
    expect(child1!.children[0].id).toBe('new-child-id');
  });

  it('should not mutate the original tree', () => {
    const root: MindmapNode = {
      id: 'root',
      text: 'Root',
      children: [],
    };

    const result = addChildToTree(root, 'root', 'new-child-id');

    expect(root.children).toHaveLength(0);
    expect(result.children).toHaveLength(1);
    expect(result).not.toBe(root);
  });

  it('should return unchanged tree if parentId not found', () => {
    const root: MindmapNode = {
      id: 'root',
      text: 'Root',
      children: [],
    };

    const result = addChildToTree(root, 'nonexistent', 'new-child-id');

    expect(result.children).toHaveLength(0);
  });
});

describe('updateNodeTextInTree', () => {
  it('should update root node text', () => {
    const root: MindmapNode = {
      id: 'root',
      text: 'Root',
      children: [],
    };

    const result = updateNodeTextInTree(root, 'root', 'Updated Root');

    expect(result.text).toBe('Updated Root');
  });

  it('should update nested node text', () => {
    const root = createSimpleTree();

    const result = updateNodeTextInTree(root, 'grandchild-1', 'Updated GC');

    const child2 = result.children.find((c) => c.id === 'child-2');
    expect(child2!.children[0].text).toBe('Updated GC');
  });

  it('should not mutate the original tree', () => {
    const root = createSimpleTree();

    const result = updateNodeTextInTree(root, 'child-1', 'Updated');

    const origChild = root.children.find((c) => c.id === 'child-1');
    const updatedChild = result.children.find((c) => c.id === 'child-1');
    expect(origChild!.text).toBe('Child 1');
    expect(updatedChild!.text).toBe('Updated');
  });

  it('should return unchanged tree if nodeId not found', () => {
    const root: MindmapNode = {
      id: 'root',
      text: 'Root',
      children: [],
    };

    const result = updateNodeTextInTree(root, 'nonexistent', 'Updated');

    expect(result.text).toBe('Root');
  });
});

describe('deleteNodeFromTree', () => {
  it('should delete a leaf child node', () => {
    const root = createSimpleTree();

    const result = deleteNodeFromTree(root, 'child-1');

    expect(result.children).toHaveLength(1);
    expect(result.children[0].id).toBe('child-2');
  });

  it('should delete a node with descendants (cascading)', () => {
    const root = createSimpleTree();

    const result = deleteNodeFromTree(root, 'child-2');

    expect(result.children).toHaveLength(1);
    expect(result.children[0].id).toBe('child-1');
    // grandchild-1 should also be gone
    const allNodeIds = getAllNodeIds(result);
    expect(allNodeIds).not.toContain('grandchild-1');
  });

  it('should not delete the root node', () => {
    const root = createSimpleTree();

    const result = deleteNodeFromTree(root, 'root');

    expect(result.id).toBe('root');
    expect(result.children).toHaveLength(2);
  });

  it('should not mutate the original tree', () => {
    const root = createSimpleTree();

    const result = deleteNodeFromTree(root, 'child-1');

    expect(root.children).toHaveLength(2);
    expect(result.children).toHaveLength(1);
  });

  it('should return unchanged tree if nodeId not found', () => {
    const root = createSimpleTree();

    const result = deleteNodeFromTree(root, 'nonexistent');

    expect(result.children).toHaveLength(2);
  });

  it('should delete a deeply nested node', () => {
    const root = createSimpleTree();

    const result = deleteNodeFromTree(root, 'grandchild-1');

    const child2 = result.children.find((c) => c.id === 'child-2');
    expect(child2!.children).toHaveLength(0);
  });
});

function getAllNodeIds(node: MindmapNode): string[] {
  return [node.id, ...node.children.flatMap(getAllNodeIds)];
}

describe('isDescendantOf', () => {
  it('should return true for a direct child', () => {
    const root = createSimpleTree();
    expect(isDescendantOf(root, 'child-1', 'root')).toBe(true);
  });

  it('should return true for a grandchild', () => {
    const root = createSimpleTree();
    expect(isDescendantOf(root, 'grandchild-1', 'root')).toBe(true);
  });

  it('should return true for a grandchild of a non-root ancestor', () => {
    const root = createSimpleTree();
    expect(isDescendantOf(root, 'grandchild-1', 'child-2')).toBe(true);
  });

  it('should return false when node is not a descendant', () => {
    const root = createSimpleTree();
    expect(isDescendantOf(root, 'child-1', 'child-2')).toBe(false);
  });

  it('should return false when nodeId equals ancestorId', () => {
    const root = createSimpleTree();
    expect(isDescendantOf(root, 'root', 'root')).toBe(false);
  });

  it('should return false for a parent checking against its child', () => {
    const root = createSimpleTree();
    expect(isDescendantOf(root, 'child-2', 'grandchild-1')).toBe(false);
  });

  it('should return false for non-existent nodeId', () => {
    const root = createSimpleTree();
    expect(isDescendantOf(root, 'nonexistent', 'root')).toBe(false);
  });
});

describe('moveNodeInTree', () => {
  it('should move a child to another parent', () => {
    const root = createSimpleTree();
    // Move child-1 under child-2
    const result = moveNodeInTree(root, 'child-1', 'child-2');

    expect(result).not.toBeNull();
    // child-1 should no longer be a direct child of root
    expect(result!.children).toHaveLength(1);
    expect(result!.children[0].id).toBe('child-2');
    // child-1 should be a child of child-2
    const child2 = result!.children[0];
    const child1InChild2 = child2.children.find((c) => c.id === 'child-1');
    expect(child1InChild2).toBeDefined();
  });

  it('should return null when moving a node to its own descendant (circular)', () => {
    const root = createSimpleTree();
    // Try to move child-2 under grandchild-1 (its own descendant)
    const result = moveNodeInTree(root, 'child-2', 'grandchild-1');
    expect(result).toBeNull();
  });

  it('should return null when moving a node to itself', () => {
    const root = createSimpleTree();
    const result = moveNodeInTree(root, 'child-1', 'child-1');
    expect(result).toBeNull();
  });

  it('should return null when trying to move the root node', () => {
    const root = createSimpleTree();
    const result = moveNodeInTree(root, 'root', 'child-1');
    expect(result).toBeNull();
  });

  it('should preserve the moved node and its subtree', () => {
    const root = createSimpleTree();
    // Move child-2 (which has grandchild-1) under child-1
    const result = moveNodeInTree(root, 'child-2', 'child-1');

    expect(result).not.toBeNull();
    const child1 = result!.children.find((c) => c.id === 'child-1');
    expect(child1).toBeDefined();
    const movedChild2 = child1!.children.find((c) => c.id === 'child-2');
    expect(movedChild2).toBeDefined();
    // grandchild-1 should still be under child-2
    expect(movedChild2!.children).toHaveLength(1);
    expect(movedChild2!.children[0].id).toBe('grandchild-1');
  });

  it('should not mutate the original tree', () => {
    const root = createSimpleTree();
    const originalChildCount = root.children.length;

    moveNodeInTree(root, 'child-1', 'child-2');

    expect(root.children).toHaveLength(originalChildCount);
    expect(root.children[0].id).toBe('child-1');
  });

  it('should return null when nodeId does not exist', () => {
    const root = createSimpleTree();
    const result = moveNodeInTree(root, 'nonexistent', 'child-1');
    expect(result).toBeNull();
  });

  it('should return null when newParentId does not exist', () => {
    const root = createSimpleTree();
    const result = moveNodeInTree(root, 'child-1', 'nonexistent');
    expect(result).toBeNull();
  });

  it('should move a deeply nested node to root level', () => {
    const root = createSimpleTree();
    // Move grandchild-1 directly under root
    const result = moveNodeInTree(root, 'grandchild-1', 'root');

    expect(result).not.toBeNull();
    // root should now have 3 children: child-1, child-2, grandchild-1
    expect(result!.children).toHaveLength(3);
    const gcUnderRoot = result!.children.find((c) => c.id === 'grandchild-1');
    expect(gcUnderRoot).toBeDefined();
    // child-2 should no longer have grandchild-1
    const child2 = result!.children.find((c) => c.id === 'child-2');
    expect(child2!.children).toHaveLength(0);
  });
});

describe('findNodeInTree', () => {
  it('should find the root node', () => {
    const root = createSimpleTree();
    const found = findNodeInTree(root, 'root');
    expect(found).not.toBeNull();
    expect(found!.id).toBe('root');
    expect(found!.text).toBe('Root');
  });

  it('should find a direct child node', () => {
    const root = createSimpleTree();
    const found = findNodeInTree(root, 'child-1');
    expect(found).not.toBeNull();
    expect(found!.id).toBe('child-1');
    expect(found!.text).toBe('Child 1');
  });

  it('should find a deeply nested node', () => {
    const root = createSimpleTree();
    const found = findNodeInTree(root, 'grandchild-1');
    expect(found).not.toBeNull();
    expect(found!.id).toBe('grandchild-1');
    expect(found!.text).toBe('Grandchild 1');
  });

  it('should return null for non-existent node', () => {
    const root = createSimpleTree();
    const found = findNodeInTree(root, 'nonexistent');
    expect(found).toBeNull();
  });

  it('should return the node with its metadata', () => {
    const root: MindmapNode = {
      id: 'root',
      text: 'Root',
      color: '#FF0000',
      linkUrl: 'https://example.com',
      note: 'A note',
      children: [],
    };
    const found = findNodeInTree(root, 'root');
    expect(found!.color).toBe('#FF0000');
    expect(found!.linkUrl).toBe('https://example.com');
    expect(found!.note).toBe('A note');
  });
});

describe('updateNodeMetadataInTree', () => {
  it('should update the color of a node', () => {
    const root = createSimpleTree();
    const result = updateNodeMetadataInTree(root, 'child-1', {
      color: '#FF5733',
    });
    const child1 = result.children.find((c) => c.id === 'child-1');
    expect(child1!.color).toBe('#FF5733');
  });

  it('should update the linkUrl of a node', () => {
    const root = createSimpleTree();
    const result = updateNodeMetadataInTree(root, 'child-1', {
      linkUrl: 'https://example.com',
    });
    const child1 = result.children.find((c) => c.id === 'child-1');
    expect(child1!.linkUrl).toBe('https://example.com');
  });

  it('should update the note of a node', () => {
    const root = createSimpleTree();
    const result = updateNodeMetadataInTree(root, 'child-1', {
      note: 'Test note',
    });
    const child1 = result.children.find((c) => c.id === 'child-1');
    expect(child1!.note).toBe('Test note');
  });

  it('should update multiple metadata fields at once', () => {
    const root = createSimpleTree();
    const result = updateNodeMetadataInTree(root, 'child-1', {
      color: '#00FF00',
      linkUrl: 'https://test.com',
      note: 'Multi update',
    });
    const child1 = result.children.find((c) => c.id === 'child-1');
    expect(child1!.color).toBe('#00FF00');
    expect(child1!.linkUrl).toBe('https://test.com');
    expect(child1!.note).toBe('Multi update');
  });

  it('should update the root node metadata', () => {
    const root = createSimpleTree();
    const result = updateNodeMetadataInTree(root, 'root', { color: '#0000FF' });
    expect(result.color).toBe('#0000FF');
  });

  it('should update a deeply nested node', () => {
    const root = createSimpleTree();
    const result = updateNodeMetadataInTree(root, 'grandchild-1', {
      note: 'Deep note',
    });
    const gc = result.children[1].children[0];
    expect(gc.note).toBe('Deep note');
  });

  it('should not mutate the original tree', () => {
    const root = createSimpleTree();
    const result = updateNodeMetadataInTree(root, 'child-1', {
      color: '#FF0000',
    });
    expect(root.children[0].color).toBeUndefined();
    expect(result.children[0].color).toBe('#FF0000');
  });

  it('should preserve existing text and children when updating metadata', () => {
    const root = createSimpleTree();
    const result = updateNodeMetadataInTree(root, 'child-2', {
      color: '#FF0000',
    });
    const child2 = result.children.find((c) => c.id === 'child-2');
    expect(child2!.text).toBe('Child 2');
    expect(child2!.children).toHaveLength(1);
    expect(child2!.children[0].id).toBe('grandchild-1');
  });

  it('should clear metadata by setting to undefined', () => {
    const root: MindmapNode = {
      id: 'root',
      text: 'Root',
      color: '#FF0000',
      note: 'Existing note',
      children: [],
    };
    const result = updateNodeMetadataInTree(root, 'root', {
      color: undefined,
      note: undefined,
    });
    expect(result.color).toBeUndefined();
    expect(result.note).toBeUndefined();
  });

  it('should return unchanged tree if nodeId not found', () => {
    const root = createSimpleTree();
    const result = updateNodeMetadataInTree(root, 'nonexistent', {
      color: '#FF0000',
    });
    // Tree should be structurally the same (though new references)
    expect(result.children).toHaveLength(2);
    expect(result.children[0].color).toBeUndefined();
  });
});

describe('findParentInTree', () => {
  it('should return null for the root node (root has no parent)', () => {
    const root = createSimpleTree();
    expect(findParentInTree(root, 'root')).toBeNull();
  });

  it('should find the parent of a direct child', () => {
    const root = createSimpleTree();
    const parent = findParentInTree(root, 'child-1');
    expect(parent).not.toBeNull();
    expect(parent!.id).toBe('root');
  });

  it('should find the parent of a grandchild', () => {
    const root = createSimpleTree();
    const parent = findParentInTree(root, 'grandchild-1');
    expect(parent).not.toBeNull();
    expect(parent!.id).toBe('child-2');
  });

  it('should return null for a non-existent node', () => {
    const root = createSimpleTree();
    expect(findParentInTree(root, 'nonexistent')).toBeNull();
  });
});

describe('addSiblingToTree', () => {
  it('should return null when adding a sibling to the root node', () => {
    const root = createSimpleTree();
    const result = addSiblingToTree(root, 'root', 'new-sibling');
    expect(result).toBeNull();
  });

  it('should insert a sibling right after the selected node', () => {
    const root = createSimpleTree();
    const result = addSiblingToTree(root, 'child-1', 'new-sibling');

    expect(result).not.toBeNull();
    expect(result!.children).toHaveLength(3);
    expect(result!.children[0].id).toBe('child-1');
    expect(result!.children[1].id).toBe('new-sibling');
    expect(result!.children[1].text).toBe('New Node');
    expect(result!.children[2].id).toBe('child-2');
  });

  it('should insert a sibling after the last child', () => {
    const root = createSimpleTree();
    const result = addSiblingToTree(root, 'child-2', 'new-sibling');

    expect(result).not.toBeNull();
    expect(result!.children).toHaveLength(3);
    expect(result!.children[2].id).toBe('new-sibling');
  });

  it('should insert a sibling in a deeply nested position', () => {
    const root = createSimpleTree();
    const result = addSiblingToTree(root, 'grandchild-1', 'new-sibling');

    expect(result).not.toBeNull();
    const child2 = result!.children.find((c) => c.id === 'child-2');
    expect(child2!.children).toHaveLength(2);
    expect(child2!.children[0].id).toBe('grandchild-1');
    expect(child2!.children[1].id).toBe('new-sibling');
  });

  it('should not mutate the original tree', () => {
    const root = createSimpleTree();
    const originalChildCount = root.children.length;

    addSiblingToTree(root, 'child-1', 'new-sibling');

    expect(root.children).toHaveLength(originalChildCount);
  });

  it('should return null for a non-existent node', () => {
    const root = createSimpleTree();
    const result = addSiblingToTree(root, 'nonexistent', 'new-sibling');
    expect(result).toBeNull();
  });
});

describe('convertTreeToMarkdown', () => {
  it('should convert a single root node to a Markdown list item', () => {
    const root: MindmapNode = {
      id: 'root',
      text: 'Root',
      children: [],
    };

    const result = convertTreeToMarkdown(root);
    expect(result).toBe('- Root\n');
  });

  it('should convert a tree with children to nested Markdown list', () => {
    const root: MindmapNode = {
      id: 'root',
      text: 'Root',
      children: [
        { id: 'child-1', text: 'Child 1', children: [] },
        { id: 'child-2', text: 'Child 2', children: [] },
      ],
    };

    const result = convertTreeToMarkdown(root);
    expect(result).toBe('- Root\n' + '  - Child 1\n' + '  - Child 2\n');
  });

  it('should convert deeply nested tree to Markdown list', () => {
    const root = createSimpleTree();

    const result = convertTreeToMarkdown(root);
    expect(result).toBe(
      '- Root\n' + '  - Child 1\n' + '  - Child 2\n' + '    - Grandchild 1\n'
    );
  });

  it('should include link URL as Markdown link format', () => {
    const root: MindmapNode = {
      id: 'root',
      text: 'Root',
      children: [
        {
          id: 'child-1',
          text: 'Google',
          linkUrl: 'https://google.com',
          children: [],
        },
      ],
    };

    const result = convertTreeToMarkdown(root);
    expect(result).toBe('- Root\n' + '  - [Google](https://google.com)\n');
  });

  it('should include note as blockquote format', () => {
    const root: MindmapNode = {
      id: 'root',
      text: 'Root',
      children: [
        {
          id: 'child-1',
          text: 'Node with note',
          note: 'This is a note',
          children: [],
        },
      ],
    };

    const result = convertTreeToMarkdown(root);
    expect(result).toBe(
      '- Root\n' + '  - Node with note\n' + '    > This is a note\n'
    );
  });

  it('should include both link and note together', () => {
    const root: MindmapNode = {
      id: 'root',
      text: 'Topic',
      linkUrl: 'https://example.com',
      note: 'Important topic',
      children: [],
    };

    const result = convertTreeToMarkdown(root);
    expect(result).toBe(
      '- [Topic](https://example.com)\n' + '  > Important topic\n'
    );
  });

  it('should handle multi-line notes with blockquote on each line', () => {
    const root: MindmapNode = {
      id: 'root',
      text: 'Root',
      note: 'Line 1\nLine 2\nLine 3',
      children: [],
    };

    const result = convertTreeToMarkdown(root);
    expect(result).toBe(
      '- Root\n' + '  > Line 1\n' + '  > Line 2\n' + '  > Line 3\n'
    );
  });

  it('should handle complex tree with mixed metadata', () => {
    const root: MindmapNode = {
      id: 'root',
      text: 'Project',
      children: [
        {
          id: 'design',
          text: 'Design',
          linkUrl: 'https://figma.com',
          children: [
            {
              id: 'ui',
              text: 'UI Components',
              note: 'Use Tailwind CSS',
              children: [],
            },
          ],
        },
        {
          id: 'dev',
          text: 'Development',
          children: [],
        },
      ],
    };

    const result = convertTreeToMarkdown(root);
    expect(result).toBe(
      '- Project\n' +
        '  - [Design](https://figma.com)\n' +
        '    - UI Components\n' +
        '      > Use Tailwind CSS\n' +
        '  - Development\n'
    );
  });

  it('should not include empty linkUrl or note', () => {
    const root: MindmapNode = {
      id: 'root',
      text: 'Root',
      linkUrl: '',
      note: '',
      children: [],
    };

    const result = convertTreeToMarkdown(root);
    expect(result).toBe('- Root\n');
  });
});
