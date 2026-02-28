import React, {
  useState,
  useRef,
  useImperativeHandle,
  forwardRef,
  type FormEvent,
  type ClipboardEvent,
} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  validatePostTitle,
  validatePostContent,
  validateCategory,
} from '../utils/validation';
import { Button } from './Button';

export interface PostData {
  title: string;
  contentMarkdown: string;
  category: string;
  tags: string[];
  publishStatus: 'draft' | 'published';
}

export interface PostEditorHandle {
  insertAtCursor: (text: string) => void;
  removeImageUrl: (imageUrl: string) => void;
}

/**
 * カテゴリオプション（動的カテゴリ用）
 */
export interface CategoryOption {
  slug: string;
  name: string;
  sortOrder: number;
}

interface PostEditorProps {
  onSave: (data: PostData) => Promise<void>;
  onCancel: () => void;
  initialData?: PostData;
  onImagePaste?: (file: File) => Promise<void>;
  isUploading?: boolean;
  /** 動的カテゴリ一覧 */
  categories: CategoryOption[];
  /** カテゴリローディング状態 */
  categoriesLoading?: boolean;
  /** カテゴリエラーメッセージ */
  categoriesError?: string | null;
  /** カテゴリ再取得関数 */
  onCategoriesRefetch?: () => void;
  /** マインドマップ挿入ボタンクリック時のコールバック */
  onMindmapInsertClick?: () => void;
}

const PUBLISH_STATUS = [
  { value: 'draft', label: '下書き' },
  { value: 'published', label: '公開' },
];

