import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ForgotPasswordPage from './ForgotPasswordPage';

// aws-amplify/authをモック
vi.mock('aws-amplify/auth', () => ({
  resetPassword: vi.fn(),
  confirmResetPassword: vi.fn(),
}));

import { resetPassword, confirmResetPassword } from 'aws-amplify/auth';

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
    // デフォルトのモック動作を設定
    (resetPassword as ReturnType<typeof vi.fn>).mockResolvedValue({
      nextStep: { resetPasswordStep: 'CONFIRM_RESET_PASSWORD_WITH_CODE' },
    });
    (confirmResetPassword as ReturnType<typeof vi.fn>).mockResolvedValue({});
  });

  describe('ステップ1: メールアドレス入力画面', () => {
    describe('レンダリング', () => {
      it('ロゴが表示される', () => {
        renderForgotPasswordPage();
        expect(screen.getByAltText('Logo')).toBeInTheDocument();
      });

      it('サイトタイトルが表示される', () => {
        renderForgotPasswordPage();
        expect(screen.getByText('Bone of my fallacy')).toBeInTheDocument();
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

      it('確認コード送信ボタンが表示される', () => {
        renderForgotPasswordPage();
        expect(
          screen.getByRole('button', { name: '確認コードを送信' })
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
          name: '確認コードを送信',
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
      it('有効なメールアドレスで送信すると確認ステップに進む', async () => {
        const user = userEvent.setup();
        renderForgotPasswordPage();

        const emailInput = screen.getByLabelText('メールアドレス');
        await user.type(emailInput, 'test@example.com');

        const submitButton = screen.getByRole('button', {
          name: '確認コードを送信',
        });
        await user.click(submitButton);

        // 確認ステップに遷移
        await waitFor(() => {
          expect(
            screen.getByText(/に確認コードを送信しました/)
          ).toBeInTheDocument();
        });
      });

      it('送信中はボタンが無効化される', async () => {
        const user = userEvent.setup();
        // 遅延を追加
        (resetPassword as ReturnType<typeof vi.fn>).mockImplementation(
          () =>
            new Promise((resolve) =>
              setTimeout(
                () =>
                  resolve({
                    nextStep: {
                      resetPasswordStep: 'CONFIRM_RESET_PASSWORD_WITH_CODE',
                    },
                  }),
                100
              )
            )
        );
        renderForgotPasswordPage();

        const emailInput = screen.getByLabelText('メールアドレス');
        await user.type(emailInput, 'test@example.com');

        const submitButton = screen.getByRole('button', {
          name: '確認コードを送信',
        });
        await user.click(submitButton);

        // 送信中の状態
        const disabledButton = screen.getByRole('button', {
          name: '送信中...',
        });
        expect(disabledButton).toBeDisabled();
      });

      it('送信中は入力フィールドが無効化される', async () => {
        const user = userEvent.setup();
        // 遅延を追加
        (resetPassword as ReturnType<typeof vi.fn>).mockImplementation(
          () =>
            new Promise((resolve) =>
              setTimeout(
                () =>
                  resolve({
                    nextStep: {
                      resetPasswordStep: 'CONFIRM_RESET_PASSWORD_WITH_CODE',
                    },
                  }),
                100
              )
            )
        );
        renderForgotPasswordPage();

        const emailInput = screen.getByLabelText('メールアドレス');
        await user.type(emailInput, 'test@example.com');

        const submitButton = screen.getByRole('button', {
          name: '確認コードを送信',
        });
        await user.click(submitButton);

        // 送信中の状態
        expect(emailInput).toBeDisabled();
      });

      it('ユーザーが見つからない場合はエラーが表示される', async () => {
        const user = userEvent.setup();
        const error = new Error('User not found');
        error.name = 'UserNotFoundException';
        (resetPassword as ReturnType<typeof vi.fn>).mockRejectedValue(error);

        renderForgotPasswordPage();

        const emailInput = screen.getByLabelText('メールアドレス');
        await user.type(emailInput, 'notfound@example.com');

        const submitButton = screen.getByRole('button', {
          name: '確認コードを送信',
        });
        await user.click(submitButton);

        await waitFor(() => {
          expect(
            screen.getByText('このメールアドレスは登録されていません。')
          ).toBeInTheDocument();
        });
      });

      it('レート制限エラーの場合はエラーが表示される', async () => {
        const user = userEvent.setup();
        const error = new Error('Limit exceeded');
        error.name = 'LimitExceededException';
        (resetPassword as ReturnType<typeof vi.fn>).mockRejectedValue(error);

        renderForgotPasswordPage();

        const emailInput = screen.getByLabelText('メールアドレス');
        await user.type(emailInput, 'test@example.com');

        const submitButton = screen.getByRole('button', {
          name: '確認コードを送信',
        });
        await user.click(submitButton);

        await waitFor(() => {
          expect(
            screen.getByText(/リクエスト回数の上限に達しました/)
          ).toBeInTheDocument();
        });
      });
    });
  });

  describe('ステップ2: 確認コード入力画面', () => {
    const goToConfirmStep = async () => {
      const user = userEvent.setup();
      renderForgotPasswordPage();

      const emailInput = screen.getByLabelText('メールアドレス');
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', {
        name: '確認コードを送信',
      });
      await user.click(submitButton);

      await waitFor(() => {
        expect(
          screen.getByText(/に確認コードを送信しました/)
        ).toBeInTheDocument();
      });

      return user;
    };

    it('確認コード入力フィールドが表示される', async () => {
      await goToConfirmStep();
      expect(screen.getByLabelText(/確認コード/)).toBeInTheDocument();
    });

    it('新しいパスワード入力フィールドが表示される', async () => {
      await goToConfirmStep();
      expect(screen.getByLabelText('新しいパスワード')).toBeInTheDocument();
    });

    it('新しいパスワード確認入力フィールドが表示される', async () => {
      await goToConfirmStep();
      expect(
        screen.getByLabelText('新しいパスワード（確認）')
      ).toBeInTheDocument();
    });

    it('パスワードリセットボタンが表示される', async () => {
      await goToConfirmStep();
      expect(
        screen.getByRole('button', { name: 'パスワードをリセット' })
      ).toBeInTheDocument();
    });

    it('メールアドレス変更ボタンが表示される', async () => {
      await goToConfirmStep();
      expect(
        screen.getByRole('button', { name: 'メールアドレスを変更する' })
      ).toBeInTheDocument();
    });

    it('メールアドレス変更ボタンをクリックするとステップ1に戻る', async () => {
      const user = await goToConfirmStep();

      const backButton = screen.getByRole('button', {
        name: 'メールアドレスを変更する',
      });
      await user.click(backButton);

      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: '確認コードを送信' })
        ).toBeInTheDocument();
      });
    });

    it('空の確認コードで送信するとエラーが表示される', async () => {
      const user = await goToConfirmStep();

      const submitButton = screen.getByRole('button', {
        name: 'パスワードをリセット',
      });
      await user.click(submitButton);

      await waitFor(() => {
        expect(
          screen.getByText('確認コードを入力してください。')
        ).toBeInTheDocument();
      });
    });

    it('無効な確認コード形式で送信するとエラーが表示される', async () => {
      const user = await goToConfirmStep();

      const codeInput = screen.getByLabelText(/確認コード/);
      await user.type(codeInput, 'abc');

      const submitButton = screen.getByRole('button', {
        name: 'パスワードをリセット',
      });
      await user.click(submitButton);

      await waitFor(() => {
        expect(
          screen.getByText('確認コードは6桁の数字で入力してください。')
        ).toBeInTheDocument();
      });
    });

    it('パスワードが一致しない場合はエラーが表示される', async () => {
      const user = await goToConfirmStep();

      const codeInput = screen.getByLabelText(/確認コード/);
      await user.type(codeInput, '123456');

      const passwordInput = screen.getByLabelText('新しいパスワード');
      await user.type(passwordInput, 'Password123!');

      const confirmPasswordInput =
        screen.getByLabelText('新しいパスワード（確認）');
      await user.type(confirmPasswordInput, 'DifferentPassword123!');

      const submitButton = screen.getByRole('button', {
        name: 'パスワードをリセット',
      });
      await user.click(submitButton);

      await waitFor(() => {
        expect(
          screen.getByText('パスワードが一致しません。')
        ).toBeInTheDocument();
      });
    });

    it('確認コードが不正な場合はエラーが表示される', async () => {
      const error = new Error('Code mismatch');
      error.name = 'CodeMismatchException';
      (confirmResetPassword as ReturnType<typeof vi.fn>).mockRejectedValue(
        error
      );

      const user = await goToConfirmStep();

      const codeInput = screen.getByLabelText(/確認コード/);
      await user.type(codeInput, '000000');

      const passwordInput = screen.getByLabelText('新しいパスワード');
      await user.type(passwordInput, 'Password123!');

      const confirmPasswordInput =
        screen.getByLabelText('新しいパスワード（確認）');
      await user.type(confirmPasswordInput, 'Password123!');

      const submitButton = screen.getByRole('button', {
        name: 'パスワードをリセット',
      });
      await user.click(submitButton);

      await waitFor(() => {
        expect(
          screen.getByText('確認コードが正しくありません。')
        ).toBeInTheDocument();
      });
    });

    it('確認コードの有効期限切れの場合はエラーが表示される', async () => {
      const error = new Error('Code expired');
      error.name = 'ExpiredCodeException';
      (confirmResetPassword as ReturnType<typeof vi.fn>).mockRejectedValue(
        error
      );

      const user = await goToConfirmStep();

      const codeInput = screen.getByLabelText(/確認コード/);
      await user.type(codeInput, '123456');

      const passwordInput = screen.getByLabelText('新しいパスワード');
      await user.type(passwordInput, 'Password123!');

      const confirmPasswordInput =
        screen.getByLabelText('新しいパスワード（確認）');
      await user.type(confirmPasswordInput, 'Password123!');

      const submitButton = screen.getByRole('button', {
        name: 'パスワードをリセット',
      });
      await user.click(submitButton);

      await waitFor(() => {
        expect(
          screen.getByText(/確認コードの有効期限が切れました/)
        ).toBeInTheDocument();
      });
    });
  });

  describe('ステップ3: 成功画面', () => {
    const goToSuccessStep = async () => {
      const user = userEvent.setup();
      renderForgotPasswordPage();

      // ステップ1
      const emailInput = screen.getByLabelText('メールアドレス');
      await user.type(emailInput, 'test@example.com');

      const submitButton1 = screen.getByRole('button', {
        name: '確認コードを送信',
      });
      await user.click(submitButton1);

      await waitFor(() => {
        expect(
          screen.getByText(/に確認コードを送信しました/)
        ).toBeInTheDocument();
      });

      // ステップ2
      const codeInput = screen.getByLabelText(/確認コード/);
      await user.type(codeInput, '123456');

      const passwordInput = screen.getByLabelText('新しいパスワード');
      await user.type(passwordInput, 'Password123!');

      const confirmPasswordInput =
        screen.getByLabelText('新しいパスワード（確認）');
      await user.type(confirmPasswordInput, 'Password123!');

      const submitButton2 = screen.getByRole('button', {
        name: 'パスワードをリセット',
      });
      await user.click(submitButton2);

      await waitFor(() => {
        expect(
          screen.getByText(/パスワードのリセットが完了しました/)
        ).toBeInTheDocument();
      });

      return user;
    };

    it('成功メッセージが表示される', async () => {
      await goToSuccessStep();
      expect(
        screen.getByText(/パスワードのリセットが完了しました/)
      ).toBeInTheDocument();
    });

    it('ログインページに戻るボタンが表示される', async () => {
      await goToSuccessStep();
      expect(
        screen.getByRole('button', { name: 'ログインページに戻る' })
      ).toBeInTheDocument();
    });

    it('ログインページに戻るボタンがクリック可能', async () => {
      await goToSuccessStep();
      const backButton = screen.getByRole('button', {
        name: 'ログインページに戻る',
      });
      expect(backButton).not.toBeDisabled();
    });
  });

  describe('ログインページへの遷移', () => {
    it('フォーム表示時のログインページに戻るボタンをクリックできる', async () => {
      renderForgotPasswordPage();

      const backButton = screen.getByRole('button', {
        name: 'ログインページに戻る',
      });

      fireEvent.click(backButton);

      expect(backButton).not.toBeDisabled();
    });
  });

  describe('ロゴリンク', () => {
    it('ロゴがルートへのリンクを持つ', () => {
      renderForgotPasswordPage();
      const logoLink = screen.getByRole('link', {
        name: /Bone of my fallacy/i,
      });
      expect(logoLink).toHaveAttribute('href', '/');
    });
  });
});
