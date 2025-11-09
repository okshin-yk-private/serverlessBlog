/**
 * 削除確認ダイアログコンポーネント
 *
 * Requirements:
 * - R43: E2Eテスト（記事管理フロー）
 * - 削除アクションの確認ダイアログ
 */

interface ConfirmDialogProps {
  isOpen: boolean;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmDialog = ({
  isOpen,
  message,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      data-testid="confirm-dialog"
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6">
          <p className="text-gray-800 text-lg">{message}</p>
        </div>
        <div className="flex justify-end space-x-3">
          <button
            data-testid="confirm-no"
            onClick={onCancel}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
          >
            いいえ
          </button>
          <button
            data-testid="confirm-yes"
            onClick={onConfirm}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            はい
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
