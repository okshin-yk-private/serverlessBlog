import { useEffect, useRef, useState } from 'react';
import type { Category } from '../api/categories';

interface Props {
  category: Category | null;
  busy: boolean;
  error: string | null;
  onSave: (data: { name: string; description: string }) => Promise<void>;
  onDelete: () => Promise<void>;
  onCancel: () => void;
}

export default function CategoryEditor({
  category,
  busy,
  error,
  onSave,
  onDelete,
  onCancel,
}: Props) {
  const [name, setName] = useState(category?.name ?? '');
  const [description, setDescription] = useState(category?.description ?? '');
  const [nameError, setNameError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const cancelDelete = useRef<HTMLButtonElement>(null);
  const deleteButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    nameInput.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    if (confirmDelete) cancelDelete.current?.focus();
  }, [confirmDelete]);
  useEffect(() => {
    const dirty =
      name !== (category?.name ?? '') ||
      description !== (category?.description ?? '');
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [category, name, description]);

  return (
    <section
      className="category-editor"
      aria-labelledby="category-editor-title"
    >
      <h2 id="category-editor-title">
        {category ? 'カテゴリを編集' : 'カテゴリを追加'}
      </h2>
      <form
        data-testid="category-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          if (!name.trim()) {
            setNameError('カテゴリ名は必須です');
            nameInput.current?.focus();
            return;
          }
          if (name.length > 100) {
            setNameError('カテゴリ名は100文字以内で入力してください');
            return;
          }
          void onSave({ name: name.trim(), description });
        }}
      >
        {error && (
          <p
            role="alert"
            className="admin-alert admin-alert-error"
            data-testid="error-message"
          >
            {error}
          </p>
        )}
        <label className="admin-form-label" htmlFor="category-name">
          カテゴリ名 <span className="admin-form-required">*</span>
        </label>
        <input
          ref={nameInput}
          id="category-name"
          className="admin-form-input"
          value={name}
          aria-invalid={!!nameError}
          aria-describedby={nameError ? 'category-name-error' : undefined}
          disabled={busy || confirmDelete}
          onChange={(event) => {
            setName(event.target.value);
            setNameError('');
          }}
          data-testid="name-input"
        />
        {nameError && (
          <p
            id="category-name-error"
            role="alert"
            className="admin-form-error"
            data-testid="name-error"
          >
            {nameError}
          </p>
        )}
        <p className="category-slug">
          スラッグ:{' '}
          {category
            ? `${category.slug}（変更不可）`
            : '保存時に名前から自動生成'}
        </p>
        <label className="admin-form-label" htmlFor="category-description">
          説明（任意）
        </label>
        <textarea
          id="category-description"
          className="admin-form-textarea"
          rows={3}
          value={description}
          disabled={busy || confirmDelete}
          onChange={(event) => setDescription(event.target.value)}
          data-testid="description-input"
        />
        <div className="category-editor-actions">
          <button
            type="submit"
            className="admin-btn admin-btn-primary"
            disabled={busy || confirmDelete}
            data-testid="submit-button"
          >
            {busy ? '処理中…' : category ? '保存' : '追加'}
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            disabled={busy}
            onClick={onCancel}
            data-testid="cancel-button"
          >
            キャンセル
          </button>
          {category && (
            <button
              ref={deleteButton}
              type="button"
              className="category-delete"
              disabled={busy || confirmDelete}
              onClick={() => setConfirmDelete(true)}
              data-testid="delete-category-button"
            >
              削除…
            </button>
          )}
        </div>
        {confirmDelete && (
          <div
            className="category-delete-confirm"
            role="group"
            aria-label="カテゴリ削除の確認"
            data-testid="confirm-dialog"
          >
            <p>
              「{category?.name}
              」を削除しますか？記事が紐づくカテゴリは削除できません。
            </p>
            <div className="category-editor-actions">
              <button
                type="button"
                className="admin-btn admin-btn-danger"
                disabled={busy}
                data-testid="confirm-yes"
                onClick={() => void onDelete()}
              >
                削除する
              </button>
              <button
                ref={cancelDelete}
                type="button"
                className="admin-btn admin-btn-secondary"
                disabled={busy}
                data-testid="confirm-no"
                onClick={() => {
                  setConfirmDelete(false);
                  deleteButton.current?.focus();
                }}
              >
                戻る
              </button>
            </div>
          </div>
        )}
      </form>
    </section>
  );
}
