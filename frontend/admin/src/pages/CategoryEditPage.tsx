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
  slug?: string;
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

    // slug バリデーション (任意だが、入力されている場合は英数字・ハイフンのみ)
    if (formData.slug && !/^[a-z0-9-]*$/.test(formData.slug)) {
      errors.slug = 'スラッグは英数字とハイフンのみ使用できます';
    }

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

      const categoryData = {
        name: formData.name,
        slug: formData.slug,
        description: formData.description,
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
              カテゴリ名 <span className="text-red-500">*</span>
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
              onChange={handleInputChange}
              className={`admin-form-input ${formErrors.slug ? 'admin-form-input-error' : ''}`}
              placeholder="例: tech（空の場合は自動生成）"
              data-testid="slug-input"
            />
            {formErrors.slug && (
              <p className="admin-form-error" data-testid="slug-error">
                {formErrors.slug}
              </p>
            )}
            <p className="admin-form-hint">
              URLに使用される識別子です。英数字とハイフンのみ使用できます。
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
