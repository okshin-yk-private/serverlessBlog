import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  PostEditor,
  type PostData,
  type PostEditorHandle,
} from '../components/PostEditor';
import MindmapPickerModal from '../components/MindmapPickerModal';
import { createPost, updatePost } from '../api/posts';
import AdminLayout from '../components/AdminLayout';
import { BuildStatusBadge } from '../components/BuildStatusBadge';
import { useCategories } from '../hooks/useCategories';

const PostCreatePage = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [isMindmapPickerOpen, setIsMindmapPickerOpen] = useState(false);
  // PR5b: When the new post is created with publishStatus='published', stay
  // on the page and surface CodeBuild progress via BuildStatusBadge.
  const [publishedPostId, setPublishedPostId] = useState<string | null>(null);
  const editorRef = useRef<PostEditorHandle>(null);
  // autosave で記事が初回作成された後の id。これ以降の保存は updatePost を使う。
  const [postId, setPostId] = useState<string | null>(null);

  // カテゴリを動的に取得
  const {
    categories,
    loading: categoriesLoading,
    error: categoriesError,
    refetch: refetchCategories,
  } = useCategories();

  const handleSave = async (data: PostData) => {
    try {
      setError(null);
      // PR5a の autosave が先に走って postId を確定済みのケースでは updatePost、
      // それ以外の (autosave がまだ走っていない) 初回保存では createPost。
      let savedId: string;
      if (postId) {
        await updatePost(postId, data);
        savedId = postId;
      } else {
        const created = await createPost(data);
        savedId = created.id;
        setPostId(created.id);
      }
      // PR5b: publish ならページに留まり BuildStatusBadge を表示する。
      // draft なら従来通り一覧へ遷移。
      if (data.publishStatus === 'published') {
        setPublishedPostId(savedId);
        return;
      }
      navigate('/posts');
    } catch (err) {
      console.error('記事作成エラー:', err);
      // PR6: surface server-side slug conflict so the writer knows to change it.
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        setError(
          err.response.data?.message ?? 'この slug は既に使われています'
        );
        return;
      }
      setError('記事の作成に失敗しました');
      // エラーを再スローしない（unhandled promiseエラーを防ぐ）
    }
  };

  // 自動保存ハンドラ。
  // - 初回 (postId 未確定): createPost → 返却 id を保持し URL を /posts/edit/{id} に
  //   置換 (history.replaceState のみ。navigate を使うとコンポーネント unmount で
  //   ローカル state を失う)。
  // - 2 回目以降: updatePost(id, data)。
  // 失敗時は throw → useAutosave が status='error' に遷移させる。
  const handleAutosave = useCallback(
    async (data: PostData) => {
      if (postId) {
        await updatePost(postId, data);
        return;
      }
      const created = await createPost(data);
      setPostId(created.id);
      const adminBase = import.meta.env.BASE_URL.replace(/\/$/, '');
      const newUrl = `${adminBase}/posts/edit/${created.id}`;
      window.history.replaceState(null, '', newUrl);
    },
    [postId]
  );

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

      <BuildStatusBadge
        postId={publishedPostId ?? undefined}
        enabled={publishedPostId !== null}
      />

      <div className="admin-card">
        <PostEditor
          ref={editorRef}
          onSave={handleSave}
          onCancel={handleCancel}
          onAutosave={handleAutosave}
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
