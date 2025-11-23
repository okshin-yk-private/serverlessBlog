import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PostEditor, type PostData } from '../components/PostEditor';
import { ImageUploader } from '../components/ImageUploader';
import { getPost, updatePost, uploadImage } from '../api/posts';

const PostEditPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [initialData, setInitialData] = useState<PostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const handleImageUpload = (imageUrl: string) => {
    navigator.clipboard.writeText(`![image](${imageUrl})`);
    alert(
      `画像がアップロードされました。Markdown形式でクリップボードにコピーされました:\n![image](${imageUrl})`
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-600">読み込み中...</div>
      </div>
    );
  }

  if (error && !initialData) {
    return (
      <div className="min-h-screen bg-gray-100">
        <div className="max-w-4xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">記事編集</h1>

        {error && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        <div className="bg-white shadow overflow-hidden sm:rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            画像アップロード
          </h2>
          <ImageUploader
            onUploadComplete={handleImageUpload}
            uploadFunction={uploadImage}
          />
        </div>

        <div className="bg-white shadow overflow-hidden sm:rounded-lg p-6">
          {initialData && (
            <PostEditor
              onSave={handleSave}
              onCancel={handleCancel}
              initialData={initialData}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default PostEditPage;
