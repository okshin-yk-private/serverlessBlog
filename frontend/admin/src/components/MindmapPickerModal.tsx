import { useState, useEffect } from 'react';
import { listMindmaps, type Mindmap } from '../api/mindmaps';

interface MindmapPickerModalProps {
  isOpen: boolean;
  onSelect: (mindmapId: string) => void;
  onClose: () => void;
}

const MindmapPickerModal = ({
  isOpen,
  onSelect,
  onClose,
}: MindmapPickerModalProps) => {
  const [mindmaps, setMindmaps] = useState<Mindmap[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const fetchMindmaps = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await listMindmaps();
        const published = response.items.filter(
          (m) => m.publishStatus === 'published'
        );
        setMindmaps(published);
      } catch {
        setError('マインドマップの取得に失敗しました');
      } finally {
        setLoading(false);
      }
    };

    fetchMindmaps();
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      data-testid="mindmap-picker-modal"
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg p-6 max-w-lg w-full mx-4 shadow-xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          マインドマップを挿入
        </h2>

        <div className="flex-1 overflow-y-auto min-h-0">
          {loading && (
            <p className="text-gray-500 text-center py-4">読み込み中...</p>
          )}

          {error && <p className="text-red-600 text-center py-4">{error}</p>}

          {!loading && !error && mindmaps.length === 0 && (
            <p className="text-gray-500 text-center py-4">
              公開済みのマインドマップがありません
            </p>
          )}

          {!loading && !error && mindmaps.length > 0 && (
            <ul className="divide-y divide-gray-200">
              {mindmaps.map((mindmap) => (
                <li key={mindmap.id}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-3 hover:bg-blue-50 transition-colors rounded"
                    onClick={() => onSelect(mindmap.id)}
                  >
                    <span className="text-gray-800 font-medium">
                      {mindmap.title}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end mt-4 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
};

export default MindmapPickerModal;
