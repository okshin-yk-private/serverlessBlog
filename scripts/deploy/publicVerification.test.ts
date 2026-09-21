import { describe, expect, test, vi } from 'vitest';
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

  test.each([
    'http://site.test',
    'https://user:secret@site.test',
    'https://site.test/path',
    'https://site.test/?secret=1',
  ])('rejects unsafe origin %s', (url) =>
    expect(() => validateSiteUrl(url)).toThrow()
  );
});
