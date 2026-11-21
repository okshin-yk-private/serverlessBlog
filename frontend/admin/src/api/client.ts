import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { fetchAuthSession } from 'aws-amplify/auth';
import { getAuthToken, saveAuthToken, removeAuthToken } from '../utils/auth';

// E2Eテスト時は空文字列を使用して相対パスにする（MSWは同一オリジンのリクエストをインターセプトできる）
const API_URL = import.meta.env.VITE_API_URL ?? '/api';

/**
 * セッション失効時に window へ発火するイベント名。
 * AuthContext が購読して認証状態をクリアし、AuthGuard 経由で /login へ遷移させる。
 */
export const AUTH_SESSION_EXPIRED_EVENT = 'auth:session-expired';

/**
 * 管理画面 API 共通クライアント
 *
 * - リクエスト時に Authorization ヘッダーを自動付与
 * - 401 受信時は Cognito セッションからトークンを再取得して1回だけリトライ
 * - 再取得できない場合はトークンを破棄し AUTH_SESSION_EXPIRED_EVENT を発火
 */
export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 30_000,
});

/**
 * 認証セッション世代。ログアウトや再ログインのたびにインクリメントし、
 * 旧セッションで発火した 401 リフレッシュ／リトライが新セッションへ干渉するのを防ぐ。
 */
let authSessionGeneration = 0;

export const advanceAuthSessionGeneration = (): number => {
  authSessionGeneration += 1;
  inFlightRefresh = null;
  return authSessionGeneration;
};

export const getAuthSessionGeneration = (): number => authSessionGeneration;

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retriedAfterRefresh?: boolean;
  _authGeneration?: number;
}

apiClient.interceptors.request.use((config) => {
  (config as RetriableConfig)._authGeneration = authSessionGeneration;
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Cognito セッションから ID トークンを再取得する。
 * E2E (MSW) モードでは Amplify が構成されていないため常に null。
 * 並列 401 受信時の競合（重複リフレッシュ・誤ログアウト）を防ぐため single-flight 化する。
 */
let inFlightRefresh: {
  generation: number;
  promise: Promise<string | null>;
} | null = null;

const refreshAuthToken = async (
  expectedGeneration: number
): Promise<string | null> => {
  if (import.meta.env.VITE_ENABLE_MSW_MOCK === 'true') {
    return null;
  }
  if (!inFlightRefresh || inFlightRefresh.generation !== expectedGeneration) {
    const promise = (async () => {
      const session = await fetchAuthSession({ forceRefresh: true });
      if (authSessionGeneration !== expectedGeneration) {
        return null;
      }
      const idToken = session.tokens?.idToken?.toString();
      if (!idToken) {
        return null;
      }
      saveAuthToken(idToken);
      return idToken;
    })().finally(() => {
      if (inFlightRefresh?.generation === expectedGeneration) {
        inFlightRefresh = null;
      }
    });
    inFlightRefresh = { generation: expectedGeneration, promise };
  }
  return inFlightRefresh.promise;
};

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;
    if (
      error.response?.status === 401 &&
      config &&
      !config._retriedAfterRefresh
    ) {
      const requestGeneration = config._authGeneration ?? authSessionGeneration;
      if (requestGeneration !== authSessionGeneration) {
        return Promise.reject(error);
      }
      config._retriedAfterRefresh = true;
      try {
        const token = await refreshAuthToken(requestGeneration);
        if (requestGeneration !== authSessionGeneration) {
          return Promise.reject(error);
        }
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
          return apiClient(config);
        }
      } catch {
        if (requestGeneration !== authSessionGeneration) {
          return Promise.reject(error);
        }
        // リフレッシュ失敗はセッション失効として扱う
      }
      removeAuthToken();
      window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT));
    }
    return Promise.reject(error);
  }
);
