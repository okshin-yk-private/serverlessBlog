import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  fetchCategories,
  createCategory,
  updateCategory,
} from '../api/categories';
import type { Category, APIError } from '../api/categories';
import AdminLayout from '../components/AdminLayout';

interface FormData {
  name: string;
  slug: string;
  description: string;
}

interface FormErrors {
  name?: string;
}

const CategoryEditPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEditMode = !!id;

  const [formData, setFormData] = useState<FormData>({
    name: '',
    slug: '',
    description: '',
  });
  const [loading, setLoading] = useState<boolean>(isEditMode);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [notFound, setNotFound] = useState<boolean>(false);

  useEffect(() => {
    if (!isEditMode) {
      return;
    }

    const fetchCategory = async () => {
      try {
        setLoading(true);
        setError(null);
        const categories = await fetchCategories();
        const category = categories.find((cat: Category) => cat.id === id);

        if (!category) {
          setNotFound(true);
          return;
        }

        setFormData({
          name: category.name,
          slug: category.slug,
          description: category.description || '',
        });
      } catch (err) {
        console.error('カテゴリ取得エラー:', err);
        setError('カテゴリの取得に失敗しました');
      } finally {
        setLoading(false);
      }
    };

    fetchCategory();
  }, [id, isEditMode]);

  const validateForm = (): boolean => {
    const errors: FormErrors = {};

    // name バリデーション
    if (!formData.name.trim()) {
      errors.name = 'カテゴリ名は必須です';
    } else if (formData.name.length > 100) {
      errors.name = 'カテゴリ名は100文字以内で入力してください';
    }

    // slug はサーバー側で自動生成されるためバリデーション不要

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setSaving(true);
      setError(null);

      // slug はサーバー側で自動生成されるため送信しない
      const categoryData = {
        name: formData.name,
        description: formData.description || undefined,
      };

      if (isEditMode) {
        await updateCategory(id!, categoryData);
      } else {
        await createCategory(categoryData);
      }

      navigate('/categories');
    } catch (err) {
      console.error('保存エラー:', err);
      // APIErrorかどうかをチェック（statusCodeプロパティを持つかで判断）
      const apiError = err as APIError;
      if (apiError.statusCode && apiError.statusCode > 0) {
        // APIエラーの場合はメッセージをそのまま表示
        setError(apiError.message);
      } else {
        // 一般的なエラー（ネットワークエラー等）
        setError('カテゴリの保存に失敗しました');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    navigate('/categories');
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    // 入力時にそのフィールドのエラーをクリア
    if (formErrors[name as keyof FormErrors]) {
      setFormErrors((prev) => ({
        ...prev,
        [name]: undefined,
      }));
    }
  };

  if (loading) {
    return (
      <AdminLayout title={isEditMode ? 'カテゴリを編集' : 'カテゴリを作成'}>
        <div className="admin-loading">
          <p>読み込み中...</p>
        </div>
      </AdminLayout>
    );
  }

  if (notFound) {
    return (
      <AdminLayout title="カテゴリを編集">
        <div
          className="admin-alert admin-alert-error"
          data-testid="error-message"
        >
          カテゴリが見つかりませんでした
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
      title={isEditMode ? 'カテゴリを編集' : 'カテゴリを作成'}
      subtitle={
        isEditMode ? 'カテゴリの情報を編集します' : '新しいカテゴリを作成します'
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

      <div className="admin-card">
        <form onSubmit={handleSubmit} data-testid="category-form">
          <div className="admin-form-group">
            <label htmlFor="name" className="admin-form-label">
              カテゴリ名 <span className="admin-form-required">*</span>
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              className={`admin-form-input ${formErrors.name ? 'admin-form-input-error' : ''}`}
              placeholder="例: テクノロジー"
              data-testid="name-input"
            />
            {formErrors.name && (
              <p className="admin-form-error" data-testid="name-error">
                {formErrors.name}
              </p>
            )}
          </div>

          <div className="admin-form-group">
            <label htmlFor="slug" className="admin-form-label">
              スラッグ
            </label>
            <input
              type="text"
              id="slug"
              name="slug"
              value={formData.slug}
              disabled={true}
              className="admin-form-input admin-form-input-disabled"
              placeholder={isEditMode ? '' : '名前から自動生成されます'}
              data-testid="slug-input"
            />
            <p className="admin-form-hint">
              {isEditMode
                ? 'スラッグは変更できません'
                : 'カテゴリ名から自動的に生成されます（変更不可）'}
            </p>
          </div>

          <div className="admin-form-group">
            <label htmlFor="description" className="admin-form-label">
              説明
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              className="admin-form-textarea"
              placeholder="カテゴリの説明（任意）"
              rows={3}
              data-testid="description-input"
            />
          </div>

          <div className="admin-form-actions">
            <button
              type="submit"
              className="admin-btn admin-btn-primary"
              disabled={saving}
              data-testid="submit-button"
            >
              {saving ? '保存中...' : '保存'}
            </button>
            <button
              type="button"
              className="admin-btn admin-btn-secondary"
              onClick={handleCancel}
              disabled={saving}
              data-testid="cancel-button"
            >
              キャンセル
            </button>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
};

export default CategoryEditPage;
