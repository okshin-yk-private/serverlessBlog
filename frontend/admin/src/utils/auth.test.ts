import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  validateEmail,
  validatePassword,
  saveAuthToken,
  getAuthToken,
  removeAuthToken,
  isTokenExpired,
  decodeToken,
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

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('saveAuthToken', () => {
    it('トークンをlocalStorageに保存できる', () => {
      saveAuthToken(testToken);
      expect(localStorage.getItem('auth_token')).toBe(testToken);
    });

    it('既存のトークンを上書きできる', () => {
      saveAuthToken('old-token');
      saveAuthToken(testToken);
      expect(localStorage.getItem('auth_token')).toBe(testToken);
    });
  });

  describe('getAuthToken', () => {
    it('保存されたトークンを取得できる', () => {
      localStorage.setItem('auth_token', testToken);
      expect(getAuthToken()).toBe(testToken);
    });

    it('トークンが存在しない場合はnullを返す', () => {
      expect(getAuthToken()).toBeNull();
    });
  });

  describe('removeAuthToken', () => {
    it('トークンを削除できる', () => {
      localStorage.setItem('auth_token', testToken);
      removeAuthToken();
      expect(localStorage.getItem('auth_token')).toBeNull();
    });

    it('トークンが存在しない場合でもエラーにならない', () => {
      expect(() => removeAuthToken()).not.toThrow();
    });
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
