import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PostEditor } from '../components/PostEditor';
import { ImageUploader } from '../components/ImageUploader';
import { createPost, uploadImage } from '../api/posts';

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
    alert(`画像がアップロードされました。Markdown形式でクリップボードにコピーされました:\n![image](${imageUrl})`);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">新規記事作成</h1>

        {error && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded" data-testid="error-message">
            {error}
          </div>
        )}

        <div className="bg-white shadow overflow-hidden sm:rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">画像アップロード</h2>
          <ImageUploader
            onUploadComplete={handleImageUpload}
            uploadFunction={uploadImage}
          />
        </div>

        <div className="bg-white shadow overflow-hidden sm:rounded-lg p-6">
          <PostEditor onSave={handleSave} onCancel={handleCancel} />
        </div>
      </div>
    </div>
  );
};

export default PostCreatePage;
