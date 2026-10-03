import { Fragment, useEffect, useRef, useState } from 'react';
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
  createCategory,
  updateCategory,
  deleteCategory,
  updateCategorySortOrders,
  type Category,
  type APIError,
} from '../api/categories';
import AdminLayout from '../components/AdminLayout';
import SortableCategoryItem from '../components/SortableCategoryItem';
import CategoryEditor from '../components/CategoryEditor';
import './CategoryListPage.css';

const CategoryListPage = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editor, setEditor] = useState<Category | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const mutation = useRef(false);
  const container = useRef<HTMLDivElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    let active = true;
    fetchCategories()
      .then((data) => {
        if (active)
          setCategories([...data].sort((a, b) => a.sortOrder - b.sortOrder));
      })
      .catch(() => {
        if (active) setError('カテゴリの取得に失敗しました');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const openEditor = (value: Category | 'new') => {
    if (editor || mutation.current) return;
    setError(null);
    setSuccessMessage(null);
    setEditor(value);
  };
  const closeEditor = () => {
    const id = editor && editor !== 'new' ? editor.id : null;
    setEditor(null);
    setError(null);
    requestAnimationFrame(() => {
      const button = [
        ...(container.current?.querySelectorAll<HTMLButtonElement>(
          '[data-category-id]'
        ) ?? []),
      ].find((element) => element.dataset.categoryId === id);
      (button ?? addButton.current)?.focus({ preventScroll: true });
    });
  };
  const beginMutation = () => {
    if (mutation.current) return false;
    mutation.current = true;
    setBusy(true);
    setError(null);
    setSuccessMessage(null);
    return true;
  };
  const endMutation = () => {
    mutation.current = false;
    setBusy(false);
  };
  const save = async (data: { name: string; description: string }) => {
    if (!editor || !beginMutation()) return;
    try {
      const saved =
        editor === 'new'
          ? await createCategory(data)
          : await updateCategory(editor.id, data);
      setCategories((previous) =>
        [
          ...previous.filter((category) => category.id !== saved.id),
          saved,
        ].sort((a, b) => a.sortOrder - b.sortOrder)
      );
      closeEditor();
      setSuccessMessage('カテゴリを保存しました');
    } catch (err) {
      setError((err as APIError).message || 'カテゴリの保存に失敗しました');
    } finally {
      endMutation();
    }
  };
  const remove = async () => {
    if (!editor || editor === 'new' || !beginMutation()) return;
    try {
      await deleteCategory(editor.id);
      setCategories((previous) =>
        previous.filter((category) => category.id !== editor.id)
      );
      closeEditor();
      setSuccessMessage('カテゴリを削除しました');
    } catch (err) {
      const apiError = err as APIError;
      setError(
        apiError.statusCode === 409
          ? apiError.message
          : 'カテゴリの削除に失敗しました'
      );
    } finally {
      endMutation();
    }
  };
  const reorder = async (from: number, to: number) => {
    if (
      editor ||
      from < 0 ||
      to < 0 ||
      to >= categories.length ||
      from === to ||
      !beginMutation()
    )
      return;
    const previous = categories;
    const next = arrayMove(previous, from, to).map((category, index) => ({
      ...category,
      sortOrder: index + 1,
    }));
    setCategories(next);
    try {
      await updateCategorySortOrders({
        orders: next.map(({ id, sortOrder }) => ({ id, sortOrder })),
      });
      setSuccessMessage('並び順を更新しました');
    } catch (err) {
      setCategories(previous);
      setError((err as APIError).message || '並び順の更新に失敗しました');
    } finally {
      endMutation();
    }
  };
  const handleDragEnd = (event: DragEndEvent) => {
    if (!event.over) return;
    void reorder(
      categories.findIndex((category) => category.id === event.active.id),
      categories.findIndex((category) => category.id === event.over?.id)
    );
  };
  const editorPanel = editor && (
    <CategoryEditor
      key={editor === 'new' ? 'new' : editor.id}
      category={editor === 'new' ? null : editor}
      busy={busy}
      error={error}
      onSave={save}
      onDelete={remove}
      onCancel={closeEditor}
    />
  );

  return (
    <AdminLayout>
      <div className="category-page" ref={container}>
        <div className="category-heading">
          <div>
            <p>カテゴリの管理</p>
            <h1>
              Categories <span>{loading ? '' : categories.length}</span>
            </h1>
          </div>
          <button
            ref={addButton}
            type="button"
            className="admin-btn admin-btn-primary"
            disabled={loading || busy || !!editor}
            onClick={() => openEditor('new')}
            data-testid="new-category-button"
          >
            + カテゴリを追加
          </button>
        </div>
        {loading ? (
          <div className="admin-loading">読み込み中...</div>
        ) : (
          <>
            {error && !editor && (
              <p
                role="alert"
                className="admin-alert admin-alert-error"
                data-testid="error-message"
              >
                {error}
              </p>
            )}
            <div className="category-list-caption">
              <span>表示順</span>
              <span>ドラッグ / ↑ ↓ で変更・自動保存</span>
            </div>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={categories.map((category) => category.id)}
                strategy={verticalListSortingStrategy}
              >
                <div
                  data-testid="category-list"
                  className={`category-workspace${editor ? ' has-editor' : ''}`}
                  style={
                    {
                      '--category-rows': Math.max(categories.length, 1),
                      '--category-editor-row':
                        editor && editor !== 'new'
                          ? categories.findIndex(
                              (category) => category.id === editor.id
                            ) + 1
                          : 1,
                    } as React.CSSProperties
                  }
                >
                  <div className="category-list">
                    {editor === 'new' && editorPanel}
                    {categories.length === 0 && (
                      <p className="category-empty">カテゴリがありません</p>
                    )}
                    {categories.map((category, index) => (
                      <Fragment key={category.id}>
                        <SortableCategoryItem
                          category={category}
                          index={index}
                          total={categories.length}
                          selected={
                            !!editor &&
                            editor !== 'new' &&
                            editor.id === category.id
                          }
                          disabled={busy || !!editor}
                          onEdit={() => openEditor(category)}
                          onMove={(offset) =>
                            void reorder(index, index + offset)
                          }
                        />
                        {editor &&
                          editor !== 'new' &&
                          editor.id === category.id &&
                          editorPanel}
                      </Fragment>
                    ))}
                  </div>
                </div>
              </SortableContext>
            </DndContext>
            <p
              className="category-save-status"
              role="status"
              data-testid="success-message"
            >
              {busy ? '保存中…' : successMessage}
            </p>
          </>
        )}
      </div>
    </AdminLayout>
  );
};
export default CategoryListPage;
