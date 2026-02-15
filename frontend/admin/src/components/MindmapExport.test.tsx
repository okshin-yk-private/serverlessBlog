import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MindmapExport } from './MindmapExport';
import type { MindmapNode } from '../api/mindmaps';

describe('MindmapExport', () => {
  const rootNode: MindmapNode = {
    id: 'root',
    text: 'Project',
    children: [
      {
        id: 'child-1',
        text: 'Design',
        linkUrl: 'https://figma.com',
        children: [],
      },
      {
        id: 'child-2',
        text: 'Development',
        note: 'Use TypeScript',
        children: [],
      },
    ],
  };

  let mockWriteText: ReturnType<typeof vi.fn>;
  let mockCreateObjectURL: ReturnType<typeof vi.fn>;
  let mockRevokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockWriteText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText: mockWriteText },
    });
    mockCreateObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    mockRevokeObjectURL = vi.fn();
    URL.createObjectURL = mockCreateObjectURL;
    URL.revokeObjectURL = mockRevokeObjectURL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render the export button', () => {
    render(<MindmapExport rootNode={rootNode} />);
    expect(screen.getByTestId('export-button')).toBeInTheDocument();
  });

  it('should show export options when export button is clicked', () => {
    render(<MindmapExport rootNode={rootNode} />);
    fireEvent.click(screen.getByTestId('export-button'));

    expect(screen.getByTestId('copy-clipboard-button')).toBeInTheDocument();
    expect(screen.getByTestId('download-button')).toBeInTheDocument();
  });

  it('should copy markdown to clipboard when copy button is clicked', async () => {
    render(<MindmapExport rootNode={rootNode} />);
    fireEvent.click(screen.getByTestId('export-button'));
    fireEvent.click(screen.getByTestId('copy-clipboard-button'));

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledTimes(1);
    });

    const copiedText = mockWriteText.mock.calls[0][0];
    expect(copiedText).toContain('- Project');
    expect(copiedText).toContain('[Design](https://figma.com)');
    expect(copiedText).toContain('> Use TypeScript');
  });

  it('should trigger file download when download button is clicked', () => {
    vi.useFakeTimers();
    const mockClick = vi.fn();
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === 'a') {
        vi.spyOn(el, 'click').mockImplementation(mockClick);
      }
      return el;
    });

    render(<MindmapExport rootNode={rootNode} />);
    fireEvent.click(screen.getByTestId('export-button'));
    fireEvent.click(screen.getByTestId('download-button'));

    expect(mockCreateObjectURL).toHaveBeenCalledTimes(1);
    expect(mockClick).toHaveBeenCalledTimes(1);
    // revokeObjectURL is called after a delay
    expect(mockRevokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(mockRevokeObjectURL).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('should hide export options after copy', async () => {
    render(<MindmapExport rootNode={rootNode} />);
    fireEvent.click(screen.getByTestId('export-button'));
    fireEvent.click(screen.getByTestId('copy-clipboard-button'));

    await waitFor(() => {
      expect(
        screen.queryByTestId('copy-clipboard-button')
      ).not.toBeInTheDocument();
    });
  });

  it('should show error message when clipboard copy fails', async () => {
    mockWriteText.mockRejectedValue(new Error('Permission denied'));

    render(<MindmapExport rootNode={rootNode} />);
    fireEvent.click(screen.getByTestId('export-button'));
    fireEvent.click(screen.getByTestId('copy-clipboard-button'));

    await waitFor(() => {
      expect(screen.getByTestId('copy-error')).toBeInTheDocument();
    });
    // Options should remain visible (not closed)
    expect(screen.getByTestId('copy-clipboard-button')).toBeInTheDocument();
  });

  it('should hide export options after download', () => {
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === 'a') {
        vi.spyOn(el, 'click').mockImplementation(() => {});
      }
      return el;
    });

    render(<MindmapExport rootNode={rootNode} />);
    fireEvent.click(screen.getByTestId('export-button'));
    fireEvent.click(screen.getByTestId('download-button'));

    expect(screen.queryByTestId('download-button')).not.toBeInTheDocument();
  });
});
