import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  validateEmail,
  validatePassword,
  saveAuthToken,
  getAuthToken,
  removeAuthToken,
  isTokenExpired,
  decodeToken,
  migrateFromLocalStorage,
  cleanupLegacyAmplifyKeys,
} from './auth';

describe('validateEmail', () => {
  it('有効なメールアドレスの場合はnullを返す', () => {
    expect(validateEmail('test@example.com')).toBeNull();
    expect(validateEmail('user.name+tag@example.co.jp')).toBeNull();
    expect(validateEmail('test123@test-domain.com')).toBeNull();
  });

  it('空文字列の場合はエラーメッセージを返す', () => {
    expect(validateEmail('')).toBe('メールアドレスは必須です');
  });

  it('スペースのみの場合はエラーメッセージを返す', () => {
    expect(validateEmail('   ')).toBe('メールアドレスは必須です');
  });

  it('無効なメールアドレス形式の場合はエラーメッセージを返す', () => {
    expect(validateEmail('invalid-email')).toBe(
      '有効なメールアドレスを入力してください'
    );
    expect(validateEmail('test@')).toBe(
      '有効なメールアドレスを入力してください'
    );
    expect(validateEmail('@example.com')).toBe(
      '有効なメールアドレスを入力してください'
    );
    expect(validateEmail('test @example.com')).toBe(
      '有効なメールアドレスを入力してください'
    );
  });
});

describe('validatePassword', () => {
  it('有効なパスワードの場合はnullを返す', () => {
    expect(validatePassword('password123')).toBeNull();
    expect(validatePassword('12345678')).toBeNull();
    expect(validatePassword('verylongpassword1234567890')).toBeNull();
  });

  it('空文字列の場合はエラーメッセージを返す', () => {
    expect(validatePassword('')).toBe('パスワードは必須です');
  });

  it('スペースのみの場合はエラーメッセージを返す', () => {
    expect(validatePassword('   ')).toBe('パスワードは必須です');
  });

  it('8文字未満の場合はエラーメッセージを返す', () => {
    expect(validatePassword('short')).toBe(
      'パスワードは8文字以上で入力してください'
    );
    expect(validatePassword('1234567')).toBe(
      'パスワードは8文字以上で入力してください'
    );
  });

  it('8文字ちょうどの場合はnullを返す', () => {
    expect(validatePassword('12345678')).toBeNull();
  });
});

describe('Token管理', () => {
  const testToken = 'test-jwt-token-12345';
  const SESSION_TOKEN_KEY = 'auth_session_token';

  beforeEach(() => {
    // メモリとストレージの両方をクリア
    removeAuthToken();
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    removeAuthToken();
    sessionStorage.clear();
    localStorage.clear();
  });

  describe('saveAuthToken', () => {
    it('トークンをsessionStorageに保存できる（セキュリティ向上）', () => {
      saveAuthToken(testToken);
      expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBe(testToken);
      // localStorageには保存されないことを確認
      expect(localStorage.getItem('auth_token')).toBeNull();
    });

    it('既存のトークンを上書きできる', () => {
      saveAuthToken('old-token');
      saveAuthToken(testToken);
      expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBe(testToken);
    });
  });

  describe('getAuthToken', () => {
    it('保存されたトークンを取得できる', () => {
      saveAuthToken(testToken);
      expect(getAuthToken()).toBe(testToken);
    });

    it('トークンが存在しない場合はnullを返す', () => {
      expect(getAuthToken()).toBeNull();
    });

    it('sessionStorageからリストアできる（ページリロード時）', () => {
      // sessionStorageに直接保存（ページリロードをシミュレート）
      sessionStorage.setItem(SESSION_TOKEN_KEY, testToken);
      // メモリをクリア（モジュールの状態をシミュレートするため removeAuthToken は使わない）
      // Note: 実際のリロード時はモジュールが再読み込みされるのでメモリはクリアされる
      expect(getAuthToken()).toBe(testToken);
    });
  });

  describe('removeAuthToken', () => {
    it('トークンを削除できる', () => {
      saveAuthToken(testToken);
      removeAuthToken();
      expect(sessionStorage.getItem(SESSION_TOKEN_KEY)).toBeNull();
      expect(getAuthToken()).toBeNull();
    });

    it('トークンが存在しない場合でもエラーにならない', () => {
      expect(() => removeAuthToken()).not.toThrow();
    });
  });

  describe('migrateFromLocalStorage', () => {
    it('localStorageからsessionStorageにトークンを移行できる', () => {
      const legacyToken = 'legacy-token-from-localstorage';
      localStorage.setItem('auth_token', legacyToken);

      migrateFromLocalStorage();

      // sessionStorageに移行されている
      expect(getAuthToken()).toBe(legacyToken);
      // localStorageからは削除されている
      expect(localStorage.getItem('auth_token')).toBeNull();
    });

    it('localStorageにトークンがない場合は何もしない', () => {
      expect(() => migrateFromLocalStorage()).not.toThrow();
      expect(getAuthToken()).toBeNull();
    });
  });
});

