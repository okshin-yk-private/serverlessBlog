import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PostEditor } from '../components/PostEditor';
import { ImageUploader } from '../components/ImageUploader';
import { createPost, uploadImage } from '../api/posts';
import AdminLayout from '../components/AdminLayout';

const PostCreatePage = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (data: {
    title: string;
    contentMarkdown: string;
    category: string;
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

  const handleImageUpload = (imageUrl: string) => {
    // 画像URLをクリップボードにコピー（オプション）
    navigator.clipboard.writeText(`![image](${imageUrl})`);
    alert(
      `画像がアップロードされました。Markdown形式でクリップボードにコピーされました:\n![image](${imageUrl})`
    );
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
        />
      </div>

      <div className="admin-card">
        <PostEditor onSave={handleSave} onCancel={handleCancel} />
      </div>
    </AdminLayout>
  );
};

export default PostCreatePage;
