import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QRCode from 'qrcode';
import { TotpForm } from './TotpForm';

vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn() } }));
beforeEach(() => vi.resetAllMocks());
describe('TOTP form', () => {
  it('retains manual enrollment when QR generation fails', async () => {
    vi.mocked(QRCode.toDataURL).mockRejectedValue(
      new Error('Canvas unavailable')
    );
    render(
      <TotpForm
        challenge={{
          kind: 'setup',
          sharedSecret: 'TESTKEY',
          setupUri: 'otpauth://totp/Test?secret=TESTKEY',
        }}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(await screen.findByTestId('totp-secret')).toHaveTextContent(
      'TESTKEY'
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
  it('does not send a non-six-digit code and prevents duplicate submissions', async () => {
    const user = userEvent.setup();
    const confirm = vi.fn().mockImplementation(() => new Promise(() => {}));
    render(
      <TotpForm
        challenge={{ kind: 'code' }}
        onConfirm={confirm}
        onCancel={vi.fn()}
      />
    );
    await user.type(screen.getByLabelText('認証コード'), '123');
    await user.click(screen.getByRole('button', { name: '認証する' }));
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('6桁');
    await user.type(screen.getByLabelText('認証コード'), '456');
    await user.click(screen.getByRole('button', { name: '認証する' }));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '確認中...' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'ログインからやり直す' })
    ).toBeDisabled();
  });
});
