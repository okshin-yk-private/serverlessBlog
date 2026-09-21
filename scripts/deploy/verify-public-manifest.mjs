// Independent publisher gate. Run with Node, without loading the deployment SDK.
import process from 'node:process';
import console from 'node:console';
import { setTimeout, clearTimeout } from 'node:timers';
import { URL } from 'node:url';

process.exitCode = 1;
const deadline = setTimeout(() => {
  console.error('Public manifest verification deadline exceeded');
  process.exit(1);
}, 15_000);

try {
  const [siteUrl, revision] = process.argv.slice(2);
  const origin = new URL(siteUrl);
  if (
    process.argv.length !== 4 ||
    origin.protocol !== 'https:' ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash ||
    !/^r\d+(?:-[a-z0-9][a-z0-9._-]*)?$/.test(revision)
  ) {
    throw new Error('Invalid public origin or revision');
  }

  const headers = { 'cache-control': 'no-cache' };
  const user = process.env.SITE_VERIFY_BASIC_USER;
  const password = process.env.SITE_VERIFY_BASIC_PASSWORD;
  if (user && password) {
    headers.authorization = `Basic ${globalThis.Buffer.from(`${user}:${password}`).toString('base64')}`;
  }
  const response = await globalThis.fetch(
    new URL('/release-manifest.json', origin),
    {
      headers,
      redirect: 'error',
      signal: globalThis.AbortSignal.timeout(10_000),
    }
  );
  if (response.status !== 200) {
    await response.body?.cancel();
    throw new Error('Manifest is unavailable');
  }
  const manifest = await response.json();
  if (
    manifest.schemaVersion !== 1 ||
    manifest.revision !== revision ||
    !Array.isArray(manifest.files) ||
    manifest.files.length === 0
  ) {
    throw new Error('Manifest does not identify the expected release');
  }
  console.log(`Public manifest confirmed: ${revision}`);
  process.exitCode = 0;
} catch {
  // Fetch errors may carry credentials. Do not log the error object.
  console.error(
    'Public manifest verification failed; deployment completion is unconfirmed'
  );
} finally {
  clearTimeout(deadline);
}
