import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  digest,
  MANIFEST_PATH,
  REQUIRED_FILES,
  type ReleaseManifest,
} from './atomicDeploy';
import { validateSiteUrl, verifyPublicRelease } from './publicVerification';

const body = Buffer.from('verified');
const manifest: ReleaseManifest = {
  schemaVersion: 1,
  revision: 'r20-new',
  files: [
    ...REQUIRED_FILES,
    'posts/hello/index.html',
    '_astro/app.hash.js',
    'favicon.svg',
  ].map((path) => ({ path, sizeBytes: body.length, sha256: digest(body) })),
};
function fetcher() {
  return vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    return new Response(
      url.pathname === `/${MANIFEST_PATH}`
        ? JSON.stringify(manifest) + '\n'
        : body,
      { status: url.pathname.startsWith('/__missing-') ? 404 : 200 }
    );
  });
}

describe('public release verification', () => {
  let logs = vi.fn<(line: string) => void>();
  const diagnostics = (): Array<Record<string, unknown>> =>
    logs.mock.calls.map(
      ([line]) => JSON.parse(line) as Record<string, unknown>
    );
  beforeEach(() => {
    logs = vi.fn<(line: string) => void>();
    vi.spyOn(console, 'log').mockImplementation(logs);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('checks documents, article variants, assets, real 404, and revision before and after', async () => {
    const request = fetcher();
    await verifyPublicRelease(
      {
        siteUrl: 'https://site.test',
        authorization: 'Basic explicit-test',
        fetch: request,
      },
      manifest
    );
    expect(diagnostics()).toEqual([
      expect.objectContaining({
        event: 'site-public-verification',
        outcome: 'succeeded',
        attempt: 1,
        revisionSha256: digest(Buffer.from(manifest.revision)),
      }),
    ]);
    const paths = request.mock.calls.map(
      ([url]) => new URL(String(url)).pathname
    );
    expect(paths[0]).toBe('/release-manifest.json');
    expect(paths.at(-1)).toBe('/release-manifest.json');
    expect(paths).toEqual(
      expect.arrayContaining([
        '/',
        '/posts/hello/',
        '/posts/hello',
        '/rss.xml',
        '/robots.txt',
        '/sitemap-index.xml',
        '/favicon.svg',
        '/_astro/app.hash.js',
        '/__missing-r20-new',
      ])
    );
    expect(request.mock.calls[0][1]).toMatchObject({
      redirect: 'error',
      headers: { authorization: 'Basic explicit-test' },
    });
  });

  test('retries stale edge content before declaring success', async () => {
    const request = fetcher();
    request.mockResolvedValueOnce(
      new Response(JSON.stringify({ ...manifest, revision: 'r10-old' }))
    );
    await verifyPublicRelease(
      { siteUrl: 'https://site.test', retryDelayMs: 0, fetch: request },
      manifest
    );
    expect(diagnostics()).toEqual([
      expect.objectContaining({
        outcome: 'retry',
        reason: 'manifest-mismatch',
        probe: 'manifest-before',
        attempt: 1,
      }),
      expect.objectContaining({ outcome: 'succeeded', attempt: 2 }),
    ]);
    expect(
      request.mock.calls.filter(
        ([url]) => new URL(String(url)).pathname === '/release-manifest.json'
      )
    ).toHaveLength(3);
  });

  test.each([
    'same-size-content',
    'old-404',
    'wrong-status',
    'network',
    'redirect',
  ])('never succeeds for %s', async (failure) => {
    const normal = fetcher();
    const request = vi.fn<typeof fetch>(async (url, options) => {
      const pathname = new URL(String(url)).pathname;
      if (failure === 'network') throw new Error('Authorization: SECRET');
      if (failure === 'redirect') return new Response(null, { status: 302 });
      if (failure === 'wrong-status')
        return new Response(body, { status: 401 });
      if (pathname === '/' && failure === 'same-size-content')
        return new Response('modified');
      if (pathname.startsWith('/__missing-') && failure === 'old-404')
        return new Response('old', { status: 404 });
      return normal(url, options);
    });
    await expect(
      verifyPublicRelease(
        {
          siteUrl: 'https://site.test',
          timeoutMs: 10,
          retryDelayMs: 0,
          fetch: request,
        },
        manifest
      )
    ).rejects.toThrow('pointer may already be active');
  });

  test('records status and bounded cache metadata, then recovers without weakening checks', async () => {
    const request = fetcher();
    request.mockResolvedValueOnce(
      new Response('DO_NOT_LOG_BODY', {
        status: 503,
        headers: {
          Age: '17',
          'X-Cache': 'Error from cloudfront',
          'X-Amz-Cf-Pop': 'NRT20-P1',
          'Set-Cookie': 'SECRET_COOKIE',
          Location: 'https://user:SECRET@site.test',
        },
      })
    );
    await verifyPublicRelease(
      {
        siteUrl: 'https://site.test',
        authorization: 'SECRET_AUTH',
        fetch: request,
        retryDelayMs: 0,
      },
      manifest
    );
    expect(diagnostics()[0]).toMatchObject({
      outcome: 'retry',
      reason: 'http-status',
      probe: 'manifest-before',
      expectedStatus: 200,
      actualStatus: 503,
      ageSeconds: 17,
      cacheResult: 'Error from cloudfront',
      cloudFrontPop: 'NRT20-P1',
    });
    expect(diagnostics().at(-1)).toMatchObject({
      outcome: 'succeeded',
      attempt: 2,
    });
    expect(JSON.stringify(diagnostics())).not.toMatch(/SECRET|DO_NOT_LOG_BODY/);
  });

  test.each(['network', 'body', 'hash', '404', 'final-manifest', 'status'])(
    'retains the last safe %s failure when the deadline expires',
    async (kind) => {
      const normal = fetcher();
      let manifestReads = 0;
      const request = vi.fn<typeof fetch>(async (url, options) => {
        const pathname = new URL(String(url)).pathname;
        if (kind === 'network')
          throw new Error('SECRET_AUTH in error and cause');
        if (kind === 'status')
          return new Response('SECRET_BODY', {
            status: 401,
            headers: {
              Age: 'SECRET',
              'X-Cache': 'SECRET',
              'X-Amz-Cf-Pop': 'SECRET',
            },
          });
        if (kind === 'body') {
          const response = new Response('SECRET_BODY');
          vi.spyOn(response, 'arrayBuffer').mockRejectedValue(
            new Error('SECRET_COOKIE')
          );
          return response;
        }
        if (kind === 'hash' && pathname === '/')
          return new Response('modified');
        if (kind === '404' && pathname.startsWith('/__missing-'))
          return new Response('old 404', { status: 404 });
        if (
          kind === 'final-manifest' &&
          pathname === '/release-manifest.json' &&
          ++manifestReads % 2 === 0
        )
          return new Response('SECRET_MANIFEST');
        return normal(url, options);
      });
      await expect(
        verifyPublicRelease(
          {
            siteUrl: 'https://site.test',
            fetch: request,
            timeoutMs: 15,
            retryDelayMs: 0,
          },
          manifest
        )
      ).rejects.toThrow('pointer may already be active');
      const final = diagnostics().at(-1)!;
      expect(final).toMatchObject({
        outcome: 'timed-out',
        reason: {
          network: 'request-failed',
          body: 'body-read-failed',
          hash: 'content-mismatch',
          '404': 'content-mismatch',
          'final-manifest': 'manifest-mismatch',
          status: 'http-status',
        }[kind],
      });
      if (kind === 'final-manifest') expect(final.probe).toBe('manifest-after');
      if (kind === '404') expect(final.probe).toBe('not-found');
      if (kind === 'hash')
        expect(final).toMatchObject({
          expectedSha256: digest(body),
          actualSha256: digest(Buffer.from('modified')),
          expectedBytes: 8,
          actualBytes: 8,
        });
      expect(diagnostics().some((event) => event.outcome === 'succeeded')).toBe(
        false
      );
      expect(JSON.stringify(diagnostics())).not.toMatch(
        /SECRET|modified|old 404|https:\/\/|Authorization/
      );
      expect(final).not.toHaveProperty('cloudFrontPop');
    }
  );

  test('classifies an aborted request without exposing its error', async () => {
    const request = vi.fn<typeof fetch>(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => reject(new Error('SECRET_AUTH')),
            { once: true }
          );
        })
    );
    await expect(
      verifyPublicRelease(
        { siteUrl: 'https://site.test', fetch: request, timeoutMs: 10 },
        manifest
      )
    ).rejects.toThrow('pointer may already be active');
    expect(diagnostics().at(-1)).toMatchObject({
      outcome: 'timed-out',
      reason: 'request-timeout',
      attempt: 1,
    });
    expect(JSON.stringify(diagnostics())).not.toContain('SECRET');
  });

  test.each([
    'http://site.test',
    'https://user:secret@site.test',
    'https://site.test/path',
    'https://site.test/?secret=1',
  ])('rejects unsafe origin %s', (url) =>
    expect(() => validateSiteUrl(url)).toThrow()
  );
});
