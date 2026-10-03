import { describe, expect, test } from 'bun:test';
import {
  assertCleanupTargetsDev,
  CleanupGuardError,
  KNOWN_PRODUCTION_HOSTNAMES,
} from '../e2e/utils/cleanupGuard';

// Issue #737: scripts/cleanup-test-data.js は起動せず、起動しても
// [E2E-TEST] データを検出できなかった。置き換え後の CLI は API 経由の
// cleanupE2ETestData を呼ぶため、対象が誤って prd にならないことを
// ネットワーク呼び出しの前に保証するガードが要る。

describe('assertCleanupTargetsDev', () => {
  test('allows a dev target with CLEANUP_TARGET_ENV=dev', () => {
    expect(() =>
      assertCleanupTargetsDev({
        targetEnv: 'dev',
        baseURL: 'https://d111111abcdef8.cloudfront.net/admin/',
      })
    ).not.toThrow();
  });

  test('allows localhost with CLEANUP_TARGET_ENV=dev', () => {
    expect(() =>
      assertCleanupTargetsDev({
        targetEnv: 'dev',
        baseURL: 'http://localhost:5173/admin/',
      })
    ).not.toThrow();
  });

  test('refuses when CLEANUP_TARGET_ENV is unset', () => {
    expect(() =>
      assertCleanupTargetsDev({
        targetEnv: undefined,
        baseURL: 'https://d111111abcdef8.cloudfront.net/admin/',
      })
    ).toThrow(CleanupGuardError);
  });

  test('refuses when CLEANUP_TARGET_ENV is set but not "dev"', () => {
    for (const targetEnv of ['prod', 'prd', 'production', 'Dev', 'DEV', '']) {
      expect(() =>
        assertCleanupTargetsDev({
          targetEnv,
          baseURL: 'https://d111111abcdef8.cloudfront.net/admin/',
        })
      ).toThrow(CleanupGuardError);
    }
  });

  test('lists exactly the hostnames prd serves (apex and www)', () => {
    // terraform/environments/prd/main.tf: domain_names = [domain_name, "www.${domain_name}"]
    expect([...KNOWN_PRODUCTION_HOSTNAMES].sort()).toEqual([
      'boneofmyfallacy.net',
      'www.boneofmyfallacy.net',
    ]);
  });

  test('refuses the prd apex even if CLEANUP_TARGET_ENV=dev', () => {
    expect(() =>
      assertCleanupTargetsDev({
        targetEnv: 'dev',
        baseURL: 'https://boneofmyfallacy.net/admin/',
      })
    ).toThrow(CleanupGuardError);
  });

  test('refuses the prd www host even if CLEANUP_TARGET_ENV=dev', () => {
    expect(() =>
      assertCleanupTargetsDev({
        targetEnv: 'dev',
        baseURL: 'https://www.boneofmyfallacy.net/admin/',
      })
    ).toThrow(CleanupGuardError);
  });

  test('refuses prd hosts regardless of case, port or a trailing FQDN dot', () => {
    for (const baseURL of [
      'https://BoneOfMyFallacy.NET/admin/',
      'https://www.boneofmyfallacy.net:443/admin/',
      'https://boneofmyfallacy.net./admin/',
      'https://www.boneofmyfallacy.net./admin/',
    ]) {
      expect(() =>
        assertCleanupTargetsDev({ targetEnv: 'dev', baseURL })
      ).toThrow(CleanupGuardError);
    }
  });

  test('allows the DEV host, which is a subdomain of the prd apex', () => {
    // DEV は https://dev.boneofmyfallacy.net で配信される
    // (SSM /serverless-blog/dev/cdn/public-url)。サフィックス一致で拒否していた回帰を防ぐ。
    expect(() =>
      assertCleanupTargetsDev({
        targetEnv: 'dev',
        baseURL: 'https://dev.boneofmyfallacy.net/admin/',
      })
    ).not.toThrow();
  });

  test('does not treat an unrelated or lookalike host as prod', () => {
    // 本番ホスト名だけを禁止し、無関係なドメインを誤って拒否しない
    // (positive-allow は CLEANUP_TARGET_ENV 側が担う)。
    for (const baseURL of [
      'https://notboneofmyfallacy.net/admin/',
      'https://boneofmyfallacy.net.example.com/admin/',
      'https://example.com/admin/',
    ]) {
      expect(() =>
        assertCleanupTargetsDev({ targetEnv: 'dev', baseURL })
      ).not.toThrow();
    }
  });

  test('refuses an invalid BASE_URL', () => {
    expect(() =>
      assertCleanupTargetsDev({ targetEnv: 'dev', baseURL: 'not a url' })
    ).toThrow(CleanupGuardError);
  });
});