describe('cleanupLegacyAmplifyKeys', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('CognitoIdentityServiceProvider.で始まるキーのみをlocalStorageから削除する', () => {
    localStorage.setItem(
      'CognitoIdentityServiceProvider.clientid.username.idToken',
      'legacy-id-token'
    );
    localStorage.setItem(
      'CognitoIdentityServiceProvider.clientid.username.refreshToken',
      'legacy-refresh-token'
    );
    localStorage.setItem(
      'CognitoIdentityServiceProvider.clientid.LastAuthUser',
      'username'
    );
    localStorage.setItem('theme', 'dark');
    localStorage.setItem('auth_token', 'app-own-token');

    cleanupLegacyAmplifyKeys();

    expect(
      localStorage.getItem(
        'CognitoIdentityServiceProvider.clientid.username.idToken'
      )
    ).toBeNull();
    expect(
      localStorage.getItem(
        'CognitoIdentityServiceProvider.clientid.username.refreshToken'
      )
    ).toBeNull();
    expect(
      localStorage.getItem(
        'CognitoIdentityServiceProvider.clientid.LastAuthUser'
      )
    ).toBeNull();
    // 無関係なキーは削除されない
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(localStorage.getItem('auth_token')).toBe('app-own-token');
  });

  it('該当するキーが存在しない場合は何もしない', () => {
    localStorage.setItem('theme', 'light');

    expect(() => cleanupLegacyAmplifyKeys()).not.toThrow();
    expect(localStorage.getItem('theme')).toBe('light');
  });

  it('localStorageへのアクセスが例外を投げても呼び出し元にエラーを伝播しない', () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(
      window,
      'localStorage'
    );
    Object.defineProperty(window, 'localStorage', {
      value: {
        get length(): number {
          throw new DOMException('SecurityError');
        },
        key: () => {
          throw new DOMException('SecurityError');
        },
        getItem: () => {
          throw new DOMException('SecurityError');
        },
        removeItem: () => {
          throw new DOMException('SecurityError');
        },
      },
      configurable: true,
    });

    try {
      expect(() => cleanupLegacyAmplifyKeys()).not.toThrow();
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(window, 'localStorage', originalDescriptor);
      }
    }
  });
});

