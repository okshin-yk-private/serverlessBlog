import { createRouteIndex } from './routeIndex';
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

// Execute the actual deployed Terraform heredoc, not a duplicate routing model.
const routeFixture = Object.fromEntries(
  createRouteIndex('r200-current', [
    'index.html',
    'posts/example/index.html',
    'posts/a/index.html',
    'sitemap-index.xml',
    'rss.xml',
    'robots.txt',
    'favicon.svg',
    '404.html',
  ]).map((item) => [item.Key, item.Value])
);
function routingHandler(
  name: string,
  get = async (key: string) =>
    key === 'activeRevision' ? 'r200-current' : routeFixture[key]
) {
  const tf = readFileSync(
    new URL('../../terraform/modules/cdn/main.tf', import.meta.url),
    'utf8'
  );
  const section = tf.split(`resource "aws_cloudfront_function" "${name}"`)[1];
  const guard = readFileSync(
    new URL(
      '../../terraform/modules/cdn/functions/viewer-guard.js.tftpl',
      import.meta.url
    ),
    'utf8'
  )
    .replaceAll('${enabled}', 'true')
    .replaceAll(
      '${basic_auth}',
      JSON.stringify(`Basic ${btoa('test:password')}`)
    )
    .replaceAll('${session_token}', JSON.stringify('fixture-token'));
  const code = section
    .split('<<-EOF\n')[1]
    .split('\nEOF')[0]
    .replace('${local.viewer_guard}', guard)
    .replace("import cf from 'cloudfront';", '')
    .replace('const kvs = cf.kvs();', '')
    .replace(
      '${var.basic_auth_username}:${var.basic_auth_password}',
      'test:password'
    );
  return new Function('kvs', `${code}; return handler;`)({
    get,
  });
}

describe.each(['public_ssg', 'public_combined'])(
  '%s release boundary',
  (name) => {
    const request = (uri: string) => ({
      request: {
        uri,
        headers: { authorization: { value: `Basic ${btoa('test:password')}` } },
      },
    });
    test('only normal routes are rewritten to the active release', async () => {
      const handler = routingHandler(name);
      expect((await handler(request('/posts/example/'))).uri).toBe(
        '/releases/r200-current/posts/example/index.html'
      );
    });
    test.each([
      ['/', '/index.html'],
      ['/posts/a', '/posts/a/index.html'],
      ['/posts/a/', '/posts/a/index.html'],
      ['/sitemap-index.xml', '/sitemap-index.xml'],
      ['/rss.xml', '/rss.xml'],
      ['/robots.txt', '/robots.txt'],
      ['/favicon.svg', '/favicon.svg'],
      ['/404.html', '/404.html'],
    ])('versions public path %s', async (uri, suffix) => {
      expect((await routingHandler(name)(request(uri))).uri).toBe(
        '/releases/r200-current' + suffix
      );
    });
    test.each([
      '/_astro/app.hash.js',
      '/api',
      '/api/posts',
      '/admin',
      '/admin/',
      '/images/a.png',
    ])('preserves separate behavior %s', async (uri) => {
      expect((await routingHandler(name)(request(uri))).uri).toBe(uri);
    });
    test('never falls back to legacy root content on KVS failure or invalid pointer', async () => {
      for (const get of [
        async () => '../bad',
        async () => {
          throw new Error('unavailable');
        },
      ]) {
        expect(await routingHandler(name, get)(request('/'))).toMatchObject({
          statusCode: 503,
          headers: { 'cache-control': { value: 'no-store' } },
        });
      }
    });
    test.each([
      '/releases',
      '/releases/r100-old/posts/example/index.html',
      '/releases%2fr100-old/index.html',
      '/_astro/../releases/r100-old/index.html',
    ])('rejects viewer path %s', async (uri) => {
      expect((await routingHandler(name)(request(uri))).statusCode).toBe(404);
    });
  }
);

describe('public missing routes without Lambda@Edge', () => {
  test.each(['public_ssg', 'public_combined'])(
    'routes missing paths and clears unsafe conditions in %s',
    async (name) => {
      const input = {
        request: {
          uri: '/missing/',
          headers: {
            authorization: { value: `Basic ${btoa('test:password')}` },
            range: { value: 'bytes=0-1' },
            'if-none-match': { value: 'anything' },
          },
        },
      };
      const result = await routingHandler(name)(input);
      expect(result.uri).toBe('/releases/r200-current/404.html');
      expect(result.headers['x-blog-public-not-found'].value).toBe('1');
      expect(result.headers.range).toBeUndefined();
      expect(result.headers['if-none-match']).toBeUndefined();
    }
  );
  test('cannot forge the missing marker on a real route', async () => {
    const result = await routingHandler('public_ssg')({
      request: {
        uri: '/',
        headers: {
          authorization: { value: `Basic ${btoa('test:password')}` },
          'x-blog-public-not-found': { value: '1' },
        },
      },
    });
    expect(result.headers['x-blog-public-not-found']).toBeUndefined();
  });
  test('an absent routing bucket fails closed with 503', async () => {
    const result = await routingHandler('public_ssg', async (key) => {
      if (key === 'activeRevision') return 'r200-current';
      throw new Error('Not propagated');
    })({
      request: {
        uri: '/',
        headers: { authorization: { value: `Basic ${btoa('test:password')}` } },
      },
    });
    expect(result.statusCode).toBe(503);
  });
  test('converts only internally marked 200 responses and preserves compressed body', () => {
    const code = readFileSync(
      new URL(
        '../../terraform/modules/cdn/functions/public-response.js.tftpl',
        import.meta.url
      ),
      'utf8'
    );
    const handler = new Function(`${code}; return publicResponse;`)();
    const response = {
      statusCode: 200,
      headers: { 'content-encoding': { value: 'br' }, etag: { value: 'x' } },
      body: 'unchanged',
    };
    expect(
      handler({
        request: { headers: { 'x-blog-public-not-found': { value: '1' } } },
        response,
      })
    ).toMatchObject({
      statusCode: 404,
      body: 'unchanged',
      headers: {
        'content-encoding': { value: 'br' },
        'cache-control': { value: 'no-store' },
      },
    });
    expect(response.headers.etag).toBeUndefined();
    for (const statusCode of [200, 304, 403, 404, 500]) {
      const response = { statusCode, headers: {} };
      expect(handler({ request: { headers: {} }, response }).statusCode).toBe(
        statusCode
      );
    }
  });
  test.each([
    '/.env',
    '/.git/config',
    '/api/%252eenv',
    '/wp-admin/',
    '/.aws/credentials',
  ])('rejects scanner target %s before KVS or origins', async (uri) => {
    expect(
      (await routingHandler('public_ssg')({ request: { uri, headers: {} } }))
        .statusCode
    ).toBe(404);
  });
});
