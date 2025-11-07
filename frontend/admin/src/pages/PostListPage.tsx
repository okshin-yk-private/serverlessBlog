import { useState, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getPosts, deletePost, updatePost } from '../api/posts';
import type { Post } from '../api/posts';
import ConfirmDialog from '../components/ConfirmDialog';

type TabType = 'published' | 'draft';

const PostListPage = () => {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<TabType>('published');
  const [posts, setPosts] = useState<Post[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [nextToken, setNextToken] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // 削除確認ダイアログ用のstate
  const [showConfirmDialog, setShowConfirmDialog] = useState<boolean>(false);
  const [postToDelete, setPostToDelete] = useState<string | null>(null);

  const loadPosts = async (publishStatus: TabType, token?: string) => {
    try {
      setLoading(true);
      setError(null);
      const response = await getPosts({ publishStatus, nextToken: token, limit: 100 });
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
  }, [activeTab, location.key]); // location.keyを追加してナビゲーション時に再読み込み

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setNextToken(undefined);
    setSearchQuery(''); // タブ切り替え時に検索クエリをリセット
  };

  const handleNextPage = () => {
    if (nextToken) {
      loadPosts(activeTab, nextToken);
    }
  };

  const handleDeleteClick = (id: string) => {
    setPostToDelete(id);
    setShowConfirmDialog(true);
  };

  const handleDeleteConfirm = async () => {
    if (!postToDelete) return;

    try {
      setError(null);
      setSuccessMessage(null);
      await deletePost(postToDelete);
      setSuccessMessage('記事を削除しました');
      setShowConfirmDialog(false);
      setPostToDelete(null);
      await loadPosts(activeTab);
    } catch (err) {
      console.error('削除エラー:', err);
      setError('記事の削除に失敗しました');
      setShowConfirmDialog(false);
      setPostToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setShowConfirmDialog(false);
    setPostToDelete(null);
  };

  const handlePublishToggle = async (post: Post) => {
    try {
      setError(null);
      setSuccessMessage(null);
      const newStatus: 'draft' | 'published' = post.publishStatus === 'published' ? 'draft' : 'published';

      await updatePost(post.id, {
        title: post.title,
        contentMarkdown: post.contentMarkdown,
        category: post.category,
        publishStatus: newStatus,
      });

      setSuccessMessage(`記事を${newStatus === 'published' ? '公開' : '下書きに変更'}しました`);
      await loadPosts(activeTab);
    } catch (err) {
      console.error('ステータス更新エラー:', err);
      setError('記事のステータス更新に失敗しました');
    }
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toISOString().split('T')[0];
  };

  // 検索フィルター
  const filteredPosts = useMemo(() => {
    if (!searchQuery.trim()) {
      return posts;
    }
    return posts.filter(post =>
      post.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [posts, searchQuery]);

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
            to="/posts/new"
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

        {/* 検索バー */}
        <div className="mb-4">
          <input
            type="text"
            data-testid="admin-search-input"
            placeholder="タイトルで検索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

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
                公開済み
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
            {filteredPosts.length === 0 ? (
              <p className="text-gray-600 text-center py-8">
                {searchQuery ? '検索結果が見つかりません' : '記事がありません'}
              </p>
            ) : (
              <div className="space-y-4" data-testid="admin-article-list">
                {filteredPosts.map((post) => (
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
                            ステータス: {activeTab === 'published' ? '公開済み' : '下書き'}
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
                        {/* 公開/下書き切り替えボタン */}
                        {post.publishStatus === 'draft' ? (
                          <button
                            onClick={() => handlePublishToggle(post)}
                            data-testid="publish-article-button"
                            className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 text-sm"
                          >
                            公開
                          </button>
                        ) : (
                          <button
                            onClick={() => handlePublishToggle(post)}
                            data-testid="draft-article-button"
                            className="bg-yellow-600 text-white px-3 py-1 rounded hover:bg-yellow-700 text-sm"
                          >
                            下書きに戻す
                          </button>
                        )}
                        <Link
                          to={`/posts/edit/${post.id}`}
                          data-testid="edit-article-button"
                          className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 text-sm"
                        >
                          編集
                        </Link>
                        <button
                          onClick={() => handleDeleteClick(post.id)}
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

      {/* 削除確認ダイアログ */}
      <ConfirmDialog
        isOpen={showConfirmDialog}
        message="本当にこの記事を削除しますか？"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
    </div>
  );
};

export default PostListPage;
