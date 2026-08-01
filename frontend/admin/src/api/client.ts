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
export const apiClient = axios.create({ baseURL: API_URL });

apiClient.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Cognito セッションから ID トークンを再取得する。
 * E2E (MSW) モードでは Amplify が構成されていないため常に null。
 */
const refreshAuthToken = async (): Promise<string | null> => {
  if (import.meta.env.VITE_ENABLE_MSW_MOCK === 'true') {
    return null;
  }
  const session = await fetchAuthSession({ forceRefresh: true });
  const idToken = session.tokens?.idToken?.toString();
  if (!idToken) {
    return null;
  }
  saveAuthToken(idToken);
  return idToken;
};

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retriedAfterRefresh?: boolean;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;
    if (
      error.response?.status === 401 &&
      config &&
      !config._retriedAfterRefresh
    ) {
      config._retriedAfterRefresh = true;
      try {
        const token = await refreshAuthToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
          return apiClient(config);
        }
      } catch {
        // リフレッシュ失敗はセッション失効として扱う
      }
      removeAuthToken();
      window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT));
    }
    return Promise.reject(error);
  }
);
