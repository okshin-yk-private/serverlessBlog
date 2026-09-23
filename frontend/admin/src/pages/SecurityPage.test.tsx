import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as auth from 'aws-amplify/auth';
import SecurityPage from './SecurityPage';

vi.mock('../components/AdminLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: { email: 'admin@example.com' } }),
}));
const qrMock = vi.hoisted(() => vi.fn<() => Promise<string>>());
vi.mock('qrcode', () => ({
  default: {
    toDataURL: qrMock,
  },
}));
vi.mock('aws-amplify/auth', () => ({
  fetchMFAPreference: vi.fn(),
  setUpTOTP: vi.fn(),
  verifyTOTPSetup: vi.fn(),
  updateMFAPreference: vi.fn(),
}));
beforeEach(() => {
  vi.resetAllMocks();
  qrMock.mockResolvedValue('data:image/png;base64,test');
  vi.mocked(auth.fetchMFAPreference).mockResolvedValue({
    enabled: [],
    preferred: undefined,
  });
  vi.mocked(auth.setUpTOTP).mockResolvedValue({
    sharedSecret: 'TESTKEY',
    getSetupUri: () => new URL('otpauth://totp/Test?secret=TESTKEY'),
  });
});
describe('optional MFA enrollment', () => {
  it('verifies the authenticator before enabling TOTP and removes the setup key', async () => {
    const user = userEvent.setup();
    vi.mocked(auth.updateMFAPreference).mockImplementation(async () => {
      vi.mocked(auth.fetchMFAPreference).mockResolvedValue({
        enabled: ['TOTP'],
        preferred: 'TOTP',
      });
    });
    render(<SecurityPage />);
    await user.click(
      await screen.findByRole('button', { name: '認証アプリを登録する' })
    );
    expect(await screen.findByTestId('totp-secret')).toHaveTextContent(
      'TESTKEY'
    );
    expect(auth.updateMFAPreference).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('認証コード'), '123456');
    await user.click(screen.getByRole('button', { name: '認証する' }));
    expect(auth.verifyTOTPSetup).toHaveBeenCalledWith({ code: '123456' });
    expect(auth.updateMFAPreference).toHaveBeenCalledWith({
      totp: 'PREFERRED',
    });
    expect(await screen.findByRole('status')).toHaveTextContent('有効');
    expect(screen.queryByTestId('totp-secret')).not.toBeInTheDocument();
  });
  it('does not enable MFA after a rejected setup code', async () => {
    vi.mocked(auth.verifyTOTPSetup).mockRejectedValue(
      new Error('Invalid code')
    );
    const user = userEvent.setup();
    render(<SecurityPage />);
    await user.click(
      await screen.findByRole('button', { name: '認証アプリを登録する' })
    );
    await user.type(await screen.findByLabelText('認証コード'), '000000');
    await user.click(screen.getByRole('button', { name: '認証する' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(auth.updateMFAPreference).not.toHaveBeenCalled();
  });
  it('does not replace an already enabled authenticator', async () => {
    vi.mocked(auth.fetchMFAPreference).mockResolvedValue({
      enabled: ['TOTP'],
      preferred: 'TOTP',
    });
    render(<SecurityPage />);
    expect(await screen.findByRole('status')).toHaveTextContent('有効');
    expect(
      screen.queryByRole('button', { name: '認証アプリを登録する' })
    ).not.toBeInTheDocument();
    expect(auth.setUpTOTP).not.toHaveBeenCalled();
  });
});

it('retains confirmed enrollment and reports a readback failure in the parent page', async () => {
  const user = userEvent.setup();
  vi.mocked(auth.updateMFAPreference).mockImplementation(async () => {
    vi.mocked(auth.fetchMFAPreference).mockRejectedValue(
      new Error('Readback failed')
    );
  });
  render(<SecurityPage />);
  await user.click(
    await screen.findByRole('button', { name: '認証アプリを登録する' })
  );
  await user.type(await screen.findByLabelText('認証コード'), '123456');
  await user.click(screen.getByRole('button', { name: '認証する' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    '登録は完了しましたが'
  );
  expect(screen.queryByTestId('totp-secret')).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: '認証アプリをOFFにする' })
  ).toBeDisabled();
});
