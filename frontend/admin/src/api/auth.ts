// E2Eテスト時は空文字列を使用して相対パスにする（MSWは同一オリジンのリクエストをインターセプトできる）
const API_URL = import.meta.env.VITE_API_URL ?? '/api';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
  };
}

export interface APIError {
  message: string;
  statusCode?: number;
}

/**
 * ログインAPIを呼び出す
 */
export async function loginAPI(
  email: string,
  password: string
): Promise<LoginResponse> {
  try {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ message: 'ログインに失敗しました' }));
      const error: APIError = {
        message: errorData.message || 'ログインに失敗しました',
        statusCode: response.status,
      };
      throw error;
    }

    return response.json();
  } catch (error) {
    // ネットワークエラーまたはその他のエラーをハンドル
    if (
      error instanceof Error &&
      'message' in error &&
      !('statusCode' in error)
    ) {
      // ネットワークエラーの場合
      const apiError: APIError = {
        message: 'ネットワークエラーが発生しました。接続を確認してください。',
        statusCode: 0,
      };
      throw apiError;
    }
    // APIエラーの場合はそのまま re-throw
    throw error;
  }
}
