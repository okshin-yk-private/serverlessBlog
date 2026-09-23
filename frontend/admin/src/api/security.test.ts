import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { Amplify } from 'aws-amplify';
import * as auth from 'aws-amplify/auth';
import { listPasskeys, enablePasskeyMfa, disableTotp } from './security';
vi.mock('aws-amplify/auth', () => ({
  fetchAuthSession: vi.fn(),
  listWebAuthnCredentials: vi.fn(),
}));
vi.mock('aws-amplify', () => ({ Amplify: { getConfig: vi.fn() } }));
const fetchMock = vi.fn();
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  vi.mocked(Amplify.getConfig).mockReturnValue({
    Auth: {
      Cognito: {
        userPoolId: 'ap-northeast-1_fixture',
        userPoolClientId: 'fixture',
      },
    },
  });
  vi.mocked(auth.fetchAuthSession).mockResolvedValue({
    tokens: {
      accessToken: {
        toString: () => 'test-access',
        payload: { scope: 'aws.cognito.signin.user.admin' },
      },
      idToken: { toString: () => 'test-id', payload: {} },
    },
  });
});
afterEach(() => vi.unstubAllGlobals());
it('uses access token and accepts an empty success body without logging tokens', async () => {
  fetchMock.mockResolvedValue(new Response('', { status: 200 }));
  await enablePasskeyMfa();
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toBe('https://cognito-idp.ap-northeast-1.amazonaws.com/');
  expect(JSON.parse(options.body)).toEqual({
    AccessToken: 'test-access',
    WebAuthnMfaSettings: { Enabled: true },
  });
});
it('does not expose the AWS response or token in errors', async () => {
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({
        __type: 'InvalidParameterException',
        message: 'private-details',
      }),
      { status: 400 }
    )
  );
  await expect(enablePasskeyMfa()).rejects.toThrow('設定を変更できません');
});
it('does not send a request without an access token', async () => {
  vi.mocked(auth.fetchAuthSession).mockResolvedValue({});
  await expect(enablePasskeyMfa()).rejects.toThrow('再ログイン');
  expect(fetchMock).not.toHaveBeenCalled();
});
it('does not send tokens to malformed configured pool endpoints', async () => {
  vi.mocked(Amplify.getConfig).mockReturnValue({
    Auth: {
      Cognito: {
        userPoolId: 'attacker.invalid/pool',
        userPoolClientId: 'fixture',
      },
    },
  });
  await expect(enablePasskeyMfa()).rejects.toThrow('設定');
  expect(fetchMock).not.toHaveBeenCalled();
});
it('lists every page of credentials', async () => {
  vi.mocked(auth.listWebAuthnCredentials)
    .mockResolvedValueOnce({
      credentials: [{ credentialId: 'a' } as never],
      nextToken: 'next',
    })
    .mockResolvedValueOnce({ credentials: [{ credentialId: 'b' } as never] });
  expect((await listPasskeys()).map((key) => key.credentialId)).toEqual([
    'a',
    'b',
  ]);
  expect(auth.listWebAuthnCredentials).toHaveBeenLastCalledWith({
    pageSize: 20,
    nextToken: 'next',
  });
});
it('turns off both MFA preferences together when optional and no passkeys remain', async () => {
  fetchMock.mockResolvedValue(new Response('', { status: 200 }));
  await disableTotp();
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
    SoftwareTokenMfaSettings: { Enabled: false, PreferredMfa: false },
    WebAuthnMfaSettings: { Enabled: false },
  });
});
