import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImageUploader } from './ImageUploader';

describe('ImageUploader', () => {
  const mockOnUploadComplete = vi.fn();

  beforeEach(() => {
    mockOnUploadComplete.mockReset();
  });

  it('ファイル選択ボタンが表示される', () => {
    render(<ImageUploader onUploadComplete={mockOnUploadComplete} />);

    expect(screen.getByText(/画像を選択/i)).toBeInTheDocument();
  });

  it('ファイルを選択するとプレビューが表示される', async () => {
    render(<ImageUploader onUploadComplete={mockOnUploadComplete} />);

    const file = new File(['dummy content'], 'test-image.png', {
      type: 'image/png',
    });
    const input = screen.getByLabelText(/画像を選択/i) as HTMLInputElement;

    Object.defineProperty(input, 'files', {
      value: [file],
      writable: false,
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    await waitFor(() => {
      expect(screen.getByAltText(/プレビュー/i)).toBeInTheDocument();
    });
  });

  it('画像以外のファイルを選択するとエラーが表示される', async () => {
    render(<ImageUploader onUploadComplete={mockOnUploadComplete} />);

    const file = new File(['dummy content'], 'test.txt', {
      type: 'text/plain',
    });
    const input = screen.getByLabelText(/画像を選択/i) as HTMLInputElement;

    // ファイルを選択（fireEvent使用）
    Object.defineProperty(input, 'files', {
      value: [file],
      writable: false,
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    await waitFor(() => {
      expect(
        screen.getByText(/画像ファイルを選択してください/i)
      ).toBeInTheDocument();
    });

    expect(mockOnUploadComplete).not.toHaveBeenCalled();
  });

  it('ファイルサイズが5MBを超える場合はエラーが表示される', async () => {
    render(<ImageUploader onUploadComplete={mockOnUploadComplete} />);

    const largeFile = new File(
      [new ArrayBuffer(6 * 1024 * 1024)],
      'large-image.png',
      { type: 'image/png' }
    );
    const input = screen.getByLabelText(/画像を選択/i) as HTMLInputElement;

    Object.defineProperty(input, 'files', {
      value: [largeFile],
      writable: false,
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    await waitFor(() => {
      expect(
        screen.getByText(/ファイルサイズは5MB以下にしてください/i)
      ).toBeInTheDocument();
    });

    expect(mockOnUploadComplete).not.toHaveBeenCalled();
  });

  it('アップロードボタンをクリックするとアップロードが開始される', async () => {
    const user = userEvent.setup();
    const mockUploadFn = vi.fn(() =>
      Promise.resolve('https://example.com/uploaded-image.png')
    );

    render(
      <ImageUploader
        onUploadComplete={mockOnUploadComplete}
        uploadFunction={mockUploadFn}
      />
    );

    const file = new File(['dummy content'], 'test-image.png', {
      type: 'image/png',
    });
    const input = screen.getByLabelText(/画像を選択/i) as HTMLInputElement;

    Object.defineProperty(input, 'files', {
      value: [file],
      writable: false,
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    const uploadButton = await screen.findByRole('button', {
      name: /アップロード/i,
    });
    await user.click(uploadButton);

    await waitFor(() => {
      expect(mockUploadFn).toHaveBeenCalledWith(file);
      expect(mockOnUploadComplete).toHaveBeenCalledWith(
        'https://example.com/uploaded-image.png'
      );
    });
  });

  it('アップロード中はプログレスバーが表示される', async () => {
    const user = userEvent.setup();
    const mockUploadFn = vi.fn<(file: File) => Promise<string>>(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve('https://example.com/uploaded-image.png'),
            100
          )
        )
    );

    render(
      <ImageUploader
        onUploadComplete={mockOnUploadComplete}
        uploadFunction={mockUploadFn}
      />
    );

    const file = new File(['dummy content'], 'test-image.png', {
      type: 'image/png',
    });
    const input = screen.getByLabelText(/画像を選択/i) as HTMLInputElement;

    Object.defineProperty(input, 'files', { value: [file], writable: false });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    const uploadButton = await screen.findByRole('button', {
      name: /アップロード/i,
    });
    await user.click(uploadButton);

    await waitFor(() => {
      expect(screen.getByRole('progressbar')).toBeInTheDocument();
    });

    // アップロードの完了を待つ
    await waitFor(() => {
      expect(mockOnUploadComplete).toHaveBeenCalled();
    });
  });

  it('アップロード失敗時はエラーメッセージが表示される', async () => {
    const user = userEvent.setup();
    const mockUploadFn = vi.fn().mockRejectedValue(new Error('Upload failed'));

    render(
      <ImageUploader
        onUploadComplete={mockOnUploadComplete}
        uploadFunction={mockUploadFn}
      />
    );

    const file = new File(['dummy content'], 'test-image.png', {
      type: 'image/png',
    });
    const input = screen.getByLabelText(/画像を選択/i) as HTMLInputElement;

    Object.defineProperty(input, 'files', { value: [file], writable: false });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    const uploadButton = await screen.findByRole('button', {
      name: /アップロード/i,
    });
    await user.click(uploadButton);

    await waitFor(() => {
      expect(
        screen.getByText(/アップロードに失敗しました/i)
      ).toBeInTheDocument();
    });

    expect(mockOnUploadComplete).not.toHaveBeenCalled();
  });

  it('アップロード成功後はプレビューがクリアされる', async () => {
    const user = userEvent.setup();
    const mockUploadFn = vi.fn(() =>
      Promise.resolve('https://example.com/uploaded-image.png')
    );

    render(
      <ImageUploader
        onUploadComplete={mockOnUploadComplete}
        uploadFunction={mockUploadFn}
      />
    );

    const file = new File(['dummy content'], 'test-image.png', {
      type: 'image/png',
    });
    const input = screen.getByLabelText(/画像を選択/i) as HTMLInputElement;

    Object.defineProperty(input, 'files', { value: [file], writable: false });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    const uploadButton = await screen.findByRole('button', {
      name: /アップロード/i,
    });
    await user.click(uploadButton);

    await waitFor(() => {
      expect(screen.queryByAltText(/プレビュー/i)).not.toBeInTheDocument();
    });
  });

  it('キャンセルボタンでプレビューがクリアされる', async () => {
    const user = userEvent.setup();
    render(<ImageUploader onUploadComplete={mockOnUploadComplete} />);

    const file = new File(['dummy content'], 'test-image.png', {
      type: 'image/png',
    });
    const input = screen.getByLabelText(/画像を選択/i) as HTMLInputElement;

    Object.defineProperty(input, 'files', { value: [file], writable: false });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    await waitFor(() => {
      expect(screen.getByAltText(/プレビュー/i)).toBeInTheDocument();
    });

    const cancelButton = screen.getByRole('button', { name: /キャンセル/i });
    await user.click(cancelButton);

    expect(screen.queryByAltText(/プレビュー/i)).not.toBeInTheDocument();
  });

  it('許可されている画像形式のみ受け入れる', () => {
    render(<ImageUploader onUploadComplete={mockOnUploadComplete} />);

    const input = screen.getByLabelText(/画像を選択/i) as HTMLInputElement;
    const accept = input.getAttribute('accept');

    expect(accept).toContain('image/');
  });

  it('ファイル選択をキャンセルしても何も起こらない', () => {
    render(<ImageUploader onUploadComplete={mockOnUploadComplete} />);

    const input = screen.getByLabelText(/画像を選択/i) as HTMLInputElement;

    // ファイルが選択されていない状態でchangeイベント発火（キャンセル時の動作）
    Object.defineProperty(input, 'files', {
      value: null,
      writable: false,
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    // エラーが表示されないことを確認
    expect(
      screen.queryByText(/画像ファイルを選択してください/i)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/ファイルサイズは5MB以下にしてください/i)
    ).not.toBeInTheDocument();
  });

  it('uploadFunctionが未提供の場合でもボタンはクリック可能だが何も起こらない', async () => {
    const user = userEvent.setup();
    render(<ImageUploader onUploadComplete={mockOnUploadComplete} />);

    const file = new File(['dummy content'], 'test-image.png', {
      type: 'image/png',
    });
    const input = screen.getByLabelText(/画像を選択/i) as HTMLInputElement;

    Object.defineProperty(input, 'files', {
      value: [file],
      writable: false,
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));

    await waitFor(() => {
      expect(screen.getByAltText(/プレビュー/i)).toBeInTheDocument();
    });

    const uploadButton = screen.getByRole('button', { name: /アップロード/i });
    expect(uploadButton).not.toBeDisabled();

    // クリックしても何も起こらない（handleUpload内で早期リターン）
    await user.click(uploadButton);

    expect(mockOnUploadComplete).not.toHaveBeenCalled();
  });

  it('selectedFileがnullの場合、handleUploadは何もしない', async () => {
    const mockUploadFn = vi.fn();
    render(
      <ImageUploader
        onUploadComplete={mockOnUploadComplete}
        uploadFunction={mockUploadFn}
      />
    );

    // ファイルを選択せずに直接アップロードボタンはレンダリングされない
    // この場合、内部的にhandleUploadが呼ばれても早期リターンする
    expect(
      screen.queryByRole('button', { name: /アップロード/i })
    ).not.toBeInTheDocument();
    expect(mockUploadFn).not.toHaveBeenCalled();
  });
});
