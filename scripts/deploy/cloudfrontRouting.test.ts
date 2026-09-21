import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

// Execute the actual deployed Terraform heredoc, not a duplicate routing model.
function routingHandler(name: string, get = async () => 'r200-current') {
  const tf = readFileSync(
    new URL('../../terraform/modules/cdn/main.tf', import.meta.url),
    'utf8'
  );
  const section = tf.split(`resource "aws_cloudfront_function" "${name}"`)[1];
  const code = section
    .split('<<-EOF\n')[1]
    .split('\nEOF')[0]
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
