import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

// Execute the actual deployed Terraform heredoc, not a duplicate routing model.
function routingHandler(name: string) {
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
    get: async () => 'r200-current',
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
      '/releases',
      '/releases/r100-old/posts/example/index.html',
      '/releases%2fr100-old/index.html',
      '/_astro/../releases/r100-old/index.html',
    ])('rejects viewer path %s', async (uri) => {
      expect((await routingHandler(name)(request(uri))).statusCode).toBe(404);
    });
  }
);
