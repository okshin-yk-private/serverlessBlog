import { describe, expect, test } from 'bun:test';
import {
  assertCleanupTargetsDev,
  CleanupGuardError,
  KNOWN_PRODUCTION_HOSTNAME,
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

  test('refuses the known production domain even if CLEANUP_TARGET_ENV=dev', () => {
    expect(() =>
      assertCleanupTargetsDev({
        targetEnv: 'dev',
        baseURL: `https://${KNOWN_PRODUCTION_HOSTNAME}/admin/`,
      })
    ).toThrow(CleanupGuardError);
  });

  test('refuses subdomains of the production domain such as www', () => {
    expect(() =>
      assertCleanupTargetsDev({
        targetEnv: 'dev',
        baseURL: `https://www.${KNOWN_PRODUCTION_HOSTNAME}/admin/`,
      })
    ).toThrow(CleanupGuardError);
  });

  test('does not treat a lookalike domain of the prod host as prod', () => {
    // 本番ドメインとそのサブドメインだけを禁止し、`notboneofmyfallacy.net` のような
    // 無関係なドメインを誤って拒否しない (positive-allow は CLEANUP_TARGET_ENV 側が担う)。
    expect(() =>
      assertCleanupTargetsDev({
        targetEnv: 'dev',
        baseURL: 'https://notboneofmyfallacy.net/admin/',
      })
    ).not.toThrow();
  });

  test('refuses an invalid BASE_URL', () => {
    expect(() =>
      assertCleanupTargetsDev({ targetEnv: 'dev', baseURL: 'not a url' })
    ).toThrow(CleanupGuardError);
  });
});
