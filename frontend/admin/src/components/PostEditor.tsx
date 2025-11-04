import React, { useState, type FormEvent } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { validatePostTitle, validatePostContent, validateCategory } from '../utils/validation';
import { Button } from './Button';

interface PostData {
  title: string;
  contentMarkdown: string;
  category: string;
  publishStatus: 'draft' | 'published';
}

interface PostEditorProps {
  onSave: (data: PostData) => Promise<void>;
  onCancel: () => void;
  initialData?: PostData;
}

const CATEGORIES = [
  { value: '', label: '選択してください' },
  { value: 'tech', label: 'テクノロジー' },
  { value: 'life', label: 'ライフスタイル' },
  { value: 'business', label: 'ビジネス' },
  { value: 'other', label: 'その他' },
];

const PUBLISH_STATUS = [
  { value: 'draft', label: '下書き' },
  { value: 'published', label: '公開' },
];

export const PostEditor: React.FC<PostEditorProps> = ({ onSave, onCancel, initialData }) => {
  const [title, setTitle] = useState(initialData?.title || '');
  const [contentMarkdown, setContentMarkdown] = useState(initialData?.contentMarkdown || '');
  const [category, setCategory] = useState(initialData?.category || '');
  const [publishStatus, setPublishStatus] = useState<'draft' | 'published'>(initialData?.publishStatus || 'draft');

  const [titleError, setTitleError] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    // バリデーション
    const titleValidation = validatePostTitle(title);
    const contentValidation = validatePostContent(contentMarkdown);
    const categoryValidation = validateCategory(category);

    setTitleError(titleValidation);
    setContentError(contentValidation);
    setCategoryError(categoryValidation);

    // エラーがある場合は送信しない
    if (titleValidation || contentValidation || categoryValidation) {
      return;
    }

    // 保存処理
    setIsSaving(true);
    try {
      await onSave({
        title,
        contentMarkdown,
        category,
        publishStatus,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左側: 入力フォーム */}
        <div className="space-y-4">
          {/* タイトル */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
              タイトル
            </label>
            <input
              id="title"
              data-testid="article-title-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isSaving}
            />
            {titleError && (
              <p className="mt-1 text-sm text-red-600" data-testid="validation-error">{titleError}</p>
            )}
          </div>

          {/* 本文 */}
          <div>
            <label htmlFor="content" className="block text-sm font-medium text-gray-700 mb-1">
              本文（Markdown）
            </label>
            <textarea
              id="content"
              data-testid="article-content-editor"
              value={contentMarkdown}
              onChange={(e) => setContentMarkdown(e.target.value)}
              rows={15}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              disabled={isSaving}
            />
            {contentError && (
              <p className="mt-1 text-sm text-red-600" data-testid="validation-error">{contentError}</p>
            )}
          </div>

          {/* カテゴリ */}
          <div>
            <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
              カテゴリ
            </label>
            <select
              id="category"
              data-testid="article-category-select"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isSaving}
            >
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
            {categoryError && (
              <p className="mt-1 text-sm text-red-600" data-testid="validation-error">{categoryError}</p>
            )}
          </div>

          {/* 公開状態 */}
          <div>
            <label htmlFor="publishStatus" className="block text-sm font-medium text-gray-700 mb-1">
              公開状態
            </label>
            <select
              id="publishStatus"
              value={publishStatus}
              onChange={(e) => setPublishStatus(e.target.value as 'draft' | 'published')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={isSaving}
            >
              {PUBLISH_STATUS.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>

          {/* ボタン */}
          <div className="flex gap-3">
            <Button
              type="submit"
              variant="primary"
              disabled={isSaving}
              data-testid={publishStatus === 'published' ? 'publish-article-button' : 'save-as-draft-button'}
            >
              {isSaving ? '保存中...' : '保存'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={onCancel}
              disabled={isSaving}
              data-testid="cancel-button"
            >
              キャンセル
            </Button>
          </div>
        </div>

        {/* 右側: Markdownプレビュー */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">プレビュー</h3>
          <div
            data-testid="markdown-preview"
            className="prose prose-sm max-w-none p-4 border border-gray-300 rounded-md bg-gray-50 min-h-[400px]"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {contentMarkdown || '*プレビューがここに表示されます*'}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </form>
  );
};
