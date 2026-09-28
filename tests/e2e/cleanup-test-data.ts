#!/usr/bin/env bun
/**
 * `bun run cleanup:test-data` — [E2E-TEST] prefix の記事・カテゴリを DEV から
 * 手動で削除する CLI。
 *
 * Issue #737: 旧 `scripts/cleanup-test-data.js` は (1) ESM パッケージ内で
 * CommonJS のまま書かれていて起動せず、(2) prefix が `test-` で E2E の
 * `[E2E-TEST]` と一致せず、(3) posts テーブルしか見ずカテゴリを消せず、
 * (4) DynamoDB を直接叩くため Delete API を経由せずサイト再ビルドも
 * S3 画像掃除も起きなかった。
 *
 * この CLI は #731 で追加した `tests/e2e/utils/awsCleanup.ts` の
 * `cleanupE2ETestData` と、`global-teardown.ts` と同じ Cognito ログイン
 * (`tests/e2e/utils/adminAuth.ts`) をそのまま再利用する。API 経由なので
 * 公開記事の削除時にサイト再ビルドが走り、画像 (S3) の掃除も行われる。
 *
 * 環境変数 (global-teardown.ts / playwright.aws.config.ts と共通):
 * - CLEANUP_TARGET_ENV=dev  … 必須。dev 以外を対象にしないための明示的な許可。
 * - BASE_URL / ADMIN_BASE_URL … 対象サイトの URL。
 * - TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD … ログインする管理者アカウント。
 * - DEV_BASIC_AUTH_USERNAME / DEV_BASIC_AUTH_PASSWORD … DEV の CloudFront Basic 認証。
 * - VITE_API_BASE_URL … admin ベース URLからの API 解決に使う相対/絶対 URL (既定 /api)。
 *
 * 使い方:
 *   CLEANUP_TARGET_ENV=dev BASE_URL=https://dev.example.com \
 *     TEST_ADMIN_EMAIL=... TEST_ADMIN_PASSWORD=... \
 *     bun run cleanup:test-data              # 実際に削除
 *   ... bun run cleanup:test-data -- --dry-run   # 削除対象を表示するだけ (DELETE 発行なし)
 *
 * 資格情報 (メール・パスワード・トークン) はログに出さない。
 */

import { request } from '@playwright/test';
import {
  basicAuthFromEnv,
  obtainIdToken,
  resolveAdminBaseURL,
  resolveApiBase,
} from './utils/adminAuth';
import {
  assertCleanupTargetsDev,
  CleanupGuardError,
} from './utils/cleanupGuard';
import { runCleanup } from './utils/cleanupRunner';
import { E2E_TEST_PREFIX } from './utils/awsCleanup';

export interface CliArgs {
  dryRun: boolean;
  help: boolean;
}

export function parseArgs(argv: string[]): CliArgs {
  return {
    dryRun: argv.includes('--dry-run'),
    help: argv.includes('--help') || argv.includes('-h'),
  };
}

const HELP_TEXT = `bun run cleanup:test-data -- [--dry-run]

DEV に対して [E2E-TEST] prefix の記事・カテゴリを API 経由で削除します。

必須の環境変数:
  CLEANUP_TARGET_ENV=dev        対象が DEV であることの明示的な許可 (これ以外は拒否)
  BASE_URL                      対象サイトの URL (例: https://dev.example.com)
  TEST_ADMIN_EMAIL              ログインする管理者のメールアドレス
  TEST_ADMIN_PASSWORD           同パスワード

任意の環境変数:
  ADMIN_BASE_URL                admin SPA の URL (既定: \${BASE_URL}/admin)
  VITE_API_BASE_URL             admin ベース URL からの API 解決 (既定: /api)
  DEV_BASIC_AUTH_USERNAME/PASSWORD  DEV の CloudFront Basic 認証

オプション:
  --dry-run   削除せず、対象になる記事・カテゴリ名を表示するだけ
  --help      このヘルプを表示
`;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP_TEXT);
    return;
  }

  const adminBaseURL = resolveAdminBaseURL();

  // ガードはネットワーク呼び出しより前、同期的に行う。
  try {
    assertCleanupTargetsDev({
      targetEnv: process.env.CLEANUP_TARGET_ENV,
      baseURL: adminBaseURL,
    });
  } catch (error) {
    if (error instanceof CleanupGuardError) {
      console.error(`❌ ${error.message}`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }

  const email = process.env.TEST_ADMIN_EMAIL;
  const password = process.env.TEST_ADMIN_PASSWORD;
  if (!email || !password) {
    console.error(
      '❌ TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD must be set. Refusing to run.'
    );
    process.exitCode = 1;
    return;
  }

  const apiBase = resolveApiBase(adminBaseURL);
  console.log(
    `🧹 cleanup:test-data (${args.dryRun ? 'dry-run' : 'live'}) — target: ${adminBaseURL}`
  );
  console.log(`   prefix: ${E2E_TEST_PREFIX}`);

  const idToken = await obtainIdToken(adminBaseURL, email, password, {
    basicAuth: basicAuthFromEnv(),
  });
  if (!idToken) {
    console.error(
      '❌ Could not authenticate (login did not reach the dashboard; wrong ' +
        'credentials or an MFA/TOTP challenge is likely). Aborting.'
    );
    process.exitCode = 1;
    return;
  }

  const http = await request.newContext();
  try {
    const report = await runCleanup({
      http,
      apiBase,
      idToken,
      dryRun: args.dryRun,
    });
    const verb = report.dryRun ? 'Would delete' : 'Deleted';
    for (const title of report.posts) {
      console.log(`  ✅ ${verb}: ${title}`);
    }
    for (const name of report.categories) {
      console.log(`  ✅ ${verb} category: ${name}`);
    }
    if (report.posts.length + report.categories.length === 0) {
      console.log('✅ No test data found');
    }
    if (report.failures.length > 0) {
      console.warn(
        `⚠️  ${report.failures.length} deletion(s) failed: ${report.failures.join(', ')}`
      );
      process.exitCode = 1;
    }
  } finally {
    await http.dispose();
  }
}

// bun tests/e2e/cleanup-test-data.ts として直接実行された場合のみ main() を呼ぶ。
// テストからの import では実行しない (Bun.main と一致するかで判定)。
if (import.meta.main) {
  main().catch((error) => {
    console.error('❌ cleanup:test-data failed:', error);
    process.exitCode = 1;
  });
}
