import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MindmapPickerModal from './MindmapPickerModal';
import * as mindmapsApi from '../api/mindmaps';

vi.mock('../api/mindmaps', () => ({
  listMindmaps: vi.fn(),
}));

const mockPublishedMindmaps: mindmapsApi.Mindmap[] = [
  {
    id: 'mm-1',
    title: 'React入門マインドマップ',
    nodes: { id: 'root', text: 'React', children: [] },
    publishStatus: 'published',
    authorId: 'user-1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    publishedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'mm-2',
    title: 'AWS設計パターン',
    nodes: { id: 'root', text: 'AWS', children: [] },
    publishStatus: 'published',
    authorId: 'user-1',
    createdAt: '2026-01-02T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    publishedAt: '2026-01-02T00:00:00Z',
  },
  {
    id: 'mm-3',
    title: 'Go言語ベストプラクティス',
    nodes: { id: 'root', text: 'Go', children: [] },
    publishStatus: 'published',
    authorId: 'user-1',
    createdAt: '2026-01-03T00:00:00Z',
    updatedAt: '2026-01-03T00:00:00Z',
    publishedAt: '2026-01-03T00:00:00Z',
  },
];

describe('MindmapPickerModal', () => {
  const mockOnSelect = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('表示制御', () => {
    it('isOpenがfalseの場合は何も表示しない', () => {
      vi.mocked(mindmapsApi.listMindmaps).mockResolvedValue({
        items: [],
        count: 0,
      });

      const { container } = render(
        <MindmapPickerModal
          isOpen={false}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it('isOpenがtrueの場合はモーダルが表示される', async () => {
      vi.mocked(mindmapsApi.listMindmaps).mockResolvedValue({
        items: mockPublishedMindmaps,
        count: 3,
      });

      render(
        <MindmapPickerModal
          isOpen={true}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByTestId('mindmap-picker-modal')).toBeInTheDocument();
    });
  });

  describe('ローディング状態', () => {
    it('マインドマップ読み込み中はローディング表示される', () => {
      vi.mocked(mindmapsApi.listMindmaps).mockReturnValue(
        new Promise(() => {}) // never resolves
      );

      render(
        <MindmapPickerModal
          isOpen={true}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText(/読み込み中/)).toBeInTheDocument();
    });
  });

  describe('マインドマップ一覧表示', () => {
    it('公開済みマインドマップの一覧が表示される', async () => {
      vi.mocked(mindmapsApi.listMindmaps).mockResolvedValue({
        items: mockPublishedMindmaps,
        count: 3,
      });

      render(
        <MindmapPickerModal
          isOpen={true}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('React入門マインドマップ')).toBeInTheDocument();
        expect(screen.getByText('AWS設計パターン')).toBeInTheDocument();
        expect(
          screen.getByText('Go言語ベストプラクティス')
        ).toBeInTheDocument();
      });
    });

    it('マインドマップが0件の場合はメッセージが表示される', async () => {
      vi.mocked(mindmapsApi.listMindmaps).mockResolvedValue({
        items: [],
        count: 0,
      });

      render(
        <MindmapPickerModal
          isOpen={true}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(
          screen.getByText(/公開済みのマインドマップがありません/)
        ).toBeInTheDocument();
      });
    });

    it('モーダルタイトルが表示される', async () => {
      vi.mocked(mindmapsApi.listMindmaps).mockResolvedValue({
        items: mockPublishedMindmaps,
        count: 3,
      });

      render(
        <MindmapPickerModal
          isOpen={true}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      expect(screen.getByText('マインドマップを挿入')).toBeInTheDocument();
    });
  });

  describe('選択操作', () => {
    it('マインドマップをクリックするとonSelectが呼ばれる', async () => {
      const user = userEvent.setup();
      vi.mocked(mindmapsApi.listMindmaps).mockResolvedValue({
        items: mockPublishedMindmaps,
        count: 3,
      });

      render(
        <MindmapPickerModal
          isOpen={true}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('React入門マインドマップ')).toBeInTheDocument();
      });

      await user.click(screen.getByText('React入門マインドマップ'));

      expect(mockOnSelect).toHaveBeenCalledWith('mm-1');
    });

    it('別のマインドマップを選択すると正しいIDでonSelectが呼ばれる', async () => {
      const user = userEvent.setup();
      vi.mocked(mindmapsApi.listMindmaps).mockResolvedValue({
        items: mockPublishedMindmaps,
        count: 3,
      });

      render(
        <MindmapPickerModal
          isOpen={true}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('AWS設計パターン')).toBeInTheDocument();
      });

      await user.click(screen.getByText('AWS設計パターン'));

      expect(mockOnSelect).toHaveBeenCalledWith('mm-2');
    });
  });

  describe('閉じる操作', () => {
    it('キャンセルボタンをクリックするとonCloseが呼ばれる', async () => {
      const user = userEvent.setup();
      vi.mocked(mindmapsApi.listMindmaps).mockResolvedValue({
        items: mockPublishedMindmaps,
        count: 3,
      });

      render(
        <MindmapPickerModal
          isOpen={true}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      await user.click(screen.getByRole('button', { name: /キャンセル/ }));

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('オーバーレイをクリックするとonCloseが呼ばれる', async () => {
      const user = userEvent.setup();
      vi.mocked(mindmapsApi.listMindmaps).mockResolvedValue({
        items: mockPublishedMindmaps,
        count: 3,
      });

      render(
        <MindmapPickerModal
          isOpen={true}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      await user.click(screen.getByTestId('mindmap-picker-modal'));

      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('モーダル内部のクリックではonCloseが呼ばれない', async () => {
      const user = userEvent.setup();
      vi.mocked(mindmapsApi.listMindmaps).mockResolvedValue({
        items: mockPublishedMindmaps,
        count: 3,
      });

      render(
        <MindmapPickerModal
          isOpen={true}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('マインドマップを挿入')).toBeInTheDocument();
      });

      await user.click(screen.getByText('マインドマップを挿入'));

      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('エラーハンドリング', () => {
    it('API呼び出しが失敗した場合はエラーメッセージが表示される', async () => {
      vi.mocked(mindmapsApi.listMindmaps).mockRejectedValue(
        new Error('API Error')
      );

      render(
        <MindmapPickerModal
          isOpen={true}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(
          screen.getByText(/マインドマップの取得に失敗しました/)
        ).toBeInTheDocument();
      });
    });
  });

  describe('API呼び出し', () => {
    it('モーダルが開かれた時にlistMindmapsが呼ばれる', async () => {
      vi.mocked(mindmapsApi.listMindmaps).mockResolvedValue({
        items: mockPublishedMindmaps,
        count: 3,
      });

      render(
        <MindmapPickerModal
          isOpen={true}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      await waitFor(() => {
        expect(mindmapsApi.listMindmaps).toHaveBeenCalled();
      });
    });

    it('isOpenがfalseの場合はlistMindmapsが呼ばれない', () => {
      vi.mocked(mindmapsApi.listMindmaps).mockResolvedValue({
        items: [],
        count: 0,
      });

      render(
        <MindmapPickerModal
          isOpen={false}
          onSelect={mockOnSelect}
          onClose={mockOnClose}
        />
      );

      expect(mindmapsApi.listMindmaps).not.toHaveBeenCalled();
    });
  });
});
