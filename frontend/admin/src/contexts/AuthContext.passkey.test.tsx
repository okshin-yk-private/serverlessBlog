import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import * as auth from 'aws-amplify/auth';
import { AuthProvider } from './AuthContext';
import { useAuth } from '../hooks/useAuth';
import { getAuthToken, removeAuthToken } from '../utils/auth';
vi.mock('aws-amplify/auth', () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
  getCurrentUser: vi.fn(),
  fetchAuthSession: vi.fn(),
  confirmSignIn: vi.fn(),
}));
beforeEach(() => {
  vi.resetAllMocks();
  removeAuthToken();
  vi.mocked(auth.getCurrentUser).mockRejectedValue(new Error('No session'));
});
async function mount() {
  const hook = renderHook(() => useAuth(), { wrapper: AuthProvider });
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook.result;
}
describe('passkey sign in', () => {
  it('uses USER_AUTH and WEB_AUTHN without a password and completes only after DONE', async () => {
    const result = await mount();
    vi.mocked(auth.signIn).mockResolvedValue({
      isSignedIn: true,
      nextStep: { signInStep: 'DONE' },
    });
    vi.mocked(auth.fetchAuthSession).mockResolvedValue({
      tokens: {
        idToken: { payload: {}, toString: () => 'verified' },
        accessToken: { payload: {}, toString: () => 'access' },
      },
    });
    vi.mocked(auth.getCurrentUser).mockResolvedValue({
      username: 'admin',
      userId: 'id',
    });
    await act(async () => {
      await result.current.loginWithPasskey('admin@example.com');
    });
    expect(auth.signIn).toHaveBeenCalledWith({
      username: 'admin@example.com',
      options: { authFlowType: 'USER_AUTH', preferredChallenge: 'WEB_AUTHN' },
    });
    expect(result.current.isAuthenticated).toBe(true);
    expect(getAuthToken()).toBe('verified');
  });
  it('selects WEB_AUTHN once when offered, then preserves a subsequent TOTP challenge', async () => {
    const result = await mount();
    vi.mocked(auth.signIn).mockResolvedValue({
      isSignedIn: false,
      nextStep: {
        signInStep: 'CONTINUE_SIGN_IN_WITH_FIRST_FACTOR_SELECTION',
        availableChallenges: ['WEB_AUTHN', 'PASSWORD_SRP'],
      },
    });
    vi.mocked(auth.confirmSignIn).mockResolvedValue({
      isSignedIn: false,
      nextStep: { signInStep: 'CONFIRM_SIGN_IN_WITH_TOTP_CODE' },
    });
    await act(async () => {
      expect(
        await result.current.loginWithPasskey('admin@example.com')
      ).toMatchObject({ requiresTotp: true });
    });
    expect(auth.confirmSignIn).toHaveBeenCalledExactlyOnceWith({
      challengeResponse: 'WEB_AUTHN',
    });
    expect(result.current.isAuthenticated).toBe(false);
  });
  it('does not authenticate or silently fall back when no passkey is available', async () => {
    const result = await mount();
    vi.mocked(auth.signIn).mockResolvedValue({
      isSignedIn: false,
      nextStep: {
        signInStep: 'CONTINUE_SIGN_IN_WITH_FIRST_FACTOR_SELECTION',
        availableChallenges: ['PASSWORD_SRP'],
      },
    });
    await act(async () => {
      await expect(
        result.current.loginWithPasskey('admin@example.com')
      ).rejects.toThrow('パスワード');
    });
    expect(auth.confirmSignIn).not.toHaveBeenCalled();
    expect(getAuthToken()).toBeNull();
  });
  it('prevents simultaneous password and passkey requests', async () => {
    const result = await mount();
    let finish!: (value: auth.SignInOutput) => void;
    vi.mocked(auth.signIn).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    await act(async () => {
      const first = result.current.loginWithPasskey('admin@example.com');
      await expect(
        result.current.login('admin@example.com', 'password')
      ).rejects.toThrow('処理中');
      await waitFor(() => expect(auth.signIn).toHaveBeenCalledTimes(1));
      finish({
        isSignedIn: false,
        nextStep: { signInStep: 'CONFIRM_SIGN_IN_WITH_TOTP_CODE' },
      });
      await first;
    });
  });
});
