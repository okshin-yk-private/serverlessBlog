import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getPosts, deletePost, type Post } from '../api/posts';

type TabType = 'published' | 'draft';

const PostListPage = () => {
  const [activeTab, setActiveTab] = useState<TabType>('published');
  const [posts, setPosts] = useState<Post[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [nextToken, setNextToken] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadPosts = async (publishStatus: TabType, token?: string) => {
    try {
      setLoading(true);
      setError(null);
      const response = await getPosts({ publishStatus, nextToken: token, limit: 10 });
      setPosts(response.posts);
      setTotal(response.total);
      setNextToken(response.nextToken);
    } catch (err) {
      console.error('記事取得エラー:', err);
      setError('記事の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPosts(activeTab);
  }, [activeTab]);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setNextToken(undefined);
  };

  const handleNextPage = () => {
    if (nextToken) {
      loadPosts(activeTab, nextToken);
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm('本当に削除しますか？');
    if (!confirmed) {
      return;
    }

    try {
      setError(null);
      setSuccessMessage(null);
      await deletePost(id);
      setSuccessMessage('記事を削除しました');
      await loadPosts(activeTab);
    } catch (err) {
      console.error('削除エラー:', err);
      setError('記事の削除に失敗しました');
    }
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toISOString().split('T')[0];
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-gray-600">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-gray-900">記事一覧</h1>
          <Link
            to="/posts/create"
            data-testid="new-article-button"
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            新規作成
          </Link>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded" data-testid="error-message">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-4 bg-green-100 border border-green-400 text-green-700 rounded" data-testid="success-message">
            {successMessage}
          </div>
        )}

        <div className="bg-white shadow overflow-hidden sm:rounded-lg">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px" data-testid="admin-filter-dropdown">
              <button
                className={`py-4 px-6 font-medium text-sm ${
                  activeTab === 'published'
                    ? 'border-b-2 border-blue-500 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
                onClick={() => handleTabChange('published')}
                data-testid="publish-filter-tab"
              >
                公開記事
              </button>
              <button
                className={`py-4 px-6 font-medium text-sm ${
                  activeTab === 'draft'
                    ? 'border-b-2 border-blue-500 text-blue-600'
                    : 'text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
                onClick={() => handleTabChange('draft')}
                data-testid="draft-filter-tab"
              >
                下書き
              </button>
            </nav>
          </div>

          <div className="p-6">
            {posts.length === 0 ? (
              <p className="text-gray-600 text-center py-8">記事がありません</p>
            ) : (
              <div className="space-y-4" data-testid="admin-article-list">
                {posts.map((post) => (
                  <div
                    key={post.id}
                    data-testid="admin-article-item"
                    className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="text-xl font-semibold text-gray-900 mb-2" data-testid="admin-article-title">
                          {post.title}
                        </h3>
                        <div className="flex items-center space-x-4 text-sm text-gray-500">
                          <span data-testid="admin-article-status">
                            ステータス: {activeTab === 'published' ? '公開' : '下書き'}
                          </span>
                          <span>
                            カテゴリ: {post.category || '未分類'}
                          </span>
                          <span>
                            作成日: {formatDate(post.createdAt)}
                          </span>
                        </div>
                      </div>
                      <div className="flex space-x-2 ml-4">
                        <Link
                          to={`/posts/edit/${post.id}`}
                          data-testid="edit-article-button"
                          className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 text-sm"
                        >
                          編集
                        </Link>
                        <button
                          onClick={() => handleDelete(post.id)}
                          data-testid="delete-article-button"
                          className="bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 text-sm"
                        >
                          削除
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {nextToken && (
              <div className="mt-6 flex justify-center">
                <button
                  onClick={handleNextPage}
                  className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
                >
                  次へ
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PostListPage;