export const PostEditor = forwardRef<PostEditorHandle, PostEditorProps>(
  (
    {
      onSave,
      onCancel,
      initialData,
      onImagePaste,
      isUploading,
      categories,
      categoriesLoading = false,
      categoriesError = null,
      onCategoriesRefetch,
      onMindmapInsertClick,
    },
    ref
  ) => {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // カテゴリをsortOrder順でソート
    const sortedCategories = [...categories].sort(
      (a, b) => a.sortOrder - b.sortOrder
    );

    // 記事のカテゴリが一覧に存在するかチェック
    const isCategoryMissing =
      initialData?.category &&
      initialData.category !== '' &&
      !categoriesLoading &&
      categories.length > 0 &&
      !categories.some((cat) => cat.slug === initialData.category);

    const [title, setTitle] = useState(initialData?.title || '');
    const [contentMarkdown, setContentMarkdown] = useState(
      initialData?.contentMarkdown || ''
    );
    const [category, setCategory] = useState(initialData?.category || '');
    const [publishStatus, setPublishStatus] = useState<'draft' | 'published'>(
      initialData?.publishStatus || 'published'
    );
    const [tags, setTags] = useState<string[]>(initialData?.tags || []);
    const [tagInput, setTagInput] = useState('');

    const [titleError, setTitleError] = useState<string | null>(null);
    const [contentError, setContentError] = useState<string | null>(null);
    const [categoryError, setCategoryError] = useState<string | null>(null);

    const [isSaving, setIsSaving] = useState(false);

    // ref経由でinsertAtCursor, removeImageUrlメソッドを公開
    // contentMarkdownを依存配列に含めることで、最新の値を参照できるようにする
    useImperativeHandle(
      ref,
      () => ({
        insertAtCursor: (text: string) => {
          const textarea = textareaRef.current;
          if (!textarea) return;

          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          const before = contentMarkdown.substring(0, start);
          const after = contentMarkdown.substring(end);

          const newContent = before + text + after;
          setContentMarkdown(newContent);

          // カーソル位置を挿入テキストの末尾に移動
          requestAnimationFrame(() => {
            textarea.selectionStart = textarea.selectionEnd =
              start + text.length;
            textarea.focus();
          });
        },
        removeImageUrl: (imageUrl: string) => {
          // Markdown画像タグを削除: ![alt](url) または ![](url) 形式
          // URLをエスケープして正規表現で安全に使用
          const escapedUrl = imageUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const imagePattern = new RegExp(
            `!\\[[^\\]]*\\]\\(${escapedUrl}\\)\\n?`,
            'g'
          );
          const newContent = contentMarkdown.replace(imagePattern, '');
          setContentMarkdown(newContent);
        },
      }),
      [contentMarkdown]
    );

    // タグ追加ハンドラ
    const addTag = () => {
      const trimmedTag = tagInput.trim();
      if (trimmedTag && !tags.includes(trimmedTag)) {
        setTags([...tags, trimmedTag]);
        setTagInput('');
      }
    };

    // タグ入力キーダウンハンドラ
    const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addTag();
      }
    };

    // タグ削除ハンドラ
    const removeTag = (indexToRemove: number) => {
      setTags(tags.filter((_, index) => index !== indexToRemove));
    };

    // 画像ペーストハンドラ
    const handlePaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const items = e.clipboardData.items;

      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();

          const file = item.getAsFile();
          if (file && onImagePaste) {
            await onImagePaste(file);
          }
          return;
        }
      }
      // 画像以外はデフォルトのペースト動作を許可
    };

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
          tags,
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
              <label
                htmlFor="title"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                タイトル
              </label>
              <input
                id="title"
                data-testid="post-title-input"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isSaving}
              />
              {titleError && (
                <p
                  className="mt-1 text-sm text-red-600"
                  data-testid="validation-error"
                >
                  {titleError}
                </p>
              )}
            </div>

            {/* 本文 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="content"
                  className="block text-sm font-medium text-gray-700"
                >
                  本文（Markdown）
                </label>
                {onMindmapInsertClick && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={onMindmapInsertClick}
                    disabled={isSaving}
                    data-testid="mindmap-insert-button"
                    className="text-sm"
                  >
                    マインドマップ挿入
                  </Button>
                )}
              </div>
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  id="content"
                  data-testid="post-content-editor"
                  value={contentMarkdown}
                  onChange={(e) => setContentMarkdown(e.target.value)}
                  onPaste={handlePaste}
                  rows={15}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  disabled={isSaving}
                />
                {isUploading && (
                  <div className="absolute inset-0 bg-gray-100 bg-opacity-50 flex items-center justify-center rounded-md">
                    <span className="text-sm text-gray-600">
                      画像アップロード中...
                    </span>
                  </div>
                )}
              </div>
              {contentError && (
                <p
                  className="mt-1 text-sm text-red-600"
                  data-testid="validation-error"
                >
                  {contentError}
                </p>
              )}
            </div>

            {/* カテゴリ */}
            <div>
              <label
                htmlFor="category"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                カテゴリ
              </label>
              <select
                id="category"
                data-testid="post-category-select"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isSaving || categoriesLoading}
              >
                {categoriesLoading ? (
                  <option value="">読み込み中...</option>
                ) : sortedCategories.length === 0 ? (
                  <option value="">カテゴリがありません</option>
                ) : (
                  <>
                    <option value="">選択してください</option>
                    {sortedCategories.map((cat) => (
                      <option key={cat.slug} value={cat.slug}>
                        {cat.name}
                      </option>
                    ))}
                  </>
                )}
              </select>
              {categoriesError && (
                <div className="mt-1">
                  <p className="text-sm text-red-600">{categoriesError}</p>
                  {onCategoriesRefetch && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={onCategoriesRefetch}
                      className="mt-1 text-sm"
                    >
                      再試行
                    </Button>
                  )}
                </div>
              )}
              {isCategoryMissing && (
                <p className="mt-1 text-sm text-yellow-600">
                  選択されているカテゴリ「{initialData?.category}
                  」は現在利用できません。別のカテゴリを選択してください。
                </p>
              )}
              {categoryError && (
                <p
                  className="mt-1 text-sm text-red-600"
                  data-testid="validation-error"
                >
                  {categoryError}
                </p>
              )}
            </div>

            {/* タグ */}
            <div>
              <label
                htmlFor="tags"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                タグ
              </label>
              {/* タグ一覧 */}
              {tags.length > 0 && (
                <div
                  className="flex flex-wrap gap-2 mb-2"
                  data-testid="tags-list"
                >
                  {tags.map((tag, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium bg-blue-100 text-blue-800"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => removeTag(index)}
                        className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full text-blue-400 hover:bg-blue-200 hover:text-blue-600 focus:outline-none"
                        aria-label={`${tag}を削除`}
                        data-testid={`remove-tag-${index}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
              {/* タグ入力 */}
              <div className="flex gap-2">
                <input
                  id="tags"
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  placeholder="タグを入力してEnterで追加"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isSaving}
                  data-testid="tag-input"
                />
                <Button
                  type="button"
                  variant="secondary"
                  onClick={addTag}
                  disabled={isSaving || !tagInput.trim()}
                  data-testid="add-tag-button"
                >
                  追加
                </Button>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Enterキーまたはカンマで追加
              </p>
            </div>

            {/* 公開状態 */}
            <div>
              <label
                htmlFor="publishStatus"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                公開状態
              </label>
              <select
                id="publishStatus"
                value={publishStatus}
                onChange={(e) =>
                  setPublishStatus(e.target.value as 'draft' | 'published')
                }
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
                data-testid={
                  publishStatus === 'published'
                    ? 'publish-button'
                    : 'save-draft-button'
                }
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
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              プレビュー
            </h3>
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
  }
);
