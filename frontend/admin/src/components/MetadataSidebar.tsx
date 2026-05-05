// PR6: Metadata sidebar that pulls slug / excerpt / cover-image / tags /
// category / publishStatus out of the main editor flow so writers can focus
// on title + body and configure the rest in one panel.
//
// Slug auto-fills from the title (slugify) when the lock is open. Once the
// writer clicks the lock, the slug is theirs to edit; it doesn't track title
// changes anymore. Excerpt and cover-image have one-click "fill from body"
// helpers but never auto-overwrite existing input.

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from './Button';
import {
  slugify,
  excerptFromMarkdown,
  coverFromMarkdown,
} from '../utils/postDefaults';
import { validateSlug, validateExcerpt } from '../utils/validation';

export interface CategoryOption {
  slug: string;
  name: string;
  sortOrder: number;
}

export interface MetadataSidebarValue {
  slug: string;
  excerpt: string;
  coverImageUrl: string;
  category: string;
  tags: string[];
  publishStatus: 'draft' | 'published';
  slugLocked: boolean;
}

export interface MetadataSidebarProps {
  value: MetadataSidebarValue;
  onChange: (patch: Partial<MetadataSidebarValue>) => void;
  /** タイトル — slug 自動生成のソース (ロック OFF のとき) */
  title: string;
  /** 本文 — excerpt/cover の自動充填ボタンが参照 */
  contentMarkdown: string;
  categories: CategoryOption[];
  categoriesLoading?: boolean;
  categoriesError?: string | null;
  onCategoriesRefetch?: () => void;
  disabled?: boolean;
  /** initialData 由来でこのカテゴリが現在 categories に存在しないことを表示 */
  isCategoryMissing?: boolean;
  initialCategoryName?: string;
}

const PUBLISH_STATUS_LABEL: Record<'draft' | 'published', string> = {
  draft: '下書き',
  published: '公開',
};

const EXCERPT_MAX = 160;
const SLUG_MAX = 80;

