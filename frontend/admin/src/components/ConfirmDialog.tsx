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
      <div className="admin-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="mb-6">
          <p className="admin-dialog-message">{message}</p>
        </div>
        <div className="flex justify-end space-x-3">
          <button
            data-testid="confirm-no"
            onClick={onCancel}
            className="admin-btn admin-btn-secondary"
          >
            いいえ
          </button>
          <button
            data-testid="confirm-yes"
            onClick={onConfirm}
            className="admin-btn admin-btn-danger"
          >
            はい
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
