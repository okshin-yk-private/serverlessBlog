import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  PostEditor,
  type PostData,
  type PostEditorHandle,
} from '../components/PostEditor';
import { ImageUploader } from '../components/ImageUploader';
import { getPost, updatePost, uploadImage } from '../api/posts';
import AdminLayout from '../components/AdminLayout';

const PostEditPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [initialData, setInitialData] = useState<PostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const editorRef = useRef<PostEditorHandle>(null);

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

  // ImageUploaderからの画像アップロード完了時
  const handleImageUpload = (imageUrl: string) => {
    const markdownImage = `![image](${imageUrl})`;
    editorRef.current?.insertAtCursor(markdownImage);
  };

  // ペーストによる画像アップロード
  const handleImagePaste = async (file: File) => {
    setIsUploading(true);
    try {
      const imageUrl = await uploadImage(file);
      const markdownImage = `![image](${imageUrl})`;
      editorRef.current?.insertAtCursor(markdownImage);
    } catch (err) {
      console.error('Image paste upload failed:', err);
      setError('画像のアップロードに失敗しました');
    } finally {
      setIsUploading(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout title="Edit Article">
        <div className="admin-loading">読み込み中...</div>
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
        <h2 className="admin-card-title">画像アップロード</h2>
        <ImageUploader
          onUploadComplete={handleImageUpload}
          uploadFunction={uploadImage}
        />
      </div>

      <div className="admin-card">
        {initialData && (
          <PostEditor
            ref={editorRef}
            onSave={handleSave}
            onCancel={handleCancel}
            initialData={initialData}
            onImagePaste={handleImagePaste}
            isUploading={isUploading}
          />
        )}
      </div>
    </AdminLayout>
  );
};

export default PostEditPage;