export const MetadataSidebar = ({
  value,
  onChange,
  title,
  contentMarkdown,
  categories,
  categoriesLoading = false,
  categoriesError = null,
  onCategoriesRefetch,
  disabled = false,
  isCategoryMissing = false,
  initialCategoryName,
}: MetadataSidebarProps) => {
  const sortedCategories = [...categories].sort(
    (a, b) => a.sortOrder - b.sortOrder
  );

  // Auto-derive slug from title when unlocked. Skip the very first render so
  // we don't clobber `value.slug` provided via initialData.
  const firstSlugSyncRef = useRef(true);
  useEffect(() => {
    if (firstSlugSyncRef.current) {
      firstSlugSyncRef.current = false;
      return;
    }
    if (value.slugLocked) return;
    const next = title.trim() ? slugify(title) : '';
    if (next !== value.slug) {
      onChange({ slug: next });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, value.slugLocked]);

  const slugError = validateSlug(value.slug);
  const excerptError = validateExcerpt(value.excerpt);

  const [tagInput, setTagInput] = useState('');

  const addTag = () => {
    const t = tagInput.trim();
    if (!t || value.tags.includes(t)) return;
    onChange({ tags: [...value.tags, t] });
    setTagInput('');
  };

  const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    }
  };

  const removeTag = (idx: number) => {
    onChange({ tags: value.tags.filter((_, i) => i !== idx) });
  };

  const fillCoverFromBody = () => {
    const url = coverFromMarkdown(contentMarkdown);
    if (url) onChange({ coverImageUrl: url });
  };

  const fillExcerptFromBody = () => {
    const ex = excerptFromMarkdown(contentMarkdown);
    if (ex) onChange({ excerpt: ex });
  };

  return (
    <aside
      data-testid="metadata-sidebar"
      className="space-y-6 lg:sticky lg:top-4 lg:self-start"
    >
      {/* 公開状態 */}
      <section className="rounded-md border border-gray-200 p-4">
        <label
          htmlFor="publishStatus"
          className="mb-1 block text-sm font-semibold text-gray-700"
        >
          公開状態
        </label>
        <select
          id="publishStatus"
          data-testid="metadata-publish-status"
          value={value.publishStatus}
          onChange={(e) =>
            onChange({
              publishStatus: e.target.value as 'draft' | 'published',
            })
          }
          disabled={disabled}
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
        >
          {(['draft', 'published'] as const).map((s) => (
            <option key={s} value={s}>
              {PUBLISH_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </section>

      {/* Slug */}
      <section className="rounded-md border border-gray-200 p-4">
        <div className="mb-1 flex items-center justify-between">
          <label
            htmlFor="metadata-slug"
            className="text-sm font-semibold text-gray-700"
          >
            Slug
          </label>
          <button
            type="button"
            data-testid="metadata-slug-lock"
            aria-pressed={value.slugLocked}
            onClick={() => onChange({ slugLocked: !value.slugLocked })}
            className="text-xs text-blue-600 hover:underline"
            disabled={disabled}
          >
            {value.slugLocked ? '🔒 手動編集中' : '🔓 自動生成中'}
          </button>
        </div>
        <input
          id="metadata-slug"
          type="text"
          data-testid="metadata-slug-input"
          value={value.slug}
          onChange={(e) => onChange({ slug: e.target.value })}
          readOnly={!value.slugLocked}
          maxLength={SLUG_MAX}
          className={`w-full rounded border px-2 py-1 font-mono text-sm ${
            slugError ? 'border-red-400' : 'border-gray-300'
          } ${!value.slugLocked ? 'bg-gray-50 text-gray-600' : 'bg-white'}`}
          disabled={disabled}
        />
        <p className="mt-1 text-xs text-gray-500">
          {value.slug ? `/posts/${value.slug}` : '— (未設定)'}
        </p>
        {slugError && (
          <p
            className="mt-1 text-xs text-red-600"
            data-testid="metadata-slug-error"
          >
            {slugError}
          </p>
        )}
      </section>

      {/* Excerpt */}
      <section className="rounded-md border border-gray-200 p-4">
        <div className="mb-1 flex items-center justify-between">
          <label
            htmlFor="metadata-excerpt"
            className="text-sm font-semibold text-gray-700"
          >
            概要 (excerpt)
          </label>
          <button
            type="button"
            onClick={fillExcerptFromBody}
            className="text-xs text-blue-600 hover:underline"
            data-testid="metadata-excerpt-autofill"
            disabled={disabled}
          >
            本文から自動
          </button>
        </div>
        <textarea
          id="metadata-excerpt"
          data-testid="metadata-excerpt-input"
          value={value.excerpt}
          onChange={(e) => onChange({ excerpt: e.target.value })}
          rows={3}
          className={`w-full rounded border px-2 py-1 text-sm ${
            excerptError ? 'border-red-400' : 'border-gray-300'
          }`}
          disabled={disabled}
        />
        <p
          className={`mt-1 text-right text-xs ${
            value.excerpt.length > EXCERPT_MAX
              ? 'text-red-600'
              : 'text-gray-500'
          }`}
          data-testid="metadata-excerpt-counter"
        >
          {value.excerpt.length} / {EXCERPT_MAX}
        </p>
        {excerptError && (
          <p
            className="mt-1 text-xs text-red-600"
            data-testid="metadata-excerpt-error"
          >
            {excerptError}
          </p>
        )}
      </section>

      {/* Cover image */}
      <section className="rounded-md border border-gray-200 p-4">
        <div className="mb-1 flex items-center justify-between">
          <label
            htmlFor="metadata-cover"
            className="text-sm font-semibold text-gray-700"
          >
            カバー画像
          </label>
          <button
            type="button"
            onClick={fillCoverFromBody}
            className="text-xs text-blue-600 hover:underline"
            data-testid="metadata-cover-autofill"
            disabled={disabled}
          >
            本文先頭画像から
          </button>
        </div>
        <input
          id="metadata-cover"
          type="url"
          data-testid="metadata-cover-input"
          value={value.coverImageUrl}
          onChange={(e) => onChange({ coverImageUrl: e.target.value })}
          placeholder="https://..."
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
          disabled={disabled}
        />
        {value.coverImageUrl && (
          <div className="mt-2 overflow-hidden rounded border border-gray-200">
            <img
              src={value.coverImageUrl}
              alt="カバー画像プレビュー"
              data-testid="metadata-cover-preview"
              className="block h-24 w-full object-cover"
            />
          </div>
        )}
      </section>

      {/* Category */}
      <section className="rounded-md border border-gray-200 p-4">
        <label
          htmlFor="metadata-category"
          className="mb-1 block text-sm font-semibold text-gray-700"
        >
          カテゴリ
        </label>
        <select
          id="metadata-category"
          data-testid="post-category-select"
          value={value.category}
          onChange={(e) => onChange({ category: e.target.value })}
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
          disabled={disabled || categoriesLoading}
        >
          {categoriesLoading ? (
            <option value="">読み込み中...</option>
          ) : sortedCategories.length === 0 ? (
            <option value="">カテゴリがありません</option>
          ) : (
            <>
              <option value="">選択してください</option>
              {sortedCategories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </>
          )}
        </select>
        {categoriesError && (
          <div className="mt-1">
            <p className="text-xs text-red-600">{categoriesError}</p>
            {onCategoriesRefetch && (
              <Button
                type="button"
                variant="secondary"
                onClick={onCategoriesRefetch}
                className="mt-1 text-xs"
              >
                再試行
              </Button>
            )}
          </div>
        )}
        {isCategoryMissing && (
          <p className="mt-1 text-xs text-yellow-600">
            選択されているカテゴリ「{initialCategoryName}
            」は現在利用できません。別のカテゴリを選択してください。
          </p>
        )}
      </section>

      {/* Tags */}
      <section className="rounded-md border border-gray-200 p-4">
        <label
          htmlFor="tags"
          className="mb-1 block text-sm font-semibold text-gray-700"
        >
          タグ
        </label>
        {value.tags.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1" data-testid="tags-list">
            {value.tags.map((tag, index) => (
              <span
                key={index}
                className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(index)}
                  aria-label={`${tag}を削除`}
                  data-testid={`remove-tag-${index}`}
                  className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-blue-400 hover:bg-blue-200 hover:text-blue-600"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            id="tags"
            type="text"
            data-testid="tag-input"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            placeholder="Enterで追加"
            className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
            disabled={disabled}
          />
          <Button
            type="button"
            variant="secondary"
            onClick={addTag}
            disabled={disabled || !tagInput.trim()}
            data-testid="add-tag-button"
          >
            追加
          </Button>
        </div>
      </section>
    </aside>
  );
};
