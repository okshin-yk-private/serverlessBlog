import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from './LoginForm';

describe('LoginForm', () => {
  const mockOnLogin = vi.fn();

  beforeEach(() => {
    mockOnLogin.mockClear();
  });

  it('メールアドレスとパスワードの入力フィールドが表示される', () => {
    render(<LoginForm onLogin={mockOnLogin} />);

    expect(screen.getByLabelText(/メールアドレス/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/パスワード/i)).toBeInTheDocument();
  });

  it('ログインボタンが表示される', () => {
    render(<LoginForm onLogin={mockOnLogin} />);

    expect(
      screen.getByRole('button', { name: /ログイン/i })
    ).toBeInTheDocument();
  });

  it('空のフォームを送信するとバリデーションエラーが表示される', async () => {
    const user = userEvent.setup();
    render(<LoginForm onLogin={mockOnLogin} />);

    await user.click(screen.getByRole('button', { name: /ログイン/i }));

    await waitFor(() => {
      expect(screen.getByText('メールアドレスは必須です')).toBeInTheDocument();
      expect(screen.getByText('パスワードは必須です')).toBeInTheDocument();
    });

    expect(mockOnLogin).not.toHaveBeenCalled();
  });

  it('無効なメールアドレス形式の場合エラーが表示される', async () => {
    const user = userEvent.setup();
    render(<LoginForm onLogin={mockOnLogin} />);

    await user.type(screen.getByLabelText(/メールアドレス/i), 'invalid-email');
    await user.type(screen.getByLabelText(/パスワード/i), 'password123');
    await user.click(screen.getByRole('button', { name: /ログイン/i }));

    await waitFor(() => {
      expect(
        screen.getByText('有効なメールアドレスを入力してください')
      ).toBeInTheDocument();
    });

    expect(mockOnLogin).not.toHaveBeenCalled();
  });

  it('パスワードが8文字未満の場合エラーが表示される', async () => {
    const user = userEvent.setup();
    render(<LoginForm onLogin={mockOnLogin} />);

    await user.type(
      screen.getByLabelText(/メールアドレス/i),
      'test@example.com'
    );
    await user.type(screen.getByLabelText(/パスワード/i), 'short');
    await user.click(screen.getByRole('button', { name: /ログイン/i }));

    await waitFor(() => {
      expect(
        screen.getByText('パスワードは8文字以上で入力してください')
      ).toBeInTheDocument();
    });

    expect(mockOnLogin).not.toHaveBeenCalled();
  });

  it('正しい情報を入力して送信するとonLoginが呼ばれる', async () => {
    const user = userEvent.setup();
    render(<LoginForm onLogin={mockOnLogin} />);

    await user.type(
      screen.getByLabelText(/メールアドレス/i),
      'test@example.com'
    );
    await user.type(screen.getByLabelText(/パスワード/i), 'password123');
    await user.click(screen.getByRole('button', { name: /ログイン/i }));

    await waitFor(() => {
      expect(mockOnLogin).toHaveBeenCalledTimes(1);
      expect(mockOnLogin).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
        rememberMe: false,
      });
    });
  });

  it('送信中はボタンが無効化される', async () => {
    const user = userEvent.setup();
    const slowLogin = vi.fn(
      () => new Promise<void>((resolve) => setTimeout(resolve, 100))
    );
    render(<LoginForm onLogin={slowLogin} />);

    await user.type(
      screen.getByLabelText(/メールアドレス/i),
      'test@example.com'
    );
    await user.type(screen.getByLabelText(/パスワード/i), 'password123');

    const button = screen.getByRole('button', { name: /ログイン/i });
    await user.click(button);

    expect(button).toBeDisabled();

    await waitFor(() => {
      expect(button).not.toBeDisabled();
    });
  });

  it('エラーメッセージが表示される場合、エラー内容が表示される', () => {
    render(<LoginForm onLogin={mockOnLogin} error="認証に失敗しました" />);

    expect(screen.getByText('認証に失敗しました')).toBeInTheDocument();
  });

  it('エラーメッセージがクリアされる', () => {
    const { rerender } = render(
      <LoginForm onLogin={mockOnLogin} error="認証に失敗しました" />
    );

    expect(screen.getByText('認証に失敗しました')).toBeInTheDocument();

    rerender(<LoginForm onLogin={mockOnLogin} />);

    expect(screen.queryByText('認証に失敗しました')).not.toBeInTheDocument();
  });

  it('パスワードフィールドはtype="password"である', () => {
    render(<LoginForm onLogin={mockOnLogin} />);

    const passwordInput = screen.getByLabelText(/パスワード/i);
    expect(passwordInput).toHaveAttribute('type', 'password');
  });

  it('Enterキーでフォームを送信できる', async () => {
    const user = userEvent.setup();
    render(<LoginForm onLogin={mockOnLogin} />);

    await user.type(
      screen.getByLabelText(/メールアドレス/i),
      'test@example.com'
    );
    await user.type(screen.getByLabelText(/パスワード/i), 'password123{Enter}');

    await waitFor(() => {
      expect(mockOnLogin).toHaveBeenCalledTimes(1);
    });
  });
});
