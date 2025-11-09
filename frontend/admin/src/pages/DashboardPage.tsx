import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { getPosts } from '../api/posts';
import type { Post } from '../api/posts';

const DashboardPage = () => {
  const [publishedPosts, setPublishedPosts] = useState<Post[]>([]);
  const [draftPosts, setDraftPosts] = useState<Post[]>([]);
  const [publishedTotal, setPublishedTotal] = useState<number>(0);
  const [draftTotal, setDraftTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // 公開記事を取得
      const publishedResponse = await getPosts({
        publishStatus: 'published',
        limit: 5,
      });
      setPublishedPosts(publishedResponse.posts);
      setPublishedTotal(publishedResponse.total);

      // 下書き記事を取得
      const draftResponse = await getPosts({
        publishStatus: 'draft',
        limit: 5,
      });
      setDraftPosts(draftResponse.posts);
      setDraftTotal(draftResponse.total);
    } catch (err) {
      setError('エラーが発生しました');
      console.error('Failed to fetch dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-xl text-gray-700">読み込み中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="text-xl text-red-600 mb-4">{error}</div>
          <button
            onClick={fetchDashboardData}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            再試行
          </button>
        </div>
      </div>
    );
  }

  const allPosts = [...publishedPosts, ...draftPosts];
  const hasNoPosts = allPosts.length === 0;

  return (
    <div className="min-h-screen bg-gray-100" data-testid="dashboard">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">
          ダッシュボード
        </h1>

        {/* 記事統計 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white shadow overflow-hidden sm:rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-700 mb-2">
              公開記事数
            </h2>
            <p className="text-4xl font-bold text-blue-600">{publishedTotal}</p>
          </div>
          <div className="bg-white shadow overflow-hidden sm:rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-700 mb-2">
              下書き記事数
            </h2>
            <p className="text-4xl font-bold text-yellow-600">{draftTotal}</p>
          </div>
        </div>

        {/* ナビゲーションリンク */}
        <div className="bg-white shadow overflow-hidden sm:rounded-lg p-6 mb-8">
          <p className="text-gray-600 mb-4">ブログ管理画面へようこそ</p>
          <div className="space-x-4">
            <Link
              to="/posts"
              className="inline-block bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              記事一覧
            </Link>
            <Link
              to="/posts/new"
              className="inline-block bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
            >
              新規記事作成
            </Link>
          </div>
        </div>

        {/* 記事がない場合のメッセージ */}
        {hasNoPosts && (
          <div className="bg-white shadow overflow-hidden sm:rounded-lg p-6 text-center">
            <p className="text-gray-600">記事がありません</p>
          </div>
        )}

        {/* 公開記事一覧 */}
        {publishedPosts.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              最近の公開記事
            </h2>
            <div className="bg-white shadow overflow-hidden sm:rounded-lg">
              <ul className="divide-y divide-gray-200">
                {publishedPosts.map((post) => (
                  <li key={post.id} className="p-4 hover:bg-gray-50">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      {post.title}
                    </h3>
                    <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                      <span>カテゴリ: {post.category}</span>
                      <span>作成日: {formatDate(post.createdAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* 下書き記事一覧 */}
        {draftPosts.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              最近の下書き
            </h2>
            <div className="bg-white shadow overflow-hidden sm:rounded-lg">
              <ul className="divide-y divide-gray-200">
                {draftPosts.map((post) => (
                  <li key={post.id} className="p-4 hover:bg-gray-50">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      {post.title}
                    </h3>
                    <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                      <span>カテゴリ: {post.category}</span>
                      <span>作成日: {formatDate(post.createdAt)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardPage;
