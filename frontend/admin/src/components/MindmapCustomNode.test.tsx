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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
});
