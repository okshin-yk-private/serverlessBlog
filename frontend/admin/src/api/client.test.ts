import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { fetchAuthSession } from 'aws-amplify/auth';
import * as authUtils from '../utils/auth';
import { apiClient, AUTH_SESSION_EXPIRED_EVENT } from './client';

vi.mock('aws-amplify/auth', () => ({
  fetchAuthSession: vi.fn(),
}));
vi.mock('../utils/auth');

const mockedFetchAuthSession = vi.mocked(fetchAuthSession);
const mockedGetAuthToken = vi.mocked(authUtils.getAuthToken);
const mockedSaveAuthToken = vi.mocked(authUtils.saveAuthToken);
const mockedRemoveAuthToken = vi.mocked(authUtils.removeAuthToken);

/**
 * axios のアダプタを差し替えて、インターセプタを含む
 * リクエストパイプライン全体を実際に通して検証する。
 */
const createAdapter = (
  ...statuses: Array<{ status: number; data?: unknown }>
) => {
  let call = 0;
  return vi.fn((config: InternalAxiosRequestConfig) => {
    const { status, data } = statuses[Math.min(call, statuses.length - 1)];
    call += 1;
    const response = {
      data: data ?? {},
      status,
      statusText: String(status),
      headers: {},
      config,
    };
    // 実際のアダプタと同様に、エラーステータスは AxiosError で reject する
    if (status >= 200 && status < 300) {
      return Promise.resolve(response);
    }
    return Promise.reject(
      new AxiosError(
        `Request failed with status code ${status}`,
        AxiosError.ERR_BAD_REQUEST,
        config,
        undefined,
        response as never
      )
    );
  });
};

const mockSession = (idToken: string | undefined) => {
  mockedFetchAuthSession.mockResolvedValue({
    tokens: idToken
      ? ({ idToken: { toString: () => idToken } } as never)
      : undefined,
  } as never);
};

describe('apiClient', () => {
  let sessionExpiredListener: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetAuthToken.mockReturnValue('initial-token');
    sessionExpiredListener = vi.fn();
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, sessionExpiredListener);
  });

  afterEach(() => {
    window.removeEventListener(
      AUTH_SESSION_EXPIRED_EVENT,
      sessionExpiredListener
    );
  });

  it('リクエストに Authorization ヘッダーを自動付与する', async () => {
    const adapter = createAdapter({ status: 200 });
    apiClient.defaults.adapter = adapter;

    await apiClient.get('/admin/posts');

    const config = adapter.mock.calls[0][0];
    expect(config.headers.Authorization).toBe('Bearer initial-token');
  });

  it('トークンがない場合は Authorization ヘッダーを付けない', async () => {
    mockedGetAuthToken.mockReturnValue(null);
    const adapter = createAdapter({ status: 200 });
    apiClient.defaults.adapter = adapter;

    await apiClient.get('/categories');

    const config = adapter.mock.calls[0][0];
    expect(config.headers.Authorization).toBeUndefined();
  });

  it('401 受信時はトークンを再取得して1回だけリトライする', async () => {
    const adapter = createAdapter(
      { status: 401 },
      { status: 200, data: { ok: true } }
    );
    apiClient.defaults.adapter = adapter;
    mockSession('refreshed-token');
    // saveAuthToken 後は getAuthToken が新トークンを返す（実際のストアと同じ挙動）
    let storedToken = 'initial-token';
    mockedGetAuthToken.mockImplementation(() => storedToken);
    mockedSaveAuthToken.mockImplementation((token) => {
      storedToken = token;
    });

    const response = await apiClient.get('/admin/posts');

    expect(response.data).toEqual({ ok: true });
    expect(mockedFetchAuthSession).toHaveBeenCalledWith({ forceRefresh: true });
    expect(mockedSaveAuthToken).toHaveBeenCalledWith('refreshed-token');
    expect(adapter).toHaveBeenCalledTimes(2);
    const retryConfig = adapter.mock.calls[1][0];
    expect(retryConfig.headers.Authorization).toBe('Bearer refreshed-token');
    expect(sessionExpiredListener).not.toHaveBeenCalled();
  });

  it('リフレッシュでトークンが得られない場合はセッション失効として扱う', async () => {
    const adapter = createAdapter({ status: 401 });
    apiClient.defaults.adapter = adapter;
    mockSession(undefined);

    await expect(apiClient.get('/admin/posts')).rejects.toMatchObject({
      response: { status: 401 },
    });

    expect(mockedRemoveAuthToken).toHaveBeenCalled();
    expect(sessionExpiredListener).toHaveBeenCalledTimes(1);
    expect(adapter).toHaveBeenCalledTimes(1);
  });

  it('リフレッシュ自体が失敗した場合もセッション失効として扱う', async () => {
    const adapter = createAdapter({ status: 401 });
    apiClient.defaults.adapter = adapter;
    mockedFetchAuthSession.mockRejectedValue(new Error('refresh failed'));

    await expect(apiClient.get('/admin/posts')).rejects.toMatchObject({
      response: { status: 401 },
    });

    expect(mockedRemoveAuthToken).toHaveBeenCalled();
    expect(sessionExpiredListener).toHaveBeenCalledTimes(1);
  });

  it('リトライ後も 401 の場合は再リフレッシュせずエラーを返す', async () => {
    const adapter = createAdapter({ status: 401 }, { status: 401 });
    apiClient.defaults.adapter = adapter;
    mockSession('refreshed-token');

    await expect(apiClient.get('/admin/posts')).rejects.toMatchObject({
      response: { status: 401 },
    });

    expect(mockedFetchAuthSession).toHaveBeenCalledTimes(1);
    expect(adapter).toHaveBeenCalledTimes(2);
  });

  it('401 以外のエラーはリフレッシュせずそのまま返す', async () => {
    const adapter = createAdapter({
      status: 500,
      data: { message: 'server error' },
    });
    apiClient.defaults.adapter = adapter;

    await expect(apiClient.get('/admin/posts')).rejects.toMatchObject({
      response: { status: 500 },
    });

    expect(mockedFetchAuthSession).not.toHaveBeenCalled();
    expect(sessionExpiredListener).not.toHaveBeenCalled();
  });
});
