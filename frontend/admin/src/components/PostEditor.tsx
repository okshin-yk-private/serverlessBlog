import {
  useCallback,
  useEffect,
  useState,
  useRef,
  useImperativeHandle,
  forwardRef,
  type FormEvent,
} from 'react';
import {
  validatePostTitle,
  validatePostContent,
  validateCategory,
  validateSlug,
  validateExcerpt,
} from '../utils/validation';
import { uploadImage as defaultUploadImage } from '../api/posts';
import { Button } from './Button';
import { TiptapEditor, type TiptapEditorHandle } from './editor';
import { useAutosave } from './editor/hooks/useAutosave';
import { MetadataSidebar, type MetadataSidebarValue } from './MetadataSidebar';

export interface PostData {
  title: string;
  contentMarkdown: string;
  category: string;
  tags: string[];
  publishStatus: 'draft' | 'published';
  // PR6: writer-experience metadata. Optional so older callers/initialData
  // shapes still type-check; PostEditor coerces to '' when absent.
  slug?: string;
  excerpt?: string;
  coverImageUrl?: string;
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
  /** 画像アップロード関数 (省略時は api/posts.uploadImage) */
  uploadFn?: (file: File) => Promise<string>;
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
  /**
   * 自動保存コールバック (省略時は autosave 機能無効)。
   * 1.5s デバウンス / window blur / visibility hidden で発火し、
   * 失敗時は throw する。新規作成時は親側で createPost + URL 置換を行う。
   */
  onAutosave?: (data: PostData) => Promise<void>;
}

const MINDMAP_MARKER_PATTERN = /^\{\{mindmap:[0-9a-zA-Z-]+\}\}$/;