describe('JWT関連ユーティリティ', () => {
  describe('decodeToken', () => {
    it('有効なJWTトークンをデコードできる', () => {
      // Base64エンコードされたJWTペイロード（exp: 未来の日時）
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600; // 1時間後
      const payload = {
        sub: 'user-123',
        email: 'test@example.com',
        exp: futureTimestamp,
      };
      const encodedPayload = btoa(JSON.stringify(payload));
      const token = `header.${encodedPayload}.signature`;

      const decoded = decodeToken(token);
      expect(decoded).toEqual(payload);
    });

    it('無効なトークン形式の場合はnullを返す', () => {
      expect(decodeToken('invalid-token')).toBeNull();
      expect(decodeToken('only.two')).toBeNull();
      expect(decodeToken('')).toBeNull();
    });

    it('デコードできないペイロードの場合はnullを返す', () => {
      const token = 'header.invalid-base64.signature';
      expect(decodeToken(token)).toBeNull();
    });
  });

  describe('isTokenExpired', () => {
    it('有効期限内のトークンの場合はfalseを返す', () => {
      const futureTimestamp = Math.floor(Date.now() / 1000) + 3600; // 1時間後
      const payload = { exp: futureTimestamp };
      const encodedPayload = btoa(JSON.stringify(payload));
      const token = `header.${encodedPayload}.signature`;

      expect(isTokenExpired(token)).toBe(false);
    });

    it('有効期限切れのトークンの場合はtrueを返す', () => {
      const pastTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1時間前
      const payload = { exp: pastTimestamp };
      const encodedPayload = btoa(JSON.stringify(payload));
      const token = `header.${encodedPayload}.signature`;

      expect(isTokenExpired(token)).toBe(true);
    });

    it('expフィールドが存在しない場合はtrueを返す', () => {
      const payload = { sub: 'user-123' };
      const encodedPayload = btoa(JSON.stringify(payload));
      const token = `header.${encodedPayload}.signature`;

      expect(isTokenExpired(token)).toBe(true);
    });

    it('無効なトークンの場合はtrueを返す', () => {
      expect(isTokenExpired('invalid-token')).toBe(true);
      expect(isTokenExpired('')).toBe(true);
    });
  });
});

// UTF-8 / Base64URL fixtures independent of the browser decoder under test.
const encodeJwt = (payload: unknown): string => {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const encoded = btoa(
    Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')
  )
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `header.${encoded}.signature`;
};

describe('JWT Base64URL と追加クレームの互換性', () => {
  afterEach(() => vi.useRealTimers());

  it('Base64URL 固有の文字と UTF-8 を正しく復元する', () => {
    const payload = { name: '例😀 🌿', exp: 2000000000 };
    const token = encodeJwt(payload);
    expect(token.split('.')[1]).toContain('-');
    expect(token.split('.')[1]).toContain('_');
    expect(decodeToken(token)).toEqual(payload);
  });

  it.each(['a', 'ab', 'abc'])('パディングなしの各長さを扱う: %s', (sub) => {
    const payload = { sub };
    expect(decodeToken(encodeJwt(payload))).toEqual(payload);
  });

  it.each([{ amr: ['pwd'] }, { amr: ['pwd', 'otp', 'mfa'] }])(
    '追加クレームと配列を保持する: %j',
    ({ amr }) => {
      const payload = {
        sub: 'user-123',
        acr: 'urn:cognito:loa:4',
        amr,
        future_claim: { values: [1, true, '日本語'], optional: null },
      };
      expect(decodeToken(encodeJwt(payload))).toEqual(payload);
    }
  );

  it.each([null, [], 'text', 123, true].map((payload) => ({ payload })))(
    'JSON オブジェクト以外を拒否する: %j',
    ({ payload }) => {
      expect(decodeToken(encodeJwt(payload))).toBeNull();
    }
  );

  it.each(['', 'a', '%%%', 'eyJzdWIiOiL/In0', 'bm90LWpzb24'])(
    '不正なペイロードを拒否する: %s',
    (payload) => {
      expect(decodeToken(`header.${payload}.signature`)).toBeNull();
    }
  );

  it.each([-1, 0, 1])(
    '追加クレーム付きでも期限を判定する: 差分 %i 秒',
    (offset) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-17T00:00:00Z'));
      const payload = {
        exp: Date.now() / 1000 + offset,
        name: '例😀 🌿',
        acr: 'urn:cognito:loa:4',
        amr: ['pwd', 'otp', 'mfa'],
      };
      expect(isTokenExpired(encodeJwt(payload))).toBe(offset <= 0);
    }
  );

  it.each([undefined, null, '2000000000', {}, []].map((exp) => ({ exp })))(
    '不正または欠落した exp は期限切れ扱い: %j',
    ({ exp }) => {
      expect(isTokenExpired(encodeJwt({ exp }))).toBe(true);
    }
  );
});
