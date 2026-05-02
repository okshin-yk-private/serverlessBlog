import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  PostEditor,
  type PostData,
  type PostEditorHandle,
} from '../components/PostEditor';
import { getPost, updatePost } from '../api/posts';
import AdminLayout from '../components/AdminLayout';
import { BuildStatusBadge } from '../components/BuildStatusBadge';
import { PostEditSkeleton } from '../components/skeleton';
import { useCategories } from '../hooks/useCategories';

const PostEditPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [initialData, setInitialData] = useState<PostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // PR5b: After publish, stay on the page and show build progress instead of
  // navigating away. Drafts continue to navigate to the list.
  const [publishedPostId, setPublishedPostId] = useState<string | null>(null);
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
          slug: post.slug ?? '',
          excerpt: post.excerpt ?? '',
          coverImageUrl: post.coverImageUrl ?? '',
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
      if (data.publishStatus === 'published') {
        setPublishedPostId(id!);
        return;
      }
      navigate('/posts');
    } catch (err) {
      console.error('記事更新エラー:', err);
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        setError(
          err.response.data?.message ?? 'この slug は既に使われています'
        );
        return;
      }
      setError('記事の更新に失敗しました');
      // エラーは再スローしない（UIでエラーメッセージを表示するのみ）
    }
  };

  // 自動保存: 既存記事なので常に updatePost
  const handleAutosave = useCallback(
    async (data: PostData) => {
      if (!id) return;
      await updatePost(id, data);
    },
    [id]
  );

  const handleCancel = () => {
    navigate('/posts');
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

      <BuildStatusBadge
        postId={publishedPostId ?? undefined}
        enabled={publishedPostId !== null}
      />

      <div className="admin-card">
        {initialData && (
          <PostEditor
            key={id}
            ref={editorRef}
            onSave={handleSave}
            onCancel={handleCancel}
            onAutosave={handleAutosave}
            initialData={initialData}
            categories={categories}
            categoriesLoading={categoriesLoading}
            categoriesError={categoriesError}
            onCategoriesRefetch={refetchCategories}
          />
        )}
      </div>
    </AdminLayout>
  );
};

export default PostEditPage;
