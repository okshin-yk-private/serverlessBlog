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

type Probe = 'manifest-before' | 'content' | 'not-found' | 'manifest-after';
type FailureReason =
  | 'http-status'
  | 'request-failed'
  | 'request-timeout'
  | 'body-read-failed'
  | 'manifest-mismatch'
  | 'content-mismatch'
  | 'missing-probe-target'
  | 'unexpected-error';

interface ProbeDetails {
  probe: Probe;
  // Hash the route rather than logging slugs, query strings or response URLs.
  routeSha256?: string;
  expectedStatus?: number;
  actualStatus?: number;
  expectedSha256?: string;
  actualSha256?: string;
  expectedBytes?: number;
  actualBytes?: number;
  ageSeconds?: number;
  cloudFrontPop?: string;
  cacheResult?: string;
}

class ProbeFailure extends Error {
  constructor(
    readonly reason: FailureReason,
    readonly details: ProbeDetails
  ) {
    super(reason);
  }
}

// Only bounded, allowlisted response metadata. Never serialize an error,
// request/response object, Authorization, cookies, Location, or response body.
function responseDetails(response: globalThis.Response): Partial<ProbeDetails> {
  const age = response.headers.get('age') ?? '';
  const pop = response.headers.get('x-amz-cf-pop') ?? '';
  const cache = response.headers.get('x-cache') ?? '';
  return {
    ...(/^\d{1,9}$/.test(age) ? { ageSeconds: Number(age) } : {}),
    ...(/^[A-Z]{3}\d{1,3}-[A-Z]\d{1,3}$/.test(pop)
      ? { cloudFrontPop: pop }
      : {}),
    ...(/^(Hit|Miss|RefreshHit|Error) from cloudfront$/.test(cache)
      ? { cacheResult: cache }
      : {}),
  };
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
  const startedAt = Date.now();
  const deadline = startedAt + (config.timeoutMs ?? 90_000);
  let attempt = 0;
  let lastFailure: ProbeFailure | undefined;
  const report = (
    outcome: 'retry' | 'succeeded' | 'timed-out',
    failure?: ProbeFailure
  ) => {
    console.log(
      JSON.stringify({
        event: 'site-public-verification',
        outcome,
        attempt,
        elapsedMs: Date.now() - startedAt,
        // Correlate with site-deploy-phase without logging arbitrary caller input.
        revisionSha256: digest(Buffer.from(manifest.revision)),
        ...(failure ? { reason: failure.reason, ...failure.details } : {}),
      })
    );
  };
  const request = config.fetch ?? globalThis.fetch;
  const headers: Record<string, string> = { 'cache-control': 'no-cache' };
  if (config.authorization) headers.authorization = config.authorization;
  const fetchBytes = async (
    pathname: string,
    status: number,
    probe: Probe
  ): Promise<{ body: Uint8Array; details: ProbeDetails }> => {
    const details: ProbeDetails = {
      probe,
      routeSha256: digest(Buffer.from(pathname)),
      expectedStatus: status,
    };
    const signal = globalThis.AbortSignal.timeout(
      Math.max(1, Math.min(10_000, deadline - Date.now()))
    );
    let response: globalThis.Response;
    try {
      response = await request(new URL(pathname, origin), {
        headers,
        redirect: 'error',
        signal,
      });
    } catch {
      throw new ProbeFailure(
        signal.aborted ? 'request-timeout' : 'request-failed',
        details
      );
    }
    Object.assign(
      details,
      { actualStatus: response.status },
      responseDetails(response)
    );
    if (response.status !== status) {
      // Cancellation failure must not hide the observed status.
      try {
        await response.body?.cancel();
      } catch {
        /* no raw errors */
      }
      throw new ProbeFailure('http-status', details);
    }
    try {
      return { body: new Uint8Array(await response.arrayBuffer()), details };
    } catch {
      throw new ProbeFailure(
        signal.aborted ? 'request-timeout' : 'body-read-failed',
        details
      );
    }
  };
  const checkManifest = async (probe: 'manifest-before' | 'manifest-after') => {
    const { body, details } = await fetchBytes(`/${MANIFEST_PATH}`, 200, probe);
    const expected = Buffer.from(JSON.stringify(manifest) + '\n');
    // Compare the complete manifest, not just an attacker-controlled revision string.
    if (!Buffer.from(body).equals(expected)) {
      throw new ProbeFailure('manifest-mismatch', {
        ...details,
        expectedSha256: digest(expected),
        actualSha256: digest(body),
        expectedBytes: expected.length,
        actualBytes: body.length,
      });
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
    attempt++;
    try {
      await checkManifest('manifest-before');
      for (const filePath of paths) {
        const file = manifest.files.find((entry) => entry.path === filePath);
        if (!file)
          throw new ProbeFailure('missing-probe-target', {
            probe: 'content',
            routeSha256: digest(Buffer.from('/' + filePath)),
          });
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
          const { body, details } = await fetchBytes(route, 200, 'content');
          if (body.length !== file.sizeBytes || digest(body) !== file.sha256) {
            throw new ProbeFailure('content-mismatch', {
              ...details,
              expectedSha256: file.sha256,
              actualSha256: digest(body),
              expectedBytes: file.sizeBytes,
              actualBytes: body.length,
            });
          }
        }
      }
      // Check the real missing-route response, not merely direct /404.html access.
      const { body: notFound, details } = await fetchBytes(
        `/__missing-${manifest.revision}`,
        404,
        'not-found'
      );
      if (
        digest(notFound) !==
        manifest.files.find((file) => file.path === '404.html')?.sha256
      ) {
        throw new ProbeFailure('content-mismatch', {
          ...details,
          actualSha256: digest(notFound),
          expectedSha256: manifest.files.find(
            (file) => file.path === '404.html'
          )?.sha256,
        });
      }
      await checkManifest('manifest-after');
      report('succeeded');
      return;
    } catch (error) {
      lastFailure =
        error instanceof ProbeFailure
          ? error
          : new ProbeFailure('unexpected-error', { probe: 'content' });
      if (Date.now() >= deadline) break;
      report('retry', lastFailure);
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.min(config.retryDelayMs ?? 2_000, deadline - Date.now())
        )
      );
    }
  } while (Date.now() < deadline);
  report('timed-out', lastFailure);
  throw new Error(
    `Public verification timed out for revision ${manifest.revision}; pointer may already be active`
  );
}
