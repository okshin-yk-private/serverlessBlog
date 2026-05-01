import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PostEditor, type PostEditorHandle } from '../components/PostEditor';
import MindmapPickerModal from '../components/MindmapPickerModal';
import { createPost } from '../api/posts';
import AdminLayout from '../components/AdminLayout';
import { useCategories } from '../hooks/useCategories';

const PostCreatePage = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
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

  // マインドマップ選択ハンドラー
  const handleMindmapSelect = (mindmapId: string) => {
    const marker = `\n{{mindmap:${mindmapId}}}\n`;
    editorRef.current?.insertAtCursor(marker);
    setIsMindmapPickerOpen(false);
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
        <PostEditor
          ref={editorRef}
          onSave={handleSave}
          onCancel={handleCancel}
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
