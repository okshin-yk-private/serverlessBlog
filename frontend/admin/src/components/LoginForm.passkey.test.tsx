import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from './LoginForm';
describe('passkey-first login form', () => {
  it('submits an email without requiring a password and offers explicit fallback', async () => {
    const passkey = vi.fn(),
      password = vi.fn(),
      user = userEvent.setup();
    render(<LoginForm onLogin={password} onPasskeyLogin={passkey} />);
    await user.type(
      screen.getByLabelText('メールアドレス'),
      'admin@example.com'
    );
    await user.click(
      screen.getByRole('button', { name: 'パスキーでログイン' })
    );
    expect(passkey).toHaveBeenCalledWith('admin@example.com');
    expect(password).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: 'パスワードでログインする' })
    );
    await user.type(screen.getByLabelText('パスワード'), 'TestPassword123!');
    await user.click(screen.getByRole('button', { name: /^ログイン$/ }));
    expect(password).toHaveBeenCalledTimes(1);
  });
  it('blocks repeated submission and switching methods until the request completes', async () => {
    let finish!: () => void;
    const passkey = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    const user = userEvent.setup();
    render(<LoginForm onLogin={vi.fn()} onPasskeyLogin={passkey} />);
    await user.type(
      screen.getByLabelText('メールアドレス'),
      'admin@example.com'
    );
    const button = screen.getByRole('button', { name: 'パスキーでログイン' });
    fireEvent.submit(button.closest('form')!);
    fireEvent.submit(button.closest('form')!);
    expect(passkey).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: 'パスワードでログインする' })
    ).toBeDisabled();
    finish();
  });
});
