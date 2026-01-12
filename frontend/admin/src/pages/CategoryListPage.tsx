import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  fetchCategories,
  deleteCategory,
  updateCategorySortOrders,
} from '../api/categories';
import type { Category, APIError } from '../api/categories';
import ConfirmDialog from '../components/ConfirmDialog';
import AdminLayout from '../components/AdminLayout';
import SortableCategoryItem from '../components/SortableCategoryItem';

const CategoryListPage = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // 削除確認ダイアログ用のstate
  const [showConfirmDialog, setShowConfirmDialog] = useState<boolean>(false);
  const [categoryToDelete, setCategoryToDelete] = useState<string | null>(null);

  // ドラッグ&ドロップのセンサー設定
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const loadCategories = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchCategories();
      // sortOrder順でソート
      const sorted = [...data].sort((a, b) => a.sortOrder - b.sortOrder);
      setCategories(sorted);
    } catch (err) {
      console.error('カテゴリ取得エラー:', err);
      setError('カテゴリの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const handleDeleteClick = (id: string) => {
    setCategoryToDelete(id);
    setShowConfirmDialog(true);
  };

  const handleDeleteConfirm = async () => {
    if (!categoryToDelete) return;

    try {
      setError(null);
      setSuccessMessage(null);
      await deleteCategory(categoryToDelete);
      setSuccessMessage('カテゴリを削除しました');
      setShowConfirmDialog(false);
      setCategoryToDelete(null);
      await loadCategories();
    } catch (err) {
      console.error('削除エラー:', err);
      // APIErrorかどうかをチェックしてエラーメッセージを取得
      const apiError = err as APIError;
      if (apiError.statusCode === 409) {
        setError(apiError.message);
      } else {
        setError('カテゴリの削除に失敗しました');
      }
      setShowConfirmDialog(false);
      setCategoryToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setShowConfirmDialog(false);
    setCategoryToDelete(null);
  };

  // ドラッグ&ドロップ完了時のハンドラー
  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;

      if (!over || active.id === over.id) {
        return;
      }

      // 楽観的UI更新のために現在の状態を保存
      const previousCategories = [...categories];

      // UIを即時更新（楽観的更新）
      const oldIndex = categories.findIndex((cat) => cat.id === active.id);
      const newIndex = categories.findIndex((cat) => cat.id === over.id);

      const newCategories = arrayMove(categories, oldIndex, newIndex);

      // 新しいsortOrder値を計算
      const ordersToUpdate = newCategories.map((cat, index) => ({
        id: cat.id,
        sortOrder: index + 1,
      }));

      // UIを即時更新（楽観的更新）
      const updatedCategories = newCategories.map((cat, index) => ({
        ...cat,
        sortOrder: index + 1,
      }));
      setCategories(updatedCategories);

      try {
        setError(null);
        // APIを呼び出してsortOrderを永続化
        await updateCategorySortOrders({ orders: ordersToUpdate });
        setSuccessMessage('並び順を更新しました');
      } catch (err) {
        console.error('sortOrder更新エラー:', err);
        // 失敗時はロールバック
        setCategories(previousCategories);
        const apiError = err as APIError;
        if (apiError.message) {
          setError(apiError.message);
        } else {
          setError('並び順の更新に失敗しました');
        }
      }
    },
    [categories]
  );

  if (loading) {
    return (
      <AdminLayout title="Categories">
        <div className="admin-loading">
          <p>読み込み中...</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title="Categories"
      subtitle="カテゴリの管理・編集"
      actions={
        <Link
          to="/categories/new"
          data-testid="new-category-button"
          className="admin-btn admin-btn-primary"
        >
          + カテゴリを追加
        </Link>
      }
    >
      {error && (
        <div
          className="admin-alert admin-alert-error"
          data-testid="error-message"
        >
          {error}
        </div>
      )}

      {successMessage && (
        <div
          className="admin-alert admin-alert-success"
          data-testid="success-message"
        >
          {successMessage}
        </div>
      )}

      {/* カテゴリリスト */}
      {categories.length === 0 ? (
        <div className="admin-card">
          <div className="admin-empty">
            <p className="admin-empty-title">カテゴリがありません</p>
            <p className="admin-empty-desc">
              「カテゴリを追加」ボタンから新しいカテゴリを作成してください。
            </p>
          </div>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={categories.map((cat) => cat.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="admin-list" data-testid="category-list">
              {categories.map((category) => (
                <SortableCategoryItem
                  key={category.id}
                  category={category}
                  onDeleteClick={handleDeleteClick}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* 削除確認ダイアログ */}
      <ConfirmDialog
        isOpen={showConfirmDialog}
        message="本当にこのカテゴリを削除しますか？"
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />
    </AdminLayout>
  );
};

export default CategoryListPage;
