import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MindmapCustomNode } from './MindmapCustomNode';
import type { MindmapNodeData } from '../utils/mindmapLayout';

vi.mock('@xyflow/react', () => ({
  Handle: () => <div data-testid="handle" />,
  Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
}));

const createProps = (
  overrides: Partial<MindmapNodeData> & {
    onTextChange?: (text: string) => void;
  } = {}
) => {
  const { onTextChange, ...dataOverrides } = overrides;
  return {
    id: 'node-1',
    data: {
      label: 'Test Node',
      onTextChange,
      ...dataOverrides,
    } as MindmapNodeData,
    selected: false,
    type: 'mindmapNode',
    isConnectable: true,
    zIndex: 0,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    dragging: false,
    dragHandle: undefined,
    sourcePosition: undefined,
    targetPosition: undefined,
    parentId: undefined,
    width: 180,
    height: 40,
  } as any;
};

describe('MindmapCustomNode', () => {
  it('should render node text', () => {
    render(<MindmapCustomNode {...createProps()} />);
    expect(screen.getByText('Test Node')).toBeInTheDocument();
  });

  it('should enter edit mode on double click', async () => {
    const user = userEvent.setup();
    render(<MindmapCustomNode {...createProps({ onTextChange: vi.fn() })} />);

    const textSpan = screen.getByText('Test Node');
    await user.dblClick(textSpan);

    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();
    expect(input).toHaveValue('Test Node');
  });

  it('should commit text on Enter key', async () => {
    const onTextChange = vi.fn();
    const user = userEvent.setup();
    render(<MindmapCustomNode {...createProps({ onTextChange })} />);

    const textSpan = screen.getByText('Test Node');
    await user.dblClick(textSpan);

    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'Updated Node{Enter}');

    expect(onTextChange).toHaveBeenCalledWith('Updated Node');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('should commit text on blur', async () => {
    const onTextChange = vi.fn();
    const user = userEvent.setup();
    render(<MindmapCustomNode {...createProps({ onTextChange })} />);

    const textSpan = screen.getByText('Test Node');
    await user.dblClick(textSpan);

    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'Blurred Node');
    fireEvent.blur(input);

    expect(onTextChange).toHaveBeenCalledWith('Blurred Node');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('should cancel edit on Escape key', async () => {
    const onTextChange = vi.fn();
    const user = userEvent.setup();
    render(<MindmapCustomNode {...createProps({ onTextChange })} />);

    const textSpan = screen.getByText('Test Node');
    await user.dblClick(textSpan);

    const input = screen.getByRole('textbox');
    await user.clear(input);
    await user.type(input, 'Cancelled{Escape}');

    expect(onTextChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByText('Test Node')).toBeInTheDocument();
  });

  it('should not enter edit mode without onTextChange callback', async () => {
    const user = userEvent.setup();
    render(<MindmapCustomNode {...createProps()} />);

    const textSpan = screen.getByText('Test Node');
    await user.dblClick(textSpan);

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('should allow newline with Ctrl+Enter (not Shift+Enter)', async () => {
    const onTextChange = vi.fn();
    const user = userEvent.setup();
    render(<MindmapCustomNode {...createProps({ onTextChange })} />);

    const textSpan = screen.getByText('Test Node');
    await user.dblClick(textSpan);

    const input = screen.getByRole('textbox');
    // Ctrl+Enter should NOT commit (allows newline)
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true });
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(onTextChange).not.toHaveBeenCalled();
  });

  it('should show drop target styling when isDropTarget is true', () => {
    const props = createProps({ isDropTarget: true });
    render(<MindmapCustomNode {...props} />);

    const node = screen.getByTestId('mindmap-custom-node');
    // jsdom doesn't serialize shorthand 'border' property; check the unique drop target box-shadow
    const style = node.getAttribute('style') ?? '';
    expect(style).toContain('rgba(34, 197, 94, 0.5)');
  });

  it('should show collapse toggle when node has children and isCollapsed is set', () => {
    const onToggleCollapse = vi.fn();
    const props = createProps({
      isCollapsed: false,
      childCount: 3,
      onToggleCollapse,
    });
    render(<MindmapCustomNode {...props} />);

    const toggle = screen.getByTestId('collapse-toggle');
    expect(toggle).toBeInTheDocument();
  });

  it('should show child count when collapsed', () => {
    const props = createProps({
      isCollapsed: true,
      childCount: 5,
      onToggleCollapse: vi.fn(),
    });
    render(<MindmapCustomNode {...props} />);

    const toggle = screen.getByTestId('collapse-toggle');
    expect(toggle.textContent).toBe('+5');
  });

  it('should not show collapse toggle when childCount is 0', () => {
    const props = createProps({
      isCollapsed: false,
      childCount: 0,
      onToggleCollapse: vi.fn(),
    });
    render(<MindmapCustomNode {...props} />);

    expect(screen.queryByTestId('collapse-toggle')).not.toBeInTheDocument();
  });
});
