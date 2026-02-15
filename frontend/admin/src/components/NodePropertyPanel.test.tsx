import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NodePropertyPanel } from './NodePropertyPanel';
import type { MindmapNode } from '../api/mindmaps';

describe('NodePropertyPanel', () => {
  const rootNode: MindmapNode = {
    id: 'root',
    text: 'Root',
    children: [
      {
        id: 'child-1',
        text: 'Child 1',
        color: '#FF5733',
        linkUrl: 'https://example.com',
        note: 'A note',
        children: [],
      },
      {
        id: 'child-2',
        text: 'Child 2',
        children: [],
      },
    ],
  };

  it('should not render when no node is selected', () => {
    render(
      <NodePropertyPanel
        rootNode={rootNode}
        selectedNodeId={null}
        onMetadataChange={vi.fn()}
      />
    );

    expect(screen.queryByTestId('node-property-panel')).not.toBeInTheDocument();
  });

  it('should not render when selectedNodeId does not exist in tree', () => {
    render(
      <NodePropertyPanel
        rootNode={rootNode}
        selectedNodeId="nonexistent"
        onMetadataChange={vi.fn()}
      />
    );

    expect(screen.queryByTestId('node-property-panel')).not.toBeInTheDocument();
  });

  it('should render panel when a node is selected', () => {
    render(
      <NodePropertyPanel
        rootNode={rootNode}
        selectedNodeId="child-1"
        onMetadataChange={vi.fn()}
      />
    );

    expect(screen.getByTestId('node-property-panel')).toBeInTheDocument();
  });

  it('should display the selected node text as header', () => {
    render(
      <NodePropertyPanel
        rootNode={rootNode}
        selectedNodeId="child-1"
        onMetadataChange={vi.fn()}
      />
    );

    expect(screen.getByText('Child 1')).toBeInTheDocument();
  });

  it('should display color input with current color value', () => {
    render(
      <NodePropertyPanel
        rootNode={rootNode}
        selectedNodeId="child-1"
        onMetadataChange={vi.fn()}
      />
    );

    const colorInput = screen.getByLabelText(/色/);
    expect(colorInput).toHaveValue('#ff5733');
  });

  it('should display link URL input with current value', () => {
    render(
      <NodePropertyPanel
        rootNode={rootNode}
        selectedNodeId="child-1"
        onMetadataChange={vi.fn()}
      />
    );

    const urlInput = screen.getByLabelText(/リンクURL/);
    expect(urlInput).toHaveValue('https://example.com');
  });

  it('should display note textarea with current value', () => {
    render(
      <NodePropertyPanel
        rootNode={rootNode}
        selectedNodeId="child-1"
        onMetadataChange={vi.fn()}
      />
    );

    const noteInput = screen.getByLabelText(/ノート/);
    expect(noteInput).toHaveValue('A note');
  });

  it('should show empty fields when node has no metadata', () => {
    render(
      <NodePropertyPanel
        rootNode={rootNode}
        selectedNodeId="child-2"
        onMetadataChange={vi.fn()}
      />
    );

    const urlInput = screen.getByLabelText(/リンクURL/);
    expect(urlInput).toHaveValue('');
    const noteInput = screen.getByLabelText(/ノート/);
    expect(noteInput).toHaveValue('');
  });

  it('should call onMetadataChange when color text input is changed', () => {
    const onMetadataChange = vi.fn();

    render(
      <NodePropertyPanel
        rootNode={rootNode}
        selectedNodeId="child-1"
        onMetadataChange={onMetadataChange}
      />
    );

    const colorTextInput = screen.getByTestId('color-text-input');
    fireEvent.change(colorTextInput, { target: { value: '#00FF00' } });

    expect(onMetadataChange).toHaveBeenCalledWith('child-1', {
      color: '#00FF00',
    });
  });

  it('should call onMetadataChange when color picker is changed', () => {
    const onMetadataChange = vi.fn();

    render(
      <NodePropertyPanel
        rootNode={rootNode}
        selectedNodeId="child-1"
        onMetadataChange={onMetadataChange}
      />
    );

    const colorPicker = screen.getByLabelText(/色/);
    fireEvent.change(colorPicker, { target: { value: '#0000FF' } });

    expect(onMetadataChange).toHaveBeenCalledWith('child-1', {
      color: '#0000ff',
    });
  });

  it('should call onMetadataChange when link URL is changed', () => {
    const onMetadataChange = vi.fn();

    render(
      <NodePropertyPanel
        rootNode={rootNode}
        selectedNodeId="child-2"
        onMetadataChange={onMetadataChange}
      />
    );

    const urlInput = screen.getByLabelText(/リンクURL/);
    fireEvent.change(urlInput, { target: { value: 'https://new-url.com' } });

    expect(onMetadataChange).toHaveBeenCalledWith('child-2', {
      linkUrl: 'https://new-url.com',
    });
  });

  it('should call onMetadataChange when note is changed', () => {
    const onMetadataChange = vi.fn();

    render(
      <NodePropertyPanel
        rootNode={rootNode}
        selectedNodeId="child-2"
        onMetadataChange={onMetadataChange}
      />
    );

    const noteInput = screen.getByLabelText(/ノート/);
    fireEvent.change(noteInput, { target: { value: 'New note text' } });

    expect(onMetadataChange).toHaveBeenCalledWith('child-2', {
      note: 'New note text',
    });
  });

  it('should show character count for note', () => {
    render(
      <NodePropertyPanel
        rootNode={rootNode}
        selectedNodeId="child-1"
        onMetadataChange={vi.fn()}
      />
    );

    expect(screen.getByText('6 / 1000')).toBeInTheDocument();
  });

  it('should show validation error when note exceeds 1000 characters', () => {
    const longNote = 'a'.repeat(1001);
    const treeWithLongNote: MindmapNode = {
      id: 'root',
      text: 'Root',
      children: [
        {
          id: 'child-1',
          text: 'Child 1',
          note: longNote,
          children: [],
        },
      ],
    };

    render(
      <NodePropertyPanel
        rootNode={treeWithLongNote}
        selectedNodeId="child-1"
        onMetadataChange={vi.fn()}
      />
    );

    expect(screen.getByText(/1000文字以内/)).toBeInTheDocument();
  });

  it('should not show validation error when note is within limit', () => {
    render(
      <NodePropertyPanel
        rootNode={rootNode}
        selectedNodeId="child-1"
        onMetadataChange={vi.fn()}
      />
    );

    expect(screen.queryByText(/1000文字以内/)).not.toBeInTheDocument();
  });

  it('should update fields when selectedNodeId changes', () => {
    const { rerender } = render(
      <NodePropertyPanel
        rootNode={rootNode}
        selectedNodeId="child-1"
        onMetadataChange={vi.fn()}
      />
    );

    expect(screen.getByLabelText(/リンクURL/)).toHaveValue(
      'https://example.com'
    );

    rerender(
      <NodePropertyPanel
        rootNode={rootNode}
        selectedNodeId="child-2"
        onMetadataChange={vi.fn()}
      />
    );

    expect(screen.getByLabelText(/リンクURL/)).toHaveValue('');
  });

  it('should show 0 / 1000 when note is empty', () => {
    render(
      <NodePropertyPanel
        rootNode={rootNode}
        selectedNodeId="child-2"
        onMetadataChange={vi.fn()}
      />
    );

    expect(screen.getByText('0 / 1000')).toBeInTheDocument();
  });
});
