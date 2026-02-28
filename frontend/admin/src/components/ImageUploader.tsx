import React, { useState, useMemo, type ChangeEvent } from 'react';
import { Button } from './Button';
import ConfirmDialog from './ConfirmDialog';
import { isAllowedImageUrl } from '../utils/imageUrl';

interface ImageUploaderProps {
  onUploadComplete: (imageUrl: string) => void;
  uploadFunction?: (file: File) => Promise<string>;
  /** アップロード済み画像のURL一覧 */
  uploadedImages?: string[];
  /** 画像削除コールバック */
  onDelete?: (imageUrl: string) => Promise<void>;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * ゴミ箱アイコン（SVG）
 */
const TrashIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
    />
  </svg>
);

// CloudFront URL from environment variable
const CLOUDFRONT_URL = import.meta.env.VITE_CLOUDFRONT_URL as
  | string
  | undefined;

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  onUploadComplete,
  uploadFunction,
  uploadedImages = [],
  onDelete,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // 許可されたURLのみをフィルタリング（セキュリティ対策）
  const validatedImages = useMemo(() => {
    return uploadedImages.filter((url) =>
      isAllowedImageUrl(url, CLOUDFRONT_URL)
    );
  }, [uploadedImages]);

  // フィルタリングされた画像がある場合は警告
  const filteredCount = uploadedImages.length - validatedImages.length;

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];

    if (!file) {
      return;
    }

    // ファイル形式チェック
    if (!file.type.startsWith('image/')) {
      setError('画像ファイルを選択してください');
      setSelectedFile(null);
      setPreviewUrl(null);
      return;
    }

    // ファイルサイズチェック
    if (file.size > MAX_FILE_SIZE) {
      setError('ファイルサイズは10MB以下にしてください');
      setSelectedFile(null);
      setPreviewUrl(null);
      return;
    }

    // プレビュー表示
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreviewUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!selectedFile || !uploadFunction) {
      return;
    }

    setError(null);
    setIsUploading(true);

    try {
      const imageUrl = await uploadFunction(selectedFile);
      onUploadComplete(imageUrl);

      // アップロード成功後、状態をクリア
      setSelectedFile(null);
      setPreviewUrl(null);
    } catch (err) {
      console.error('Upload error:', err);
      setError('アップロードに失敗しました');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancel = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setError(null);
  };

  const handleDeleteClick = (imageUrl: string) => {
    setDeleteError(null);
    setDeleteTarget(imageUrl);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget || !onDelete) {
      setDeleteTarget(null);
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      await onDelete(deleteTarget);
      setDeleteTarget(null);
    } catch (err) {
      console.error('Delete error:', err);
      setDeleteError('画像の削除に失敗しました。もう一度お試しください。');
      setDeleteTarget(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-4">
      {/* ファイル選択 */}
      <div>
        <label
          htmlFor="image-upload"
          className="inline-block px-4 py-2 bg-gray-200 text-gray-800 rounded cursor-pointer hover:bg-gray-300 transition-colors"
        >
          画像を選択
        </label>
        <input
          id="image-upload"
          data-testid="image-upload-input"
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
          aria-label="画像を選択"
        />
      </div>

      {/* エラーメッセージ */}
      {error && (
        <div
          className="p-3 bg-red-100 border border-red-400 text-red-700 rounded"
          data-testid="error-message"
        >
          {error}
        </div>
      )}

      {/* 削除エラーメッセージ */}
      {deleteError && (
        <div
          className="p-3 bg-red-100 border border-red-400 text-red-700 rounded"
          data-testid="delete-error-message"
        >
          {deleteError}
        </div>
      )}

      {/* プレビューとアップロードボタン */}
      {previewUrl && (
        <div className="space-y-3">
          <div
            className="border border-gray-300 rounded p-2 bg-gray-50"
            data-testid="image-preview"
          >
            <img
              src={previewUrl}
              alt="プレビュー"
              className="max-w-full h-auto max-h-64 mx-auto"
            />
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="primary"
              onClick={handleUpload}
              disabled={isUploading}
            >
              {isUploading ? 'アップロード中...' : 'アップロード'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleCancel}
              disabled={isUploading}
              data-testid="remove-image-button"
            >
              キャンセル
            </Button>
          </div>

          {/* プログレスバー */}
          {isUploading && (
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full animate-pulse"
                style={{ width: '100%' }}
                role="progressbar"
                aria-label="アップロード中"
              />
            </div>
          )}
        </div>
      )}

      {/* フィルタリング警告 */}
      {filteredCount > 0 && (
        <div
          className="p-3 bg-yellow-100 border border-yellow-400 text-yellow-700 rounded text-sm"
          data-testid="url-validation-warning"
        >
          {filteredCount}件の画像が許可されていないURLのため非表示になっています
        </div>
      )}

      {/* アップロード済み画像一覧 */}
      {validatedImages.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">アップロード済み画像:</p>
          <div
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3"
            data-testid="uploaded-images-grid"
          >
            {validatedImages.map((imageUrl) => (
              <div key={imageUrl} className="relative group">
                <div className="border border-gray-300 rounded overflow-hidden bg-gray-50">
                  <img
                    src={imageUrl}
                    alt="アップロード済み画像"
                    className="w-full h-24 object-cover"
                    data-testid="uploaded-image"
                  />
                </div>
                {onDelete && (
                  <button
                    type="button"
                    onClick={() => handleDeleteClick(imageUrl)}
                    disabled={isDeleting}
                    className="absolute top-1 right-1 p-1.5 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700 disabled:opacity-50"
                    aria-label="画像を削除"
                    data-testid="delete-image-button"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 削除確認ダイアログ */}
      <ConfirmDialog
        isOpen={deleteTarget !== null}
        message="この画像を削除しますか？この操作は元に戻せません。"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
    </div>
  );
};
