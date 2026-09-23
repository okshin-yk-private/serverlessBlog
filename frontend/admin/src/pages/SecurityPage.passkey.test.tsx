import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as auth from 'aws-amplify/auth';
import * as security from '../api/security';
import SecurityPage from './SecurityPage';
vi.mock('../components/AdminLayout', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../hooks/useAuth', () => ({
  useAuth: () => ({ user: { email: 'admin@example.com' } }),
}));
vi.mock('aws-amplify/auth', () => ({
  fetchMFAPreference: vi.fn(),
  setUpTOTP: vi.fn(),
  verifyTOTPSetup: vi.fn(),
  updateMFAPreference: vi.fn(),
  associateWebAuthnCredential: vi.fn(),
  deleteWebAuthnCredential: vi.fn(),
}));
vi.mock('../api/security', () => ({
  listPasskeys: vi.fn(),
  enablePasskeyMfa: vi.fn(),
  disableTotp: vi.fn(),
}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('VITE_ENABLE_PASSKEY', 'true');
  vi.stubEnv('VITE_MFA_REQUIRED', 'true');
  vi.mocked(auth.fetchMFAPreference).mockResolvedValue({ enabled: ['TOTP'] });
  vi.mocked(security.listPasskeys).mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());
it('keeps TOTP enabled under required MFA', async () => {
  render(<SecurityPage />);
  expect(
    await screen.findByRole('button', { name: '認証アプリをOFFにする' })
  ).toBeDisabled();
  expect(screen.getByText(/MFAが必須/)).toBeInTheDocument();
});
it('requires TOTP before registering a passkey', async () => {
  vi.mocked(auth.fetchMFAPreference).mockResolvedValue({ enabled: [] });
  render(<SecurityPage />);
  expect(
    await screen.findByRole('button', { name: 'パスキーを登録する' })
  ).toBeDisabled();
  expect(auth.associateWebAuthnCredential).not.toHaveBeenCalled();
});
it('enables MFA only after successful registration and refreshes the list', async () => {
  const user = userEvent.setup();
  render(<SecurityPage />);
  await user.click(
    await screen.findByRole('button', { name: 'パスキーを登録する' })
  );
  expect(auth.associateWebAuthnCredential).toHaveBeenCalledTimes(1);
  expect(security.enablePasskeyMfa).toHaveBeenCalledTimes(1);
  expect(
    await screen.findByText(/パスキーのMFA利用を有効/)
  ).toBeInTheDocument();
});
it('never reports successful MFA enablement when that API fails after registration', async () => {
  vi.mocked(security.enablePasskeyMfa).mockRejectedValue(
    new Error('API failure')
  );
  const user = userEvent.setup();
  render(<SecurityPage />);
  await user.click(
    await screen.findByRole('button', { name: 'パスキーを登録する' })
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('完了できません');
  expect(screen.queryByText(/パスキーのMFA利用を有効/)).not.toBeInTheDocument();
  expect(security.listPasskeys).toHaveBeenCalledTimes(2);
});
it('retries MFA enablement for an existing passkey without registering another', async () => {
  vi.mocked(security.listPasskeys).mockResolvedValue([
    {
      credentialId: 'registered-key',
      friendlyCredentialName: '1Password',
    } as security.Passkey,
  ]);
  const user = userEvent.setup();
  render(<SecurityPage />);
  await user.click(
    await screen.findByRole('button', {
      name: '登録済みパスキーの利用を有効にする',
    })
  );
  expect(auth.associateWebAuthnCredential).not.toHaveBeenCalled();
  expect(security.enablePasskeyMfa).toHaveBeenCalledTimes(1);
  expect(
    await screen.findByText(/パスキーのMFA利用を有効/)
  ).toBeInTheDocument();
});
it('deletes credentials only after confirmation, without turning off TOTP', async () => {
  const key = {
    credentialId: 'key-1',
    friendlyCredentialName: 'My key',
  } as security.Passkey;
  vi.mocked(security.listPasskeys)
    .mockResolvedValueOnce([key])
    .mockResolvedValue([]);
  const user = userEvent.setup();
  render(<SecurityPage />);
  await user.click(
    await screen.findByRole('button', {
      name: 'パスキーをすべて削除してOFFにする',
    })
  );
  expect(auth.deleteWebAuthnCredential).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: '削除を実行する' }));
  expect(auth.deleteWebAuthnCredential).toHaveBeenCalledWith({
    credentialId: 'key-1',
  });
  expect(security.disableTotp).not.toHaveBeenCalled();
});
it('blocks optional TOTP disable while any passkey remains', async () => {
  vi.stubEnv('VITE_MFA_REQUIRED', 'false');
  vi.mocked(security.listPasskeys).mockResolvedValue([
    { credentialId: 'key' } as security.Passkey,
  ]);
  render(<SecurityPage />);
  expect(
    await screen.findByRole('button', { name: '認証アプリをOFFにする' })
  ).toBeDisabled();
});
it('allows optional TOTP disable only after explicit confirmation and reads back', async () => {
  vi.stubEnv('VITE_MFA_REQUIRED', 'false');
  const user = userEvent.setup();
  render(<SecurityPage />);
  await user.click(
    await screen.findByRole('button', { name: '認証アプリをOFFにする' })
  );
  expect(security.disableTotp).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'OFFにする' }));
  expect(security.disableTotp).toHaveBeenCalledTimes(1);
  expect(auth.fetchMFAPreference).toHaveBeenCalledTimes(3);
});

it('does not enable MFA when passkey registration is cancelled', async () => {
  vi.mocked(auth.associateWebAuthnCredential).mockRejectedValue(
    new Error('PasskeyRegistrationCanceled')
  );
  const user = userEvent.setup();
  render(<SecurityPage />);
  await user.click(
    await screen.findByRole('button', { name: 'パスキーを登録する' })
  );
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(security.enablePasskeyMfa).not.toHaveBeenCalled();
});
it('refreshes remaining keys after a partial deletion failure without reporting success', async () => {
  const a = {
    credentialId: 'a',
    friendlyCredentialName: 'A',
  } as security.Passkey;
  const b = {
    credentialId: 'b',
    friendlyCredentialName: 'B',
  } as security.Passkey;
  vi.mocked(security.listPasskeys)
    .mockResolvedValueOnce([a, b])
    .mockResolvedValueOnce([a, b])
    .mockResolvedValue([b]);
  vi.mocked(auth.deleteWebAuthnCredential)
    .mockResolvedValueOnce()
    .mockRejectedValueOnce(new Error('service failure'));
  const user = userEvent.setup();
  render(<SecurityPage />);
  await user.click(
    await screen.findByRole('button', {
      name: 'パスキーをすべて削除してOFFにする',
    })
  );
  await user.click(screen.getByRole('button', { name: '削除を実行する' }));
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.queryByText('A', { exact: true })).not.toBeInTheDocument();
  expect(screen.getByText('B', { exact: true })).toBeInTheDocument();
  expect(
    screen.queryByText(/選択したパスキーを削除しました/)
  ).not.toBeInTheDocument();
});
it('disables mutations if settings cannot be read', async () => {
  vi.mocked(security.listPasskeys).mockRejectedValue(new Error('network'));
  render(<SecurityPage />);
  expect(await screen.findByRole('alert')).toHaveTextContent('取得できません');
  expect(
    screen.getByRole('button', { name: 'パスキーを登録する' })
  ).toBeDisabled();
});
