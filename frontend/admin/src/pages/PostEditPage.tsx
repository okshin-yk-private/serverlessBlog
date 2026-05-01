import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  PostEditor,
  type PostData,
  type PostEditorHandle,
} from '../components/PostEditor';
import MindmapPickerModal from '../components/MindmapPickerModal';
import { getPost, updatePost } from '../api/posts';
import AdminLayout from '../components/AdminLayout';
import { PostEditSkeleton } from '../components/skeleton';
import { useCategories } from '../hooks/useCategories';

const PostEditPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [initialData, setInitialData] = useState<PostData | null>(null);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    const fetchPost = async () => {
      if (!id) {
        setError('記事IDが指定されていません');
        setLoading(false);
        return;
      }

      try {
        const post = await getPost(id);
        setInitialData({
          title: post.title,
          contentMarkdown: post.contentMarkdown,
          category: post.category,
          tags: post.tags || [],
          publishStatus: post.publishStatus,
        });
      } catch (err) {
        console.error('記事取得エラー:', err);
        setError('記事の取得に失敗しました');
      } finally {
        setLoading(false);
      }
    };

    fetchPost();
  }, [id]);

  const handleSave = async (data: PostData) => {
    // IDはuseEffectでチェック済み。IDがない場合はPostEditorが表示されないため、
    // このhandleSaveは呼ばれない。したがって、冗長なIDチェックは不要。
    try {
      setError(null);
      await updatePost(id!, data);
      navigate('/posts');
    } catch (err) {
      console.error('記事更新エラー:', err);
      setError('記事の更新に失敗しました');
      // エラーは再スローしない（UIでエラーメッセージを表示するのみ）
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

  if (loading) {
    return (
      <AdminLayout title="Edit Article">
        <PostEditSkeleton />
      </AdminLayout>
    );
  }

  if (error && !initialData) {
    return (
      <AdminLayout title="Edit Article">
        <div className="admin-alert admin-alert-error">{error}</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Edit Article" subtitle="記事を編集">
      {error && <div className="admin-alert admin-alert-error">{error}</div>}

      <div className="admin-card">
        {initialData && (
          <PostEditor
            key={id}
            ref={editorRef}
            onSave={handleSave}
            onCancel={handleCancel}
            initialData={initialData}
            categories={categories}
            categoriesLoading={categoriesLoading}
            categoriesError={categoriesError}
            onCategoriesRefetch={refetchCategories}
            onMindmapInsertClick={() => setIsMindmapPickerOpen(true)}
          />
        )}
      </div>

      <MindmapPickerModal
        isOpen={isMindmapPickerOpen}
        onSelect={handleMindmapSelect}
        onClose={() => setIsMindmapPickerOpen(false)}
      />
    </AdminLayout>
  );
};

export default PostEditPage;
