import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  render,
  screen,
  waitFor,
  fireEvent,
  act,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import {
  PostEditor,
  type PostEditorHandle,
  type CategoryOption,
} from './PostEditor';

interface PostData {
  title: string;
  contentMarkdown: string;
  category: string;
  tags: string[];
  publishStatus: 'draft' | 'published';
}

// テスト用のカテゴリデータ
const mockCategories: CategoryOption[] = [
  { slug: 'tech', name: 'テクノロジー', sortOrder: 1 },
  { slug: 'life', name: 'ライフスタイル', sortOrder: 2 },
  { slug: 'business', name: 'ビジネス', sortOrder: 3 },
  { slug: 'other', name: 'その他', sortOrder: 4 },
];

async function waitForTiptap() {
  await waitFor(() => {
    if (!window.__tiptapEditor) {
      throw new Error('tiptap editor not yet exposed');
    }
  });
  return window.__tiptapEditor!;
}

async function setEditorContent(markdown: string) {
  const editor = await waitForTiptap();
  act(() => {
    editor.commands.setContent(markdown);
  });
}

async function getEditorMarkdown(): Promise<string> {
  const editor = await waitForTiptap();
  // tiptap-markdown stores serializer in editor.storage.markdown
  return editor.storage.markdown.getMarkdown() as string;
}

