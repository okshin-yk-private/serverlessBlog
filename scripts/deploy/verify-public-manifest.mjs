// Independent publisher gate. Run with Node, without loading the deployment SDK.
import process from 'node:process';
import console from 'node:console';
import { setTimeout, clearTimeout } from 'node:timers';
import { URL } from 'node:url';

process.exitCode = 1;
const expiresAt = Date.now() + 90_000;
let reason = 'invalidArguments';
let attempts = 0;
const deadline = setTimeout(() => {
  console.error(
    `Public manifest verification deadline exceeded; reason=${reason}, attempts=${attempts}`
  );
  process.exit(1);
}, 95_000);

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
  while (Date.now() < expiresAt) {
    attempts++;
    reason = 'requestFailed';
    try {
      const response = await globalThis.fetch(
        new URL('/release-manifest.json', origin),
        {
          headers,
          redirect: 'error',
          signal: globalThis.AbortSignal.timeout(
            Math.max(1, Math.min(10_000, expiresAt - Date.now()))
          ),
        }
      );
      if (response.status !== 200) {
        reason = `httpStatus:${response.status}`;
        await response.body?.cancel();
      } else {
        reason = 'invalidJSON';
        const manifest = await response.json();
        if (
          !manifest ||
          manifest.schemaVersion !== 1 ||
          !Array.isArray(manifest.files) ||
          manifest.files.length === 0
        ) {
          reason = 'invalidSchema';
        } else if (manifest.revision !== revision) {
          reason = 'revisionMismatch';
        } else {
          console.log(`Public manifest confirmed: ${revision}`);
          process.exitCode = 0;
          break;
        }
      }
    } catch {
      // Only locally assigned reason codes are logged, never remote content.
    }
    console.error(
      `Public manifest not confirmed; reason=${reason}, attempt=${attempts}`
    );
    const remaining = expiresAt - Date.now();
    if (remaining > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(2_000, remaining))
      );
    }
  }
  if (process.exitCode !== 0) throw new Error('Manifest not confirmed');
} catch {
  // Fetch errors may carry credentials. Do not log the error object.
  console.error(
    `Public manifest verification failed; reason=${reason}, attempts=${attempts}; deployment completion is unconfirmed`
  );
} finally {
  clearTimeout(deadline);
}
