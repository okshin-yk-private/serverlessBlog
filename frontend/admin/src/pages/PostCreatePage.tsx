import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PostEditor, type PostEditorHandle } from '../components/PostEditor';
import { ImageUploader } from '../components/ImageUploader';
import MindmapPickerModal from '../components/MindmapPickerModal';
import { createPost, uploadImage, deleteImage } from '../api/posts';
import AdminLayout from '../components/AdminLayout';
import { useCategories } from '../hooks/useCategories';

const PostCreatePage = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [isMindmapPickerOpen, setIsMindmapPickerOpen] = useState(false);
  const editorRef = useRef<PostEditorHandle>(null);

  // カテゴリを動的に取得
  const {
    categories,
    loading: categoriesLoading,
    error: categoriesError,
    refetch: refetchCategories,
  } = useCategories();

  const handleSave = async (data: {
    title: string;
    contentMarkdown: string;
    category: string;
    tags: string[];
    publishStatus: 'draft' | 'published';
  }) => {
    try {
      setError(null);
      await createPost(data);
      navigate('/posts');
    } catch (err) {
      console.error('記事作成エラー:', err);
      setError('記事の作成に失敗しました');
      // エラーを再スローしない（unhandled promiseエラーを防ぐ）
    }
  };

  const handleCancel = () => {
    navigate('/posts');
  };

  // ImageUploaderからの画像アップロード完了時
  const handleImageUpload = (imageUrl: string) => {
    setUploadedImages((prev) => [...prev, imageUrl]);
    const markdownImage = `![image](${imageUrl})`;
    editorRef.current?.insertAtCursor(markdownImage);
  };

  // 画像削除ハンドラー
  const handleImageDelete = async (imageUrl: string) => {
    try {
      await deleteImage(imageUrl);
      setUploadedImages((prev) => prev.filter((url) => url !== imageUrl));
      // エディタからも画像タグを削除
      editorRef.current?.removeImageUrl(imageUrl);
    } catch (err) {
      console.error('画像削除エラー:', err);
      setError('画像の削除に失敗しました');
    }
  };

  // マインドマップ選択ハンドラー
  const handleMindmapSelect = (mindmapId: string) => {
    const marker = `\n{{mindmap:${mindmapId}}}\n`;
    editorRef.current?.insertAtCursor(marker);
    setIsMindmapPickerOpen(false);
  };

  // ペーストによる画像アップロード
  const handleImagePaste = async (file: File) => {
    setIsUploading(true);
    try {
      const imageUrl = await uploadImage(file);
      setUploadedImages((prev) => [...prev, imageUrl]);
      const markdownImage = `![image](${imageUrl})`;
      editorRef.current?.insertAtCursor(markdownImage);
    } catch (err) {
      console.error('Image paste upload failed:', err);
      setError('画像のアップロードに失敗しました');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <AdminLayout title="New Article" subtitle="新しい記事を作成">
      {error && (
        <div
          className="admin-alert admin-alert-error"
          data-testid="error-message"
        >
          {error}
        </div>
      )}

      <div className="admin-card">
        <h2 className="admin-card-title">画像アップロード</h2>
        <ImageUploader
          onUploadComplete={handleImageUpload}
          uploadFunction={uploadImage}
          uploadedImages={uploadedImages}
          onDelete={handleImageDelete}
        />
      </div>

      <div className="admin-card">
        <PostEditor
          ref={editorRef}
          onSave={handleSave}
          onCancel={handleCancel}
          onImagePaste={handleImagePaste}
          isUploading={isUploading}
          categories={categories}
          categoriesLoading={categoriesLoading}
          categoriesError={categoriesError}
          onCategoriesRefetch={refetchCategories}
          onMindmapInsertClick={() => setIsMindmapPickerOpen(true)}
        />
      </div>

      <MindmapPickerModal
        isOpen={isMindmapPickerOpen}
        onSelect={handleMindmapSelect}
        onClose={() => setIsMindmapPickerOpen(false)}
      />
    </AdminLayout>
  );
};

export default PostCreatePage;