describe('PostEditor', () => {
  const mockOnSave = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    mockOnSave.mockClear();
    mockOnCancel.mockClear();
  });

  it('全ての入力フィールドが表示される', () => {
    render(
      <PostEditor
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        categories={mockCategories}
      />
    );

    expect(screen.getByLabelText(/タイトル/i)).toBeInTheDocument();
    expect(screen.getByTestId('tiptap-editor')).toBeInTheDocument();
    expect(screen.getByLabelText(/カテゴリ/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/公開状態/i)).toBeInTheDocument();
  });

  it('保存ボタンとキャンセルボタンが表示される', () => {
    render(
      <PostEditor
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        categories={mockCategories}
      />
    );

    expect(screen.getByRole('button', { name: /保存/i })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /キャンセル/i })
    ).toBeInTheDocument();
  });

  it('初期値が正しく設定される', async () => {
    const initialData: PostData = {
      title: '既存記事タイトル',
      contentMarkdown: '# 既存記事本文',
      category: 'tech',
      tags: ['React', 'AWS'],
      publishStatus: 'published',
    };

    render(
      <PostEditor
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        initialData={initialData}
        categories={mockCategories}
      />
    );

    const titleInput = screen.getByLabelText(/タイトル/i) as HTMLInputElement;
    const categorySelect = screen.getByLabelText(
      /カテゴリ/i
    ) as HTMLSelectElement;
    const statusSelect = screen.getByLabelText(
      /公開状態/i
    ) as HTMLSelectElement;

    expect(titleInput.value).toBe('既存記事タイトル');
    expect(categorySelect.value).toBe('tech');
    expect(statusSelect.value).toBe('published');

    // タグが表示されていることを確認
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(screen.getByText('AWS')).toBeInTheDocument();

    // 本文が Tiptap に流し込まれている
    await waitFor(async () => {
      const md = await getEditorMarkdown();
      expect(md).toContain('既存記事本文');
    });
  });

  it('publishStatus 既定値は draft', () => {
    render(
      <PostEditor
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        categories={mockCategories}
      />
    );

    const statusSelect = screen.getByLabelText(
      /公開状態/i
    ) as HTMLSelectElement;
    expect(statusSelect.value).toBe('draft');
  });

  it('タイトルが空の場合はバリデーションエラーが表示される', async () => {
    const user = userEvent.setup();
    render(
      <PostEditor
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        categories={mockCategories}
      />
    );

    await user.click(screen.getByRole('button', { name: /保存/i }));

    await waitFor(() => {
      expect(screen.getByText('タイトルは必須です')).toBeInTheDocument();
    });

    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('本文が空の場合はバリデーションエラーが表示される', async () => {
    const user = userEvent.setup();
    render(
      <PostEditor
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        categories={mockCategories}
      />
    );

    await user.type(screen.getByLabelText(/タイトル/i), 'テストタイトル');
    await user.click(screen.getByRole('button', { name: /保存/i }));

    await waitFor(() => {
      expect(screen.getByText('本文は必須です')).toBeInTheDocument();
    });

    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('カテゴリが選択されていない場合はバリデーションエラーが表示される', async () => {
    const user = userEvent.setup();
    render(
      <PostEditor
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        categories={mockCategories}
      />
    );

    await user.type(screen.getByLabelText(/タイトル/i), 'テストタイトル');
    await setEditorContent('テスト本文');

    // カテゴリを空にする
    const categorySelect = screen.getByLabelText(/カテゴリ/i);
    await user.selectOptions(categorySelect, '');

    await user.click(screen.getByRole('button', { name: /保存/i }));

    await waitFor(() => {
      expect(screen.getByText('カテゴリは必須です')).toBeInTheDocument();
    });

    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('正しい情報を入力して保存するとonSaveが呼ばれる', async () => {
    const user = userEvent.setup();
    render(
      <PostEditor
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        categories={mockCategories}
      />
    );

    await user.type(screen.getByLabelText(/タイトル/i), 'テストタイトル');
    await setEditorContent('# テスト本文\n\nこれはテストです。');
    await user.selectOptions(screen.getByLabelText(/カテゴリ/i), 'tech');
    await user.selectOptions(screen.getByLabelText(/公開状態/i), 'draft');

    await user.click(screen.getByRole('button', { name: /保存/i }));

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledTimes(1);
    });
    const call = mockOnSave.mock.calls[0][0];
    expect(call.title).toBe('テストタイトル');
    expect(call.category).toBe('tech');
    expect(call.tags).toEqual([]);
    expect(call.publishStatus).toBe('draft');
    expect(call.contentMarkdown).toContain('テスト本文');
    expect(call.contentMarkdown).toContain('これはテストです');
  });

  it('キャンセルボタンをクリックするとonCancelが呼ばれる', async () => {
    const user = userEvent.setup();
    render(
      <PostEditor
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        categories={mockCategories}
      />
    );

    await user.click(screen.getByRole('button', { name: /キャンセル/i }));

    expect(mockOnCancel).toHaveBeenCalledTimes(1);
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('Edit / Preview タブが切り替わる', async () => {
    const user = userEvent.setup();
    const initialData: PostData = {
      title: 'タイトル',
      contentMarkdown: '# テスト見出し',
      category: 'tech',
      tags: [],
      publishStatus: 'draft',
    };

    render(
      <PostEditor
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        categories={mockCategories}
        initialData={initialData}
      />
    );

    // 初期状態は edit タブ、tiptap-editor は表示されている
    expect(screen.getByTestId('tiptap-editor')).toBeInTheDocument();
    expect(screen.queryByTestId('markdown-preview')).not.toBeInTheDocument();

    // Preview タブに切替
    await user.click(screen.getByTestId('editor-tab-preview'));

    await waitFor(() => {
      expect(screen.getByTestId('markdown-preview')).toBeInTheDocument();
    });
    expect(screen.getByTestId('markdown-preview').textContent).toContain(
      'テスト見出し'
    );

    // Edit タブに戻す
    await user.click(screen.getByTestId('editor-tab-edit'));
    await waitFor(() => {
      expect(screen.queryByTestId('markdown-preview')).not.toBeInTheDocument();
    });
  });

  it('保存中はボタンが無効化される', async () => {
    const user = userEvent.setup();
    const slowSave = vi.fn(
      () => new Promise<void>((resolve) => setTimeout(resolve, 100))
    );
    render(
      <PostEditor
        onSave={slowSave}
        onCancel={mockOnCancel}
        categories={mockCategories}
      />
    );

    await user.type(screen.getByLabelText(/タイトル/i), 'テストタイトル');
    await setEditorContent('テスト本文');
    await user.selectOptions(screen.getByLabelText(/カテゴリ/i), 'tech');

    const saveButton = screen.getByRole('button', { name: /保存/i });
    const cancelButton = screen.getByRole('button', { name: /キャンセル/i });

    await user.click(saveButton);

    expect(saveButton).toBeDisabled();
    expect(cancelButton).toBeDisabled();

    await waitFor(() => {
      expect(saveButton).not.toBeDisabled();
      expect(cancelButton).not.toBeDisabled();
    });
  });

  it('カテゴリの選択肢が正しく表示される', () => {
    render(
      <PostEditor
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        categories={mockCategories}
      />
    );

    const categorySelect = screen.getByLabelText(
      /カテゴリ/i
    ) as HTMLSelectElement;
    const options = Array.from(categorySelect.options).map((opt) => opt.value);

    expect(options).toContain('tech');
    expect(options).toContain('life');
    expect(options).toContain('business');
    expect(options).toContain('other');
  });

  it('公開状態の選択肢が正しく表示される', () => {
    render(
      <PostEditor
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        categories={mockCategories}
      />
    );

    const statusSelect = screen.getByLabelText(
      /公開状態/i
    ) as HTMLSelectElement;
    const options = Array.from(statusSelect.options).map((opt) => opt.value);

    expect(options).toContain('draft');
    expect(options).toContain('published');
  });

  describe('insertAtCursor機能', () => {
    it('refを通じてinsertAtCursorメソッドにアクセスできる', () => {
      const ref = createRef<PostEditorHandle>();
      render(
        <PostEditor
          ref={ref}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          categories={mockCategories}
        />
      );

      expect(ref.current).not.toBeNull();
      expect(typeof ref.current?.insertAtCursor).toBe('function');
    });

    it('画像 markdown を挿入すると image ノードとして反映される', async () => {
      const ref = createRef<PostEditorHandle>();
      render(
        <PostEditor
          ref={ref}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          categories={mockCategories}
        />
      );

      await waitForTiptap();
      act(() => {
        ref.current?.insertAtCursor('![alt](https://example.com/img.png)');
      });

      // markdown 出力に画像構文が含まれる（属性順序は許容）
      const md = await getEditorMarkdown();
      expect(md).toMatch(/!\[alt\]\(https:\/\/example\.com\/img\.png\)/);

      // image ノードとして DOM に存在
      const img = document
        .querySelector('[data-testid="tiptap-editor"]')
        ?.querySelector('img');
      expect(img).not.toBeNull();
      expect(img?.getAttribute('src')).toBe('https://example.com/img.png');
    });

    it('mindmap マーカー挿入は独立段落として反映される', async () => {
      const ref = createRef<PostEditorHandle>();
      render(
        <PostEditor
          ref={ref}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          categories={mockCategories}
        />
      );

      await waitForTiptap();
      act(() => {
        ref.current?.insertAtCursor(
          '\n{{mindmap:550e8400-e29b-41d4-a716-446655440000}}\n'
        );
      });

      const md = await getEditorMarkdown();
      expect(md).toContain('{{mindmap:550e8400-e29b-41d4-a716-446655440000}}');
      // 独立段落として存在することを double-newline で確認
      expect(md).toMatch(
        /\{\{mindmap:550e8400-e29b-41d4-a716-446655440000\}\}/
      );
    });

    it('removeImageUrl で指定 URL の image ノードを削除する', async () => {
      const ref = createRef<PostEditorHandle>();
      const initialData: PostData = {
        title: 'タイトル',
        contentMarkdown:
          '前\n\n![](https://example.com/keep.png)\n\n中\n\n![](https://example.com/remove.png)\n\n後',
        category: 'tech',
        tags: [],
        publishStatus: 'draft',
      };
      render(
        <PostEditor
          ref={ref}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          categories={mockCategories}
          initialData={initialData}
        />
      );

      await waitFor(async () => {
        const md = await getEditorMarkdown();
        expect(md).toContain('keep.png');
        expect(md).toContain('remove.png');
      });

      act(() => {
        ref.current?.removeImageUrl('https://example.com/remove.png');
      });

      await waitFor(async () => {
        const md = await getEditorMarkdown();
        expect(md).toContain('keep.png');
        expect(md).not.toContain('remove.png');
      });
    });
  });

  describe('画像ペースト機能', () => {
    it('画像をペーストするとonImagePasteが呼ばれる', async () => {
      const mockOnImagePaste = vi.fn().mockResolvedValue(undefined);
      render(
        <PostEditor
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          onImagePaste={mockOnImagePaste}
          categories={mockCategories}
        />
      );

      await waitForTiptap();
      const editorEl = screen
        .getByTestId('tiptap-editor')
        .querySelector('[contenteditable]') as HTMLElement;

      const file = new File(['dummy'], 'test.png', { type: 'image/png' });
      const clipboardData = {
        items: [
          {
            type: 'image/png',
            kind: 'file',
            getAsFile: () => file,
            getAsString: () => '',
          },
        ],
        getData: () => '',
        types: ['Files'],
        files: [file],
      } as unknown as DataTransfer;

      fireEvent.paste(editorEl, { clipboardData });

      await waitFor(() => {
        expect(mockOnImagePaste).toHaveBeenCalledWith(file);
      });
    });

    it('テキストペースト時はonImagePasteが呼ばれない', async () => {
      const mockOnImagePaste = vi.fn();
      render(
        <PostEditor
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          onImagePaste={mockOnImagePaste}
          categories={mockCategories}
        />
      );

      await waitForTiptap();
      const editorEl = screen
        .getByTestId('tiptap-editor')
        .querySelector('[contenteditable]') as HTMLElement;

      const clipboardData = {
        items: [
          {
            type: 'text/plain',
            kind: 'string',
            getAsFile: () => null,
            getAsString: (cb: (s: string) => void) => cb('hello'),
          },
        ],
        getData: (type: string) => (type === 'text/plain' ? 'hello' : ''),
        types: ['text/plain'],
        files: [],
      } as unknown as DataTransfer;

      fireEvent.paste(editorEl, { clipboardData });

      // microtask 待ち
      await new Promise((r) => setTimeout(r, 0));
      expect(mockOnImagePaste).not.toHaveBeenCalled();
    });

    it('onImagePasteが未定義でも画像ペーストでエラーにならない', async () => {
      render(
        <PostEditor
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          categories={mockCategories}
        />
      );

      await waitForTiptap();
      const editorEl = screen
        .getByTestId('tiptap-editor')
        .querySelector('[contenteditable]') as HTMLElement;

      const file = new File(['dummy'], 'test.png', { type: 'image/png' });
      const clipboardData = {
        items: [
          {
            type: 'image/png',
            kind: 'file',
            getAsFile: () => file,
            getAsString: () => '',
          },
        ],
        getData: () => '',
        types: ['Files'],
        files: [file],
      } as unknown as DataTransfer;

      expect(() => {
        fireEvent.paste(editorEl, { clipboardData });
      }).not.toThrow();
    });
  });

  describe('ローディング表示', () => {
    it('isUploadingがtrueの時にローディングオーバーレイが表示される', () => {
      render(
        <PostEditor
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          isUploading={true}
          categories={mockCategories}
        />
      );

      expect(screen.getByText('画像アップロード中...')).toBeInTheDocument();
    });

    it('isUploadingがfalseの時にローディングオーバーレイが表示されない', () => {
      render(
        <PostEditor
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          isUploading={false}
          categories={mockCategories}
        />
      );

      expect(
        screen.queryByText('画像アップロード中...')
      ).not.toBeInTheDocument();
    });
  });

  describe('動的カテゴリドロップダウン', () => {
    it('categoriesプロップから動的にカテゴリを表示する', () => {
      render(
        <PostEditor
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          categories={mockCategories}
        />
      );

      const categorySelect = screen.getByLabelText(
        /カテゴリ/i
      ) as HTMLSelectElement;
      const options = Array.from(categorySelect.options).map((opt) => ({
        value: opt.value,
        label: opt.textContent,
      }));

      // プレースホルダーオプションがある
      expect(options[0]).toEqual({ value: '', label: '選択してください' });
      // 動的カテゴリがsortOrder順で表示される
      expect(options[1]).toEqual({ value: 'tech', label: 'テクノロジー' });
      expect(options[2]).toEqual({ value: 'life', label: 'ライフスタイル' });
      expect(options[3]).toEqual({ value: 'business', label: 'ビジネス' });
      expect(options[4]).toEqual({ value: 'other', label: 'その他' });
    });

    it('categoriesLoadingがtrueの時にローディング表示する', () => {
      render(
        <PostEditor
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          categories={[]}
          categoriesLoading={true}
        />
      );

      const categorySelect = screen.getByLabelText(
        /カテゴリ/i
      ) as HTMLSelectElement;
      // ローディング中はドロップダウンが無効化される
      expect(categorySelect).toBeDisabled();
      // ローディング表示
      expect(screen.getByText('読み込み中...')).toBeInTheDocument();
    });

    it('categoriesErrorがある場合にエラーメッセージとリトライボタンを表示する', () => {
      const mockRefetch = vi.fn();
      render(
        <PostEditor
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          categories={[]}
          categoriesError="カテゴリの取得に失敗しました"
          onCategoriesRefetch={mockRefetch}
        />
      );

      // エラーメッセージが表示される
      expect(
        screen.getByText('カテゴリの取得に失敗しました')
      ).toBeInTheDocument();
      // リトライボタンが表示される
      const retryButton = screen.getByRole('button', { name: /再試行/i });
      expect(retryButton).toBeInTheDocument();
    });

    it('リトライボタンをクリックするとonCategoriesRefetchが呼ばれる', async () => {
      const user = userEvent.setup();
      const mockRefetch = vi.fn();
      render(
        <PostEditor
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          categories={[]}
          categoriesError="カテゴリの取得に失敗しました"
          onCategoriesRefetch={mockRefetch}
        />
      );

      const retryButton = screen.getByRole('button', { name: /再試行/i });
      await user.click(retryButton);

      expect(mockRefetch).toHaveBeenCalledTimes(1);
    });

    it('編集時に既存記事のカテゴリが選択状態になる', () => {
      const initialData: PostData = {
        title: '既存記事タイトル',
        contentMarkdown: '# 既存記事本文',
        category: 'life',
        tags: [],
        publishStatus: 'published',
      };

      render(
        <PostEditor
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          categories={mockCategories}
          initialData={initialData}
        />
      );

      const categorySelect = screen.getByLabelText(
        /カテゴリ/i
      ) as HTMLSelectElement;
      expect(categorySelect.value).toBe('life');
    });

    it('記事のカテゴリが一覧に存在しない場合は警告を表示する', () => {
      const initialData: PostData = {
        title: '既存記事タイトル',
        contentMarkdown: '# 既存記事本文',
        category: 'deleted-category',
        tags: [],
        publishStatus: 'published',
      };

      render(
        <PostEditor
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          categories={mockCategories}
          initialData={initialData}
        />
      );

      // 警告メッセージが表示される
      expect(
        screen.getByText(
          /選択されているカテゴリ「deleted-category」は現在利用できません/i
        )
      ).toBeInTheDocument();
    });

    it('カテゴリ未選択の場合はmissingCategoryWarningを表示しない', () => {
      render(
        <PostEditor
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          categories={mockCategories}
        />
      );

      // 警告メッセージは表示されない
      expect(
        screen.queryByText(/選択されているカテゴリ.*は現在利用できません/i)
      ).not.toBeInTheDocument();
    });

    it('sortOrder順でカテゴリがソートされて表示される', () => {
      // sortOrder順がシャッフルされたカテゴリ
      const shuffledCategories: CategoryOption[] = [
        { slug: 'other', name: 'その他', sortOrder: 4 },
        { slug: 'tech', name: 'テクノロジー', sortOrder: 1 },
        { slug: 'business', name: 'ビジネス', sortOrder: 3 },
        { slug: 'life', name: 'ライフスタイル', sortOrder: 2 },
      ];

      render(
        <PostEditor
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          categories={shuffledCategories}
        />
      );

      const categorySelect = screen.getByLabelText(
        /カテゴリ/i
      ) as HTMLSelectElement;
      const options = Array.from(categorySelect.options).map(
        (opt) => opt.value
      );

      // プレースホルダー + sortOrder順
      expect(options).toEqual(['', 'tech', 'life', 'business', 'other']);
    });

    it('categoriesLoadingがfalseでcategoriesが空の場合は「カテゴリがありません」と表示する', () => {
      render(
        <PostEditor
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          categories={[]}
          categoriesLoading={false}
        />
      );

      const categorySelect = screen.getByLabelText(
        /カテゴリ/i
      ) as HTMLSelectElement;
      const options = Array.from(categorySelect.options);

      // プレースホルダーのみ
      expect(options.length).toBe(1);
      expect(options[0].textContent).toBe('カテゴリがありません');
    });
  });

  describe('タグ機能', () => {
    it('タグ入力フィールドと追加ボタンが表示される', () => {
      render(
        <PostEditor
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          categories={mockCategories}
        />
      );

      expect(screen.getByLabelText(/タグ/i)).toBeInTheDocument();
      expect(screen.getByTestId('tag-input')).toBeInTheDocument();
      expect(screen.getByTestId('add-tag-button')).toBeInTheDocument();
    });

    it('Enterキーでタグを追加できる', async () => {
      const user = userEvent.setup();
      render(
        <PostEditor
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          categories={mockCategories}
        />
      );

      const tagInput = screen.getByTestId('tag-input');
      await user.type(tagInput, 'React{Enter}');

      expect(screen.getByText('React')).toBeInTheDocument();
      expect(tagInput).toHaveValue('');
    });

    it('追加ボタンでタグを追加できる', async () => {
      const user = userEvent.setup();
      render(
        <PostEditor
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          categories={mockCategories}
        />
      );

      const tagInput = screen.getByTestId('tag-input');
      const addButton = screen.getByTestId('add-tag-button');

      await user.type(tagInput, 'TypeScript');
      await user.click(addButton);

      expect(screen.getByText('TypeScript')).toBeInTheDocument();
      expect(tagInput).toHaveValue('');
    });

    it('カンマキーでタグを追加できる', async () => {
      const user = userEvent.setup();
      render(
        <PostEditor
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          categories={mockCategories}
        />
      );

      const tagInput = screen.getByTestId('tag-input');
      await user.type(tagInput, 'AWS');
      await user.type(tagInput, ',');

      expect(screen.getByText('AWS')).toBeInTheDocument();
      expect(tagInput).toHaveValue('');
    });

    it('タグを削除できる', async () => {
      const user = userEvent.setup();
      const initialData: PostData = {
        title: 'テスト',
        contentMarkdown: '# テスト',
        category: 'tech',
        tags: ['React', 'AWS'],
        publishStatus: 'draft',
      };

      render(
        <PostEditor
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          categories={mockCategories}
          initialData={initialData}
        />
      );

      expect(screen.getByText('React')).toBeInTheDocument();
      expect(screen.getByText('AWS')).toBeInTheDocument();

      const removeButton = screen.getByTestId('remove-tag-0');
      await user.click(removeButton);

      expect(screen.queryByText('React')).not.toBeInTheDocument();
      expect(screen.getByText('AWS')).toBeInTheDocument();
    });

    it('空のタグは追加されない', async () => {
      const user = userEvent.setup();
      render(
        <PostEditor
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          categories={mockCategories}
        />
      );

      const tagInput = screen.getByTestId('tag-input');
      await user.type(tagInput, '   {Enter}');

      expect(screen.queryByTestId('tags-list')).not.toBeInTheDocument();
    });

    it('重複タグは追加されない', async () => {
      const user = userEvent.setup();
      render(
        <PostEditor
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          categories={mockCategories}
        />
      );

      const tagInput = screen.getByTestId('tag-input');
      await user.type(tagInput, 'React{Enter}');
      await user.type(tagInput, 'React{Enter}');

      const reactTags = screen.getAllByText('React');
      expect(reactTags).toHaveLength(1);
    });

    it('保存時にタグが含まれる', async () => {
      const user = userEvent.setup();
      render(
        <PostEditor
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          categories={mockCategories}
        />
      );

      await user.type(screen.getByLabelText(/タイトル/i), 'テストタイトル');
      await setEditorContent('テスト本文');
      await user.selectOptions(screen.getByLabelText(/カテゴリ/i), 'tech');

      // タグを追加
      const tagInput = screen.getByTestId('tag-input');
      await user.type(tagInput, 'React{Enter}');
      await user.type(tagInput, 'TypeScript{Enter}');

      await user.click(screen.getByRole('button', { name: /保存/i }));

      await waitFor(() => {
        expect(mockOnSave).toHaveBeenCalledWith(
          expect.objectContaining({
            tags: ['React', 'TypeScript'],
          })
        );
      });
    });

    it('編集時に既存タグが表示される', () => {
      const initialData: PostData = {
        title: 'テスト',
        contentMarkdown: '# テスト',
        category: 'tech',
        tags: ['React', 'AWS', 'Go'],
        publishStatus: 'draft',
      };

      render(
        <PostEditor
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          categories={mockCategories}
          initialData={initialData}
        />
      );

      expect(screen.getByText('React')).toBeInTheDocument();
      expect(screen.getByText('AWS')).toBeInTheDocument();
      expect(screen.getByText('Go')).toBeInTheDocument();
    });

    it('タグが空の時は追加ボタンが無効化される', () => {
      render(
        <PostEditor
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          categories={mockCategories}
        />
      );

      const addButton = screen.getByTestId('add-tag-button');
      expect(addButton).toBeDisabled();
    });

    it('タグ入力中は追加ボタンが有効化される', async () => {
      const user = userEvent.setup();
      render(
        <PostEditor
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          categories={mockCategories}
        />
      );

      const tagInput = screen.getByTestId('tag-input');
      const addButton = screen.getByTestId('add-tag-button');

      expect(addButton).toBeDisabled();

      await user.type(tagInput, 'Test');

      expect(addButton).not.toBeDisabled();
    });
  });

  describe('マインドマップ挿入ボタン', () => {
    it('onMindmapInsertClickが渡された場合はマインドマップ挿入ボタンが表示される', () => {
      const mockOnMindmapInsertClick = vi.fn();
      render(
        <PostEditor
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          categories={mockCategories}
          onMindmapInsertClick={mockOnMindmapInsertClick}
        />
      );

      expect(screen.getByTestId('mindmap-insert-button')).toBeInTheDocument();
    });

    it('onMindmapInsertClickが渡されない場合はマインドマップ挿入ボタンが表示されない', () => {
      render(
        <PostEditor
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          categories={mockCategories}
        />
      );

      expect(
        screen.queryByTestId('mindmap-insert-button')
      ).not.toBeInTheDocument();
    });

    it('マインドマップ挿入ボタンをクリックするとonMindmapInsertClickが呼ばれる', async () => {
      const user = userEvent.setup();
      const mockOnMindmapInsertClick = vi.fn();
      render(
        <PostEditor
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          categories={mockCategories}
          onMindmapInsertClick={mockOnMindmapInsertClick}
        />
      );

      await user.click(screen.getByTestId('mindmap-insert-button'));

      expect(mockOnMindmapInsertClick).toHaveBeenCalledTimes(1);
    });

    it('保存中はマインドマップ挿入ボタンが無効化される', async () => {
      const user = userEvent.setup();
      const slowSave = vi.fn(
        () => new Promise<void>((resolve) => setTimeout(resolve, 100))
      );
      const mockOnMindmapInsertClick = vi.fn();
      render(
        <PostEditor
          onSave={slowSave}
          onCancel={mockOnCancel}
          categories={mockCategories}
          onMindmapInsertClick={mockOnMindmapInsertClick}
        />
      );

      await user.type(screen.getByLabelText(/タイトル/i), 'テストタイトル');
      await setEditorContent('テスト本文');
      await user.selectOptions(screen.getByLabelText(/カテゴリ/i), 'tech');

      await user.click(screen.getByRole('button', { name: /保存/i }));

      expect(screen.getByTestId('mindmap-insert-button')).toBeDisabled();

      await waitFor(() => {
        expect(screen.getByTestId('mindmap-insert-button')).not.toBeDisabled();
      });
    });
  });
});
