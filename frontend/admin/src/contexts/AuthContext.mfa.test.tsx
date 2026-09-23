import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { AuthProvider } from './AuthContext';
import { useAuth } from '../hooks/useAuth';
import * as auth from 'aws-amplify/auth';
import { getAuthToken, removeAuthToken } from '../utils/auth';

vi.mock('aws-amplify/auth', () => ({
  signIn: vi.fn(),
  signOut: vi.fn(),
  getCurrentUser: vi.fn(),
  fetchAuthSession: vi.fn(),
  confirmSignIn: vi.fn(),
}));
const done = { isSignedIn: true, nextStep: { signInStep: 'DONE' as const } };
const challenge = {
  isSignedIn: false,
  nextStep: { signInStep: 'CONFIRM_SIGN_IN_WITH_TOTP_CODE' as const },
};
const setup = {
  isSignedIn: false,
  nextStep: {
    signInStep: 'CONTINUE_SIGN_IN_WITH_TOTP_SETUP' as const,
    totpSetupDetails: {
      sharedSecret: 'TESTONLYSECRET',
      getSetupUri: () =>
        new URL('otpauth://totp/Blog:test?secret=TESTONLYSECRET'),
    },
  },
};
async function mount() {
  const hook = renderHook(() => useAuth(), { wrapper: AuthProvider });
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook.result;
}
function authenticatedSession() {
  vi.mocked(auth.getCurrentUser).mockResolvedValue({
    userId: 'id',
    username: 'admin',
  });
  vi.mocked(auth.fetchAuthSession).mockResolvedValue({
    tokens: {
      accessToken: { toString: () => 'access-token', payload: {} },
      idToken: { toString: () => 'verified-token', payload: {} },
    },
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  removeAuthToken();
  vi.mocked(auth.getCurrentUser).mockRejectedValue(new Error('Not signed in'));
  vi.mocked(auth.signOut).mockResolvedValue();
});
describe('TOTP sign-in transitions', () => {
  it.each([challenge, setup])(
    'does not authenticate before confirming $nextStep.signInStep',
    async (step) => {
      vi.mocked(auth.signIn).mockResolvedValue(step);
      const result = await mount();
      await act(async () => {
        expect(
          await result.current.login('admin@example.com', 'password')
        ).toMatchObject({ requiresTotp: true });
      });
      expect(result.current.isAuthenticated).toBe(false);
      expect(getAuthToken()).toBeNull();
      expect(auth.fetchAuthSession).not.toHaveBeenCalled();
      expect(result.current.totpChallenge?.kind).toBe(
        step === setup ? 'setup' : 'code'
      );
      authenticatedSession();
      vi.mocked(auth.confirmSignIn).mockResolvedValue(done);
      await act(async () => {
        await result.current.confirmTotp('123456');
      });
      expect(auth.confirmSignIn).toHaveBeenCalledWith({
        challengeResponse: '123456',
      });
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.totpChallenge).toBeNull();
      expect(getAuthToken()).toBe('verified-token');
    }
  );
  it('keeps a failed challenge retryable without saving tokens', async () => {
    vi.mocked(auth.signIn).mockResolvedValue(challenge);
    const result = await mount();
    await act(async () => {
      await result.current.login('admin@example.com', 'password');
    });
    vi.mocked(auth.confirmSignIn).mockRejectedValue(
      new Error('CodeMismatchException')
    );
    await act(async () => {
      await expect(result.current.confirmTotp('000000')).rejects.toThrow();
    });
    expect(result.current.totpChallenge?.kind).toBe('code');
    expect(getAuthToken()).toBeNull();
  });
  it('processes TOTP after a new password without authenticating early', async () => {
    vi.mocked(auth.signIn).mockResolvedValue({
      isSignedIn: false,
      nextStep: {
        signInStep: 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED',
        missingAttributes: [],
      },
    });
    const result = await mount();
    await act(async () => {
      await result.current.login('admin@example.com', 'password');
    });
    vi.mocked(auth.confirmSignIn).mockResolvedValue(setup);
    await act(async () => {
      expect(
        await result.current.confirmNewPassword('NewPassword1!')
      ).toMatchObject({ requiresTotp: true });
    });
    expect(result.current.requiresNewPassword).toBe(false);
    expect(result.current.totpChallenge?.kind).toBe('setup');
    expect(result.current.isAuthenticated).toBe(false);
  });
  it('clears setup secrets when cancelled', async () => {
    vi.mocked(auth.signIn).mockResolvedValue(setup);
    const result = await mount();
    await act(async () => {
      await result.current.login('admin@example.com', 'password');
    });
    await act(async () => {
      result.current.cancelNewPassword();
    });
    expect(result.current.totpChallenge).toBeNull();
    expect(result.current.pendingEmail).toBeNull();
    expect(auth.signOut).toHaveBeenCalled();
  });
});
