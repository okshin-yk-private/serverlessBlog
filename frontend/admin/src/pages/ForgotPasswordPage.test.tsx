import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ForgotPasswordPage from './ForgotPasswordPage';

const renderForgotPasswordPage = () => {
  return render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>
  );
};

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('レンダリング', () => {
    it('ロゴが表示される', () => {
      renderForgotPasswordPage();
      expect(screen.getByAltText('Polylex')).toBeInTheDocument();
    });

    it('Adminバッジが表示される', () => {
      renderForgotPasswordPage();
      expect(screen.getByText('Admin')).toBeInTheDocument();
    });

    it('パスワードリセットタイトルが表示される', () => {
      renderForgotPasswordPage();
      expect(
        screen.getByRole('heading', { name: 'パスワードリセット' })
      ).toBeInTheDocument();
    });

    it('説明テキストが表示される', () => {
      renderForgotPasswordPage();
      expect(
        screen.getByText(/登録されているメールアドレスを入力してください/)
      ).toBeInTheDocument();
    });

    it('メールアドレス入力フィールドが表示される', () => {
      renderForgotPasswordPage();
      expect(screen.getByLabelText('メールアドレス')).toBeInTheDocument();
    });

    it('送信ボタンが表示される', () => {
      renderForgotPasswordPage();
      expect(
        screen.getByRole('button', { name: 'リセットリンクを送信' })
      ).toBeInTheDocument();
    });

    it('ログインページに戻るボタンが表示される', () => {
      renderForgotPasswordPage();
      expect(
        screen.getByRole('button', { name: 'ログインページに戻る' })
      ).toBeInTheDocument();
    });
  });

  describe('バリデーション', () => {
    it('空のメールアドレスで送信するとエラーが表示される', async () => {
      const user = userEvent.setup();
      renderForgotPasswordPage();

      const submitButton = screen.getByRole('button', {
        name: 'リセットリンクを送信',
      });
      await user.click(submitButton);

      await waitFor(() => {
        expect(
          screen.getByText('メールアドレスは必須です')
        ).toBeInTheDocument();
      });
    });

    it('無効なメールアドレス形式で送信するとエラーが表示される', async () => {
      renderForgotPasswordPage();

      const emailInput = screen.getByLabelText('メールアドレス');
      fireEvent.change(emailInput, { target: { value: 'invalid-email' } });

      const form = emailInput.closest('form')!;
      fireEvent.submit(form);

      await waitFor(() => {
        expect(
          screen.getByText('有効なメールアドレスを入力してください')
        ).toBeInTheDocument();
      });
    });
  });

  describe('フォーム送信', () => {
    it('有効なメールアドレスで送信すると成功メッセージが表示される', async () => {
      const user = userEvent.setup();
      renderForgotPasswordPage();

      const emailInput = screen.getByLabelText('メールアドレス');
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', {
        name: 'リセットリンクを送信',
      });
      await user.click(submitButton);

      // 送信中の状態を確認
      expect(
        screen.getByRole('button', { name: '送信中...' })
      ).toBeInTheDocument();

      // 成功メッセージを待つ
      await waitFor(
        () => {
          expect(
            screen.getByText(
              'パスワードリセットのリンクをメールアドレスに送信しました。'
            )
          ).toBeInTheDocument();
        },
        { timeout: 2000 }
      );
    });

    it('送信中はボタンが無効化される', async () => {
      const user = userEvent.setup();
      renderForgotPasswordPage();

      const emailInput = screen.getByLabelText('メールアドレス');
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', {
        name: 'リセットリンクを送信',
      });
      await user.click(submitButton);

      // 送信中の状態
      const disabledButton = screen.getByRole('button', { name: '送信中...' });
      expect(disabledButton).toBeDisabled();
    });

    it('送信中は入力フィールドが無効化される', async () => {
      const user = userEvent.setup();
      renderForgotPasswordPage();

      const emailInput = screen.getByLabelText('メールアドレス');
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', {
        name: 'リセットリンクを送信',
      });
      await user.click(submitButton);

      // 送信中の状態
      expect(emailInput).toBeDisabled();
    });
  });

  describe('成功後の画面', () => {
    it('成功後、ログインページに戻るボタンが表示される', async () => {
      const user = userEvent.setup();
      renderForgotPasswordPage();

      const emailInput = screen.getByLabelText('メールアドレス');
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', {
        name: 'リセットリンクを送信',
      });
      await user.click(submitButton);

      await waitFor(
        () => {
          expect(
            screen.getByText(
              'パスワードリセットのリンクをメールアドレスに送信しました。'
            )
          ).toBeInTheDocument();
        },
        { timeout: 2000 }
      );

      // 成功後のボタン
      const backButton = screen.getByRole('button', {
        name: 'ログインページに戻る',
      });
      expect(backButton).toBeInTheDocument();
    });

    it('成功後、ログインページに戻るボタンをクリック可能', async () => {
      const user = userEvent.setup();
      renderForgotPasswordPage();

      const emailInput = screen.getByLabelText('メールアドレス');
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', {
        name: 'リセットリンクを送信',
      });
      await user.click(submitButton);

      await waitFor(
        () => {
          expect(
            screen.getByText(
              'パスワードリセットのリンクをメールアドレスに送信しました。'
            )
          ).toBeInTheDocument();
        },
        { timeout: 2000 }
      );

      const backButton = screen.getByRole('button', {
        name: 'ログインページに戻る',
      });
      // ボタンがクリック可能であることを確認
      expect(backButton).not.toBeDisabled();
    });
  });

  describe('ログインページへの遷移', () => {
    it('フォーム表示時のログインページに戻るボタンをクリックできる', async () => {
      renderForgotPasswordPage();

      // フォーム表示時の「ログインページに戻る」リンクボタン
      const backButton = screen.getByRole('button', {
        name: 'ログインページに戻る',
      });

      // クリックイベントをトリガーしてhandleBackToLoginを実行
      fireEvent.click(backButton);

      // ボタンがクリック可能であること
      expect(backButton).not.toBeDisabled();
    });
  });

  describe('ロゴリンク', () => {
    it('ロゴがルートへのリンクを持つ', () => {
      renderForgotPasswordPage();
      const logoLink = screen.getByRole('link', { name: /Polylex/i });
      expect(logoLink).toHaveAttribute('href', '/');
    });
  });
});
