#!/usr/bin/env node
/**
 * ビルド成果物の検証
 *
 * 管理画面は、ビルドが成功していても実行時に認証が全滅する壊れ方を 2 通りする。
 * どちらもデプロイ後にブラウザで触るまで気付けないため、成果物を直接検査する。
 *
 * 1. Cognito 設定の埋め込み漏れ
 *    Vite は VITE_* をビルド時に埋め込む。未設定のままビルドすると
 *    Amplify.configure() に undefined が渡り、実行時に
 *    "AuthUserPoolException: Auth UserPool not configured" になる。
 *
 * 2. Amplify シングルトンの重複
 *    Amplify は @aws-amplify/core のモジュールスコープに設定を保持する。
 *    パッケージマネージャがネストして複製を入れると、バンドルに複数の
 *    インスタンスが入り、configure() したインスタンスと auth が参照する
 *    インスタンスがずれて同じエラーになる (vite.config.ts の resolve.dedupe で対策)。
 *
 * Usage: node scripts/verify-bundle.mjs [distDir]
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// @aws-amplify/core のシングルトンが未設定時に出す文言。
// 1 バンドルにつき 1 回だけ現れるはずで、複数あればコピーが複数含まれている。
const SINGLETON_MARKER = 'Amplify has not been configured';

const distDir = process.argv[2] ?? 'dist';
const assetsDir = join(distDir, 'assets');

const fail = (message, ...details) => {
  console.error(`✗ ${message}`);
  for (const line of details) console.error(`  ${line}`);
  process.exit(1);
};

if (!existsSync(assetsDir)) {
  fail(`Assets directory not found: ${assetsDir}`, 'Run the build first.');
}

const jsFiles = readdirSync(assetsDir).filter((f) => f.endsWith('.js'));
if (jsFiles.length === 0) {
  fail(`No JavaScript bundles found in ${assetsDir}`);
}

const bundles = jsFiles.map((name) => ({
  name,
  source: readFileSync(join(assetsDir, name), 'utf8'),
}));

// --- 1. Cognito 設定の埋め込み ---------------------------------------------
const poolId = process.env.VITE_COGNITO_USER_POOL_ID;
const clientId = process.env.VITE_COGNITO_USER_POOL_CLIENT_ID;

if (!poolId || !clientId) {
  fail(
    'VITE_COGNITO_USER_POOL_ID / VITE_COGNITO_USER_POOL_CLIENT_ID are not set',
    'These are embedded at build time. Without them, login and password reset',
    'fail at runtime with "Auth UserPool not configured".'
  );
}

for (const [label, value] of [
  ['User Pool ID', poolId],
  ['User Pool Client ID', clientId],
]) {
  if (!bundles.some((b) => b.source.includes(value))) {
    fail(
      `Cognito ${label} is missing from the built bundle`,
      `Expected to find: ${value}`,
      'The build did not pick up the environment variable.'
    );
  }
}

// --- 2. Amplify シングルトンの重複 ------------------------------------------
let markerTotal = 0;
for (const bundle of bundles) {
  const count = bundle.source.split(SINGLETON_MARKER).length - 1;
  markerTotal += count;
  if (count > 1) {
    fail(
      `Multiple Amplify core instances found in ${bundle.name} (${count})`,
      'Amplify.configure() would configure a different instance than the one',
      'aws-amplify/auth reads, breaking all authentication at runtime.',
      'Check resolve.dedupe in vite.config.ts and for duplicated',
      '@aws-amplify/core copies under node_modules.'
    );
  }
}

if (markerTotal === 0) {
  fail(
    'Could not locate the Amplify singleton marker in the bundle',
    `Marker: "${SINGLETON_MARKER}"`,
    'Amplify likely changed this message on upgrade. Update SINGLETON_MARKER',
    'in this script so the duplicate-instance check keeps working.'
  );
}

console.log('✓ Bundle verified: Cognito config embedded, single Amplify instance');
