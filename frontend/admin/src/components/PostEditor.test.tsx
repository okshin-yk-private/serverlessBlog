import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PostEditor } from './PostEditor';

interface PostData {
  title: string;
  contentMarkdown: string;
  category: string;
  publishStatus: 'draft' | 'published';
}

describe('PostEditor', () => {
  const mockOnSave = vi.fn();
  const mockOnCancel = vi.fn();

  beforeEach(() => {
    mockOnSave.mockClear();
    mockOnCancel.mockClear();
  });

  it('全ての入力フィールドが表示される', () => {
    render(<PostEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    expect(screen.getByLabelText(/タイトル/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/本文/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/カテゴリ/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/公開状態/i)).toBeInTheDocument();
  });

  it('保存ボタンとキャンセルボタンが表示される', () => {
    render(<PostEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    expect(screen.getByRole('button', { name: /保存/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /キャンセル/i })).toBeInTheDocument();
  });

  it('初期値が正しく設定される', () => {
    const initialData: PostData = {
      title: '既存記事タイトル',
      contentMarkdown: '# 既存記事本文',
      category: 'tech',
      publishStatus: 'published',
    };

    render(<PostEditor onSave={mockOnSave} onCancel={mockOnCancel} initialData={initialData} />);

    const titleInput = screen.getByLabelText(/タイトル/i) as HTMLInputElement;
    const contentInput = screen.getByLabelText(/本文/i) as HTMLTextAreaElement;
    const categorySelect = screen.getByLabelText(/カテゴリ/i) as HTMLSelectElement;
    const statusSelect = screen.getByLabelText(/公開状態/i) as HTMLSelectElement;

    expect(titleInput.value).toBe('既存記事タイトル');
    expect(contentInput.value).toBe('# 既存記事本文');
    expect(categorySelect.value).toBe('tech');
    expect(statusSelect.value).toBe('published');
  });

  it('タイトルが空の場合はバリデーションエラーが表示される', async () => {
    const user = userEvent.setup();
    render(<PostEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    await user.click(screen.getByRole('button', { name: /保存/i }));

    await waitFor(() => {
      expect(screen.getByText('タイトルは必須です')).toBeInTheDocument();
    });

    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('本文が空の場合はバリデーションエラーが表示される', async () => {
    const user = userEvent.setup();
    render(<PostEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    await user.type(screen.getByLabelText(/タイトル/i), 'テストタイトル');
    await user.click(screen.getByRole('button', { name: /保存/i }));

    await waitFor(() => {
      expect(screen.getByText('本文は必須です')).toBeInTheDocument();
    });

    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('カテゴリが選択されていない場合はバリデーションエラーが表示される', async () => {
    const user = userEvent.setup();
    render(<PostEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

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
    render(<PostEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    await user.type(screen.getByLabelText(/タイトル/i), 'テストタイトル');
    await user.type(screen.getByLabelText(/本文/i), '# テスト本文\n\nこれはテストです。');
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
    render(<PostEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    await user.click(screen.getByRole('button', { name: /キャンセル/i }));

    expect(mockOnCancel).toHaveBeenCalledTimes(1);
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('Markdownプレビューが表示される', () => {
    render(<PostEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    expect(screen.getByTestId('markdown-preview')).toBeInTheDocument();
  });

  it('入力した内容がMarkdownプレビューに反映される', async () => {
    const user = userEvent.setup();
    render(<PostEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

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
    const slowSave = vi.fn(() => new Promise<void>(resolve => setTimeout(resolve, 100)));
    render(<PostEditor onSave={slowSave} onCancel={mockOnCancel} />);

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
    render(<PostEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    const categorySelect = screen.getByLabelText(/カテゴリ/i) as HTMLSelectElement;
    const options = Array.from(categorySelect.options).map(opt => opt.value);

    expect(options).toContain('tech');
    expect(options).toContain('life');
    expect(options).toContain('business');
    expect(options).toContain('other');
  });

  it('公開状態の選択肢が正しく表示される', () => {
    render(<PostEditor onSave={mockOnSave} onCancel={mockOnCancel} />);

    const statusSelect = screen.getByLabelText(/公開状態/i) as HTMLSelectElement;
    const options = Array.from(statusSelect.options).map(opt => opt.value);

    expect(options).toContain('draft');
    expect(options).toContain('published');
  });
});
