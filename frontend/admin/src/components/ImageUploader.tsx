import React, { useState, type ChangeEvent } from 'react';
import { Button } from './Button';

interface ImageUploaderProps {
  onUploadComplete: (imageUrl: string) => void;
  uploadFunction?: (file: File) => Promise<string>;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  onUploadComplete,
  uploadFunction,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

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
    </div>
  );
};
