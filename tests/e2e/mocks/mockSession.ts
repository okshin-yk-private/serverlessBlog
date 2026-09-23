/**
 * モックJWTトークンを生成（有効期限付き）
 */
export const createMockJWT = (): string => {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const exp = Math.floor(Date.now() / 1000) + 3600; // 1時間後に有効期限
  const payload = btoa(
    JSON.stringify({
      sub: 'user-123',
      email: 'admin@example.com',
      exp,
    })
  );
  const signature = 'mock-signature';
  return `${header}.${payload}.${signature}`;
};