export const PostEditor = forwardRef<PostEditorHandle, PostEditorProps>(
  (
    {
      onSave,
      onCancel,
      initialData,
      uploadFn = defaultUploadImage,
      categories,
      categoriesLoading = false,
      categoriesError = null,
      onCategoriesRefetch,
      onMindmapInsertClick,
      onAutosave,
    },
    ref
  ) => {
    const tiptapRef = useRef<TiptapEditorHandle>(null);

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
    const [editorMode, setEditorMode] = useState<'edit' | 'preview'>('edit');
    // PR8: Preview tab renders Tiptap's HTML output directly so the admin sees
    // exactly the markup that gets persisted. Previously this used
    // react-markdown which produced subtly different HTML than the
    // Goldmark-rendered server output.
    const [previewHtml, setPreviewHtml] = useState('');

    // PR6: metadata fields managed alongside title/body. The MetadataSidebar
    // is a controlled component; PostEditor owns the state.
    const [meta, setMeta] = useState<MetadataSidebarValue>(() => ({
      slug: initialData?.slug ?? '',
      excerpt: initialData?.excerpt ?? '',
      coverImageUrl: initialData?.coverImageUrl ?? '',
      category: initialData?.category ?? '',
      tags: initialData?.tags ?? [],
      publishStatus: initialData?.publishStatus ?? 'draft',
      // Lock slug if initialData provided one (writer already chose it).
      slugLocked: Boolean(initialData?.slug),
    }));

    const [titleError, setTitleError] = useState<string | null>(null);
    const [contentError, setContentError] = useState<string | null>(null);
    const [categoryError, setCategoryError] = useState<string | null>(null);
    const [metadataError, setMetadataError] = useState<string | null>(null);

    const [isSaving, setIsSaving] = useState(false);

    // 画像アップロードのエラー表示 (UploadImage 拡張からのコールバック)
    const [uploadError, setUploadError] = useState<{
      message: string;
      retry: () => void;
    } | null>(null);
    const uploadErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
      null
    );

    const handleUploadError = useCallback(
      (message: string, retry: () => void) => {
        setUploadError({ message, retry });
      },
      []
    );

    // 自動保存 (onAutosave が渡された時のみ有効)。
    // タイトル非空かつ本文非空の場合だけ保存対象にする (空 POST を防ぐ)。
    const autosaveData: PostData = {
      title,
      contentMarkdown,
      category: meta.category,
      tags: meta.tags,
      publishStatus: meta.publishStatus,
      slug: meta.slug || undefined,
      excerpt: meta.excerpt || undefined,
      coverImageUrl: meta.coverImageUrl || undefined,
    };
    const noopAutosave = useRef(async () => {}).current;
    const autosave = useAutosave<PostData>({
      data: autosaveData,
      save: onAutosave ?? noopAutosave,
      enabled: !!onAutosave,
      isReady: (d) =>
        d.title.trim().length > 0 && d.contentMarkdown.trim().length > 0,
    });

    // 未保存状態でブラウザ閉じ/リロードを警告 (beforeunload)
    useEffect(() => {
      if (!onAutosave) return;
      const handler = (e: BeforeUnloadEvent) => {
        if (!autosave.isDirty) return;
        e.preventDefault();
        // Modern browsers ignore the message but require returnValue to be set
        e.returnValue = '';
      };
      window.addEventListener('beforeunload', handler);
      return () => window.removeEventListener('beforeunload', handler);
    }, [onAutosave, autosave.isDirty]);

    // Refresh Preview HTML whenever the writer toggles to the preview tab or
    // edits markdown. We grab Tiptap's getHTML() to mirror the exact node tree
    // the editor sees; the empty case falls back to a placeholder string in
    // the JSX render path.
    useEffect(() => {
      if (editorMode !== 'preview') return;
      const editor = tiptapRef.current?.getEditor();
      setPreviewHtml(editor?.getHTML() ?? '');
    }, [editorMode, contentMarkdown]);

    useEffect(() => {
      if (!uploadError) return;
      uploadErrorTimerRef.current = setTimeout(() => {
        setUploadError(null);
      }, 8000);
      return () => {
        if (uploadErrorTimerRef.current) {
          clearTimeout(uploadErrorTimerRef.current);
          uploadErrorTimerRef.current = null;
        }
      };
    }, [uploadError]);

    // ref経由でinsertAtCursor, removeImageUrlメソッドを公開
    useImperativeHandle(
      ref,
      () => ({
        insertAtCursor: (text: string) => {
          const editor = tiptapRef.current?.getEditor();
          if (!editor) return;
          const trimmed = text.trim();
          // マインドマップマーカーは独立段落として挿入し、Goldmark の
          // <p>{{mindmap:UUID}}</p> 検出パターンと整合させる
          if (MINDMAP_MARKER_PATTERN.test(trimmed)) {
            editor
              .chain()
              .focus()
              .insertContent({
                type: 'paragraph',
                content: [{ type: 'text', text: trimmed }],
              })
              .run();
            return;
          }
          // それ以外は tiptap-markdown が override する insertContentAt 経由で
          // markdown としてパース（![](url) は image ノードに変換される）
          const { from, to } = editor.state.selection;
          editor.chain().focus().insertContentAt({ from, to }, text).run();
        },
        removeImageUrl: (imageUrl: string) => {
          const editor = tiptapRef.current?.getEditor();
          if (!editor) return;
          const positions: Array<{ from: number; to: number }> = [];
          editor.state.doc.descendants((node, pos) => {
            if (node.type.name === 'image' && node.attrs.src === imageUrl) {
              positions.push({ from: pos, to: pos + node.nodeSize });
            }
          });
          // 末尾から削除して位置をずらさない
          for (let i = positions.length - 1; i >= 0; i--) {
            const { from, to } = positions[i];
            editor.chain().focus().deleteRange({ from, to }).run();
          }
        },
      }),
      []
    );

    const handleSubmit = async (e: FormEvent) => {
      e.preventDefault();

      // バリデーション
      const titleValidation = validatePostTitle(title);
      const contentValidation = validatePostContent(contentMarkdown);
      const categoryValidation = validateCategory(meta.category);
      const slugValidation = validateSlug(meta.slug);
      const excerptValidation = validateExcerpt(meta.excerpt);

      setTitleError(titleValidation);
      setContentError(contentValidation);
      setCategoryError(categoryValidation);
      setMetadataError(slugValidation || excerptValidation);

      // エラーがある場合は送信しない
      if (
        titleValidation ||
        contentValidation ||
        categoryValidation ||
        slugValidation ||
        excerptValidation
      ) {
        return;
      }

      // 保存処理
      setIsSaving(true);
      try {
        await onSave({
          title,
          contentMarkdown,
          category: meta.category,
          tags: meta.tags,
          publishStatus: meta.publishStatus,
          slug: meta.slug || undefined,
          excerpt: meta.excerpt || undefined,
          coverImageUrl: meta.coverImageUrl || undefined,
        });
        // autosave hook の baseline を現在値に揃える
        // (これがないと explicit save 後も isDirty=true のままになる)
        if (onAutosave) {
          autosave.markClean();
        }
      } finally {
        setIsSaving(false);
      }
    };

    const handleCancelClick = () => {
      // autosave 有効かつ未保存変更がある場合のみ確認ダイアログを表示
      if (onAutosave && autosave.isDirty) {
        const confirmed = window.confirm(
          '未保存の変更があります。本当にキャンセルしますか？'
        );
        if (!confirmed) {
          return;
        }
      }
      onCancel();
    };

    return (
      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"
      >
        <div className="space-y-6">
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
                本文
              </label>
              <div className="flex items-center gap-2">
                {/* Edit / Preview タブ */}
                <div
                  role="tablist"
                  aria-label="本文表示モード"
                  className="inline-flex border border-gray-300 rounded-md overflow-hidden"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={editorMode === 'edit'}
                    data-testid="editor-tab-edit"
                    onClick={() => setEditorMode('edit')}
                    className={`px-3 py-1 text-sm ${
                      editorMode === 'edit'
                        ? 'bg-blue-500 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                    disabled={isSaving}
                  >
                    編集
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={editorMode === 'preview'}
                    data-testid="editor-tab-preview"
                    onClick={() => setEditorMode('preview')}
                    className={`px-3 py-1 text-sm ${
                      editorMode === 'preview'
                        ? 'bg-blue-500 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                    disabled={isSaving}
                  >
                    プレビュー
                  </button>
                </div>
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
            </div>
            {uploadError && (
              <div
                role="alert"
                data-testid="image-upload-error"
                className="mb-2 flex items-start justify-between gap-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                <span>{uploadError.message}</span>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    data-testid="image-upload-retry"
                    className="text-red-700 underline hover:text-red-900"
                    onClick={() => {
                      const retry = uploadError.retry;
                      setUploadError(null);
                      retry();
                    }}
                  >
                    再試行
                  </button>
                  <button
                    type="button"
                    aria-label="エラーを閉じる"
                    className="text-red-700 hover:text-red-900"
                    onClick={() => setUploadError(null)}
                  >
                    ×
                  </button>
                </div>
              </div>
            )}
            <div className="relative">
              <div hidden={editorMode !== 'edit'}>
                <TiptapEditor
                  ref={tiptapRef}
                  value={contentMarkdown}
                  onChange={setContentMarkdown}
                  uploadFn={uploadFn}
                  onUploadError={handleUploadError}
                  disabled={isSaving}
                />
              </div>
              {editorMode === 'preview' && (
                <div
                  data-testid="markdown-preview"
                  className="post-content max-w-none p-4 border border-gray-300 rounded-md bg-gray-50 min-h-[400px]"
                  dangerouslySetInnerHTML={{
                    __html:
                      previewHtml ||
                      '<p><em>プレビューがここに表示されます</em></p>',
                  }}
                />
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

          {categoryError && (
            <p
              className="mt-1 text-sm text-red-600"
              data-testid="validation-error"
            >
              {categoryError}
            </p>
          )}
          {metadataError && (
            <p
              className="mt-1 text-sm text-red-600"
              data-testid="validation-error"
            >
              {metadataError}
            </p>
          )}

          {/* ボタン + autosave ステータス */}
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              variant="primary"
              disabled={isSaving}
              data-testid={
                meta.publishStatus === 'published'
                  ? 'publish-button'
                  : 'save-draft-button'
              }
            >
              {isSaving ? '保存中...' : '保存'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleCancelClick}
              disabled={isSaving}
              data-testid="cancel-button"
            >
              キャンセル
            </Button>
            {onAutosave && (
              <span
                data-testid="autosave-status"
                data-autosave-status={autosave.status}
                className={`ml-auto text-sm ${
                  autosave.status === 'error'
                    ? 'text-red-600'
                    : autosave.status === 'saving'
                      ? 'text-blue-600'
                      : autosave.status === 'saved'
                        ? 'text-gray-500'
                        : 'text-gray-400'
                }`}
                aria-live="polite"
              >
                {autosave.savedAgoLabel}
              </span>
            )}
          </div>
        </div>
        <MetadataSidebar
          value={meta}
          onChange={(p) => setMeta((prev) => ({ ...prev, ...p }))}
          title={title}
          contentMarkdown={contentMarkdown}
          categories={categories}
          categoriesLoading={categoriesLoading}
          categoriesError={categoriesError}
          onCategoriesRefetch={onCategoriesRefetch}
          disabled={isSaving}
          isCategoryMissing={Boolean(isCategoryMissing)}
          initialCategoryName={initialData?.category}
        />
      </form>
    );
  }
);

PostEditor.displayName = 'PostEditor';
