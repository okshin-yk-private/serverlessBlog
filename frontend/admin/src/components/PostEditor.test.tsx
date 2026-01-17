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
  publishStatus: 'draft' | 'published';
}

// テスト用のカテゴリデータ
const mockCategories: CategoryOption[] = [
  { slug: 'tech', name: 'テクノロジー', sortOrder: 1 },
  { slug: 'life', name: 'ライフスタイル', sortOrder: 2 },
  { slug: 'business', name: 'ビジネス', sortOrder: 3 },
  { slug: 'other', name: 'その他', sortOrder: 4 },
];

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
    expect(screen.getByLabelText(/本文/i)).toBeInTheDocument();
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

  it('初期値が正しく設定される', () => {
    const initialData: PostData = {
      title: '既存記事タイトル',
      contentMarkdown: '# 既存記事本文',
      category: 'tech',
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
    const contentInput = screen.getByLabelText(/本文/i) as HTMLTextAreaElement;
    const categorySelect = screen.getByLabelText(
      /カテゴリ/i
    ) as HTMLSelectElement;
    const statusSelect = screen.getByLabelText(
      /公開状態/i
    ) as HTMLSelectElement;

    expect(titleInput.value).toBe('既存記事タイトル');
    expect(contentInput.value).toBe('# 既存記事本文');
    expect(categorySelect.value).toBe('tech');
    expect(statusSelect.value).toBe('published');
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
    await user.type(screen.getByLabelText(/本文/i), 'テスト本文');

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
    await user.type(
      screen.getByLabelText(/本文/i),
      '# テスト本文\n\nこれはテストです。'
    );
    await user.selectOptions(screen.getByLabelText(/カテゴリ/i), 'tech');
    await user.selectOptions(screen.getByLabelText(/公開状態/i), 'draft');

    await user.click(screen.getByRole('button', { name: /保存/i }));

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledTimes(1);
      expect(mockOnSave).toHaveBeenCalledWith({
        title: 'テストタイトル',
        contentMarkdown: '# テスト本文\n\nこれはテストです。',
        category: 'tech',
        publishStatus: 'draft',
      });
    });
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

  it('Markdownプレビューが表示される', () => {
    render(
      <PostEditor
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        categories={mockCategories}
      />
    );

    expect(screen.getByTestId('markdown-preview')).toBeInTheDocument();
  });

  it('入力した内容がMarkdownプレビューに反映される', async () => {
    const user = userEvent.setup();
    render(
      <PostEditor
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        categories={mockCategories}
      />
    );

    await user.type(screen.getByLabelText(/本文/i), '# テスト見出し');

    // プレビュー領域にMarkdownがレンダリングされることを確認
    await waitFor(() => {
      const preview = screen.getByTestId('markdown-preview');
      expect(preview).toBeInTheDocument();
      expect(preview.textContent).toContain('テスト見出し');
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
    await user.type(screen.getByLabelText(/本文/i), 'テスト本文');
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

    it('カーソル位置にテキストを挿入する', async () => {
      const user = userEvent.setup();
      const ref = createRef<PostEditorHandle>();
      render(
        <PostEditor
          ref={ref}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          categories={mockCategories}
        />
      );

      const textarea = screen.getByTestId(
        'post-content-editor'
      ) as HTMLTextAreaElement;
      await user.type(textarea, 'Hello World');

      // カーソルを「Hello 」の後に移動
      textarea.setSelectionRange(6, 6);

      // 画像Markdownを挿入
      act(() => {
        ref.current?.insertAtCursor('![image](https://example.com/img.png)');
      });

      expect(textarea.value).toBe(
        'Hello ![image](https://example.com/img.png)World'
      );
    });

    it('テキスト選択状態で挿入すると選択範囲を置換する', async () => {
      const user = userEvent.setup();
      const ref = createRef<PostEditorHandle>();
      render(
        <PostEditor
          ref={ref}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          categories={mockCategories}
        />
      );

      const textarea = screen.getByTestId(
        'post-content-editor'
      ) as HTMLTextAreaElement;
      await user.type(textarea, 'Hello World');

      // 「World」を選択
      textarea.setSelectionRange(6, 11);

      act(() => {
        ref.current?.insertAtCursor('![image](url)');
      });

      expect(textarea.value).toBe('Hello ![image](url)');
    });

    it('空のテキストエリアに挿入できる', () => {
      const ref = createRef<PostEditorHandle>();
      render(
        <PostEditor
          ref={ref}
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          categories={mockCategories}
        />
      );

      act(() => {
        ref.current?.insertAtCursor('![image](url)');
      });

      const textarea = screen.getByTestId(
        'post-content-editor'
      ) as HTMLTextAreaElement;
      expect(textarea.value).toBe('![image](url)');
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

      const textarea = screen.getByTestId('post-content-editor');

      // 画像ファイルを含むClipboardEventをシミュレート
      const file = new File(['dummy'], 'test.png', { type: 'image/png' });
      const clipboardData = {
        items: [
          {
            type: 'image/png',
            getAsFile: () => file,
          },
        ],
      };

      fireEvent.paste(textarea, { clipboardData });

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

      const textarea = screen.getByTestId('post-content-editor');

      const clipboardData = {
        items: [
          {
            type: 'text/plain',
            getAsFile: () => null,
          },
        ],
      };

      fireEvent.paste(textarea, { clipboardData });

      expect(mockOnImagePaste).not.toHaveBeenCalled();
    });

    it('onImagePasteが未定義でも画像ペーストでエラーにならない', () => {
      render(
        <PostEditor
          onSave={mockOnSave}
          onCancel={mockOnCancel}
          categories={mockCategories}
        />
      );

      const textarea = screen.getByTestId('post-content-editor');

      const file = new File(['dummy'], 'test.png', { type: 'image/png' });
      const clipboardData = {
        items: [
          {
            type: 'image/png',
            getAsFile: () => file,
          },
        ],
      };

      expect(() => {
        fireEvent.paste(textarea, { clipboardData });
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
});
