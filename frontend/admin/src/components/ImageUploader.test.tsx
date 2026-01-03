import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImageUploader } from './ImageUploader';

describe('ImageUploader', () => {
  const mockOnUploadComplete = vi.fn();
  const mockOnDelete = vi.fn();

  beforeEach(() => {
    mockOnUploadComplete.mockReset();
    mockOnDelete.mockReset();
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

  it('ファイルサイズが10MBを超える場合はエラーが表示される', async () => {
    render(<ImageUploader onUploadComplete={mockOnUploadComplete} />);

    const largeFile = new File(
      [new ArrayBuffer(11 * 1024 * 1024)],
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
        screen.getByText(/ファイルサイズは10MB以下にしてください/i)
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
      screen.queryByText(/ファイルサイズは10MB以下にしてください/i)
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

  describe('画像削除機能', () => {
    const uploadedImages = [
      'https://example.cloudfront.net/user-123/image1.jpg',
      'https://example.cloudfront.net/user-123/image2.png',
    ];

    it('uploadedImagesを渡すとアップロード済み画像が表示される', () => {
      render(
        <ImageUploader
          onUploadComplete={mockOnUploadComplete}
          uploadedImages={uploadedImages}
        />
      );

      expect(screen.getByTestId('uploaded-images-grid')).toBeInTheDocument();
      expect(screen.getAllByTestId('uploaded-image')).toHaveLength(2);
    });

    it('onDeleteを渡すと削除ボタンが表示される', () => {
      render(
        <ImageUploader
          onUploadComplete={mockOnUploadComplete}
          uploadedImages={uploadedImages}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getAllByTestId('delete-image-button')).toHaveLength(2);
    });

    it('onDeleteを渡さない場合、削除ボタンは表示されない', () => {
      render(
        <ImageUploader
          onUploadComplete={mockOnUploadComplete}
          uploadedImages={uploadedImages}
        />
      );

      expect(
        screen.queryByTestId('delete-image-button')
      ).not.toBeInTheDocument();
    });

    it('削除ボタンをクリックすると確認ダイアログが表示される', async () => {
      const user = userEvent.setup();
      render(
        <ImageUploader
          onUploadComplete={mockOnUploadComplete}
          uploadedImages={uploadedImages}
          onDelete={mockOnDelete}
        />
      );

      const deleteButtons = screen.getAllByTestId('delete-image-button');
      await user.click(deleteButtons[0]);

      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
      expect(screen.getByText(/この画像を削除しますか/i)).toBeInTheDocument();
    });

    it('確認ダイアログで「はい」をクリックするとonDeleteが呼ばれる', async () => {
      const user = userEvent.setup();
      mockOnDelete.mockResolvedValue(undefined);

      render(
        <ImageUploader
          onUploadComplete={mockOnUploadComplete}
          uploadedImages={uploadedImages}
          onDelete={mockOnDelete}
        />
      );

      const deleteButtons = screen.getAllByTestId('delete-image-button');
      await user.click(deleteButtons[0]);

      const confirmButton = screen.getByTestId('confirm-yes');
      await user.click(confirmButton);

      await waitFor(() => {
        expect(mockOnDelete).toHaveBeenCalledWith(uploadedImages[0]);
      });
    });

    it('確認ダイアログで「いいえ」をクリックするとダイアログが閉じる', async () => {
      const user = userEvent.setup();
      render(
        <ImageUploader
          onUploadComplete={mockOnUploadComplete}
          uploadedImages={uploadedImages}
          onDelete={mockOnDelete}
        />
      );

      const deleteButtons = screen.getAllByTestId('delete-image-button');
      await user.click(deleteButtons[0]);

      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();

      const cancelButton = screen.getByTestId('confirm-no');
      await user.click(cancelButton);

      expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
      expect(mockOnDelete).not.toHaveBeenCalled();
    });

    it('削除が失敗した場合、エラーメッセージが表示される', async () => {
      const user = userEvent.setup();
      mockOnDelete.mockRejectedValue(new Error('Delete failed'));

      render(
        <ImageUploader
          onUploadComplete={mockOnUploadComplete}
          uploadedImages={uploadedImages}
          onDelete={mockOnDelete}
        />
      );

      const deleteButtons = screen.getAllByTestId('delete-image-button');
      await user.click(deleteButtons[0]);

      const confirmButton = screen.getByTestId('confirm-yes');
      await user.click(confirmButton);

      await waitFor(() => {
        expect(screen.getByTestId('delete-error-message')).toBeInTheDocument();
        expect(
          screen.getByText(/画像の削除に失敗しました/i)
        ).toBeInTheDocument();
      });
    });

    it('削除成功後、確認ダイアログが閉じる', async () => {
      const user = userEvent.setup();
      mockOnDelete.mockResolvedValue(undefined);

      render(
        <ImageUploader
          onUploadComplete={mockOnUploadComplete}
          uploadedImages={uploadedImages}
          onDelete={mockOnDelete}
        />
      );

      const deleteButtons = screen.getAllByTestId('delete-image-button');
      await user.click(deleteButtons[0]);

      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();

      const confirmButton = screen.getByTestId('confirm-yes');
      await user.click(confirmButton);

      await waitFor(() => {
        expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
      });
    });

    it('uploadedImagesが空の場合、画像一覧は表示されない', () => {
      render(
        <ImageUploader
          onUploadComplete={mockOnUploadComplete}
          uploadedImages={[]}
          onDelete={mockOnDelete}
        />
      );

      expect(
        screen.queryByTestId('uploaded-images-grid')
      ).not.toBeInTheDocument();
    });

    it('削除ボタンクリック時に以前のエラーがクリアされる', async () => {
      const user = userEvent.setup();
      mockOnDelete
        .mockRejectedValueOnce(new Error('First delete failed'))
        .mockResolvedValueOnce(undefined);

      render(
        <ImageUploader
          onUploadComplete={mockOnUploadComplete}
          uploadedImages={uploadedImages}
          onDelete={mockOnDelete}
        />
      );

      // 最初の削除を失敗させる
      const deleteButtons = screen.getAllByTestId('delete-image-button');
      await user.click(deleteButtons[0]);
      await user.click(screen.getByTestId('confirm-yes'));

      await waitFor(() => {
        expect(screen.getByTestId('delete-error-message')).toBeInTheDocument();
      });

      // 2回目の削除を試みる（エラーがクリアされることを確認）
      await user.click(deleteButtons[1]);

      // エラーメッセージがクリアされていることを確認
      expect(
        screen.queryByTestId('delete-error-message')
      ).not.toBeInTheDocument();
    });
  });
});
