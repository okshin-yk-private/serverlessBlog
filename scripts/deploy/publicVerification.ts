import {
  digest,
  MANIFEST_PATH,
  REQUIRED_FILES,
  type ReleaseManifest,
} from './atomicDeploy';

export interface PublicVerificationConfig {
  siteUrl: string;
  /** Caller supplies authentication explicitly; never discover credentials here. */
  authorization?: string;
  timeoutMs?: number;
  retryDelayMs?: number;
  fetch?: typeof globalThis.fetch;
}

export function validateSiteUrl(siteUrl: string): URL {
  const url = new URL(siteUrl);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      'Public verification requires an HTTPS site origin without credentials'
    );
  }
  return url;
}

/** A bounded probe of this client's edge, not a claim of worldwide convergence. */
export async function verifyPublicRelease(
  config: PublicVerificationConfig,
  manifest: ReleaseManifest
): Promise<void> {
  const origin = validateSiteUrl(config.siteUrl);
  const deadline = Date.now() + (config.timeoutMs ?? 90_000);
  const request = config.fetch ?? globalThis.fetch;
  const headers: Record<string, string> = { 'cache-control': 'no-cache' };
  if (config.authorization) headers.authorization = config.authorization;
  const fetchBytes = async (
    pathname: string,
    status: number
  ): Promise<Uint8Array> => {
    const response = await request(new URL(pathname, origin), {
      headers,
      redirect: 'error',
      signal: globalThis.AbortSignal.timeout(
        Math.max(1, Math.min(10_000, deadline - Date.now()))
      ),
    });
    if (response.status !== status) {
      await response.body?.cancel();
      throw new Error(`Unexpected HTTP status for ${pathname}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  };
  const checkManifest = async () => {
    const body = await fetchBytes(`/${MANIFEST_PATH}`, 200);
    // Compare the complete manifest, not just an attacker-controlled revision string.
    if (
      Buffer.from(body).toString('utf8') !==
      JSON.stringify(manifest) + '\n'
    ) {
      throw new Error('Public release manifest has not converged');
    }
  };
  const paths = new Set<string>(REQUIRED_FILES);
  const article = manifest.files.find(
    (file) =>
      file.path.startsWith('posts/') && file.path.endsWith('/index.html')
  );
  if (article) paths.add(article.path);
  const asset = manifest.files.find((file) => file.path.startsWith('_astro/'));
  if (asset) paths.add(asset.path);
  const favicon = manifest.files.find((file) =>
    file.path.startsWith('favicon.')
  );
  if (favicon) paths.add(favicon.path);

  do {
    try {
      await checkManifest();
      for (const filePath of paths) {
        const file = manifest.files.find((entry) => entry.path === filePath);
        if (!file)
          throw new Error('Required probe target is absent from manifest');
        const pathname =
          '/' + filePath.split('/').map(encodeURIComponent).join('/');
        const routes = filePath.endsWith('index.html')
          ? [
              pathname.replace(/index\.html$/, ''),
              ...(filePath === 'index.html'
                ? []
                : [pathname.replace(/\/index\.html$/, '')]),
            ]
          : [pathname];
        for (const route of routes) {
          const body = await fetchBytes(route, 200);
          if (body.length !== file.sizeBytes || digest(body) !== file.sha256) {
            throw new Error(`Public content mismatch for ${route}`);
          }
        }
      }
      // Check the real missing-route response, not merely direct /404.html access.
      const notFound = await fetchBytes(`/__missing-${manifest.revision}`, 404);
      if (
        digest(notFound) !==
        manifest.files.find((file) => file.path === '404.html')?.sha256
      ) {
        throw new Error(
          'Public 404 response does not match the active release'
        );
      }
      await checkManifest();
      return;
    } catch {
      // Do not include request errors: they can carry an Authorization header.
      if (Date.now() >= deadline) break;
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.min(config.retryDelayMs ?? 2_000, deadline - Date.now())
        )
      );
    }
  } while (Date.now() < deadline);
  throw new Error(
    `Public verification timed out for revision ${manifest.revision}; pointer may already be active`
  );
}
