import { describe, it, expect, vi, beforeEach } from 'vitest';

// Amplify.configure のモック
const configureMock = vi.fn();
vi.mock('aws-amplify', () => ({
  Amplify: {
    configure: configureMock,
  },
}));

// cognitoUserPoolsTokenProvider.setKeyValueStorage のモック
const setKeyValueStorageMock = vi.fn();
vi.mock('aws-amplify/auth/cognito', () => ({
  cognitoUserPoolsTokenProvider: {
    setKeyValueStorage: setKeyValueStorageMock,
  },
}));

// Amplify公式の sessionStorage KeyValueStorage のモック
// （実体と区別できるよう固有のシンボルを持たせる）
const amplifySessionStorageMock = { __brand: 'amplify-session-storage' };
vi.mock('aws-amplify/utils', () => ({
  sessionStorage: amplifySessionStorageMock,
}));

// 旧バージョンが残した localStorage 上の Amplify キーの掃除
const cleanupLegacyAmplifyKeysMock = vi.fn();
vi.mock('../utils/auth', () => ({
  cleanupLegacyAmplifyKeys: cleanupLegacyAmplifyKeysMock,
}));

describe('configureAmplify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_COGNITO_USER_POOL_ID', 'us-east-1_testpool');
    vi.stubEnv('VITE_COGNITO_USER_POOL_CLIENT_ID', 'test-client-id');
  });

  it('Amplify.configure を呼び出す', async () => {
    const { configureAmplify } = await import('./amplify');
    configureAmplify();
    expect(configureMock).toHaveBeenCalledTimes(1);
  });

  it('cognitoUserPoolsTokenProvider にAmplify公式のsessionStorageを設定する', async () => {
    const { configureAmplify } = await import('./amplify');
    configureAmplify();

    expect(setKeyValueStorageMock).toHaveBeenCalledTimes(1);
    expect(setKeyValueStorageMock).toHaveBeenCalledWith(
      amplifySessionStorageMock
    );
  });

  it('Amplify.configure の後にトークンストレージを設定する（呼び出し順序）', async () => {
    const { configureAmplify } = await import('./amplify');
    const callOrder: string[] = [];
    configureMock.mockImplementation(() => callOrder.push('configure'));
    setKeyValueStorageMock.mockImplementation(() =>
      callOrder.push('setKeyValueStorage')
    );

    configureAmplify();

    expect(callOrder).toEqual(['configure', 'setKeyValueStorage']);
  });

  it('起動時に旧バージョンが残したlocalStorageのAmplifyキーを掃除する', async () => {
    const { configureAmplify } = await import('./amplify');
    configureAmplify();

    expect(cleanupLegacyAmplifyKeysMock).toHaveBeenCalledTimes(1);
  });
});
