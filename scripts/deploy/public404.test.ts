import { describe, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { GetObjectCommand } from '@aws-sdk/client-s3';

// Execute the Lambda artifact template, including its actual request guards.
function loadHandler(send: (command: GetObjectCommand) => Promise<unknown>) {
  const source = readFileSync(
    new URL(
      '../../terraform/modules/cdn/functions/public404.mjs.tftpl',
      import.meta.url
    ),
    'utf8'
  )
    .replace(
      "import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';",
      ''
    )
    .replace('${bucket_json}', JSON.stringify('site-bucket'))
    .replace('${region_json}', JSON.stringify('ap-northeast-1'))
    .replace('export const handler', 'const handler');
  const client = class {
    send = send;
  };
  return new Function(
    'S3Client',
    'GetObjectCommand',
    'Buffer',
    'console',
    `${source}; return handler;`
  )(client, GetObjectCommand, Buffer, { error: vi.fn() });
}
function event(
  status = '404',
  uri = '/releases/r20-new/missing/index.html',
  method = 'GET'
) {
  return {
    Records: [
      {
        cf: {
          request: { uri, method },
          response: {
            status,
            headers: {
              'content-type': [
                { key: 'Content-Type', value: 'application/xml' },
              ],
              'content-length': [{ key: 'Content-Length', value: '999' }],
              etag: [{ key: 'ETag', value: 'old' }],
              via: [{ key: 'Via', value: 'readonly' }],
              'transfer-encoding': [
                { key: 'Transfer-Encoding', value: 'chunked' },
              ],
            },
          },
        },
      },
    ],
  };
}

describe('release-specific origin 404', () => {
  test('reads the failed request release and preserves read-only headers', async () => {
    const send = vi.fn(async (_command: GetObjectCommand) => ({
      ContentLength: 13,
      Body: { transformToString: async () => '<h1>404</h1>' },
    }));
    const result = await loadHandler(send)(event());
    expect(send.mock.calls[0][0].input).toEqual({
      Bucket: 'site-bucket',
      Key: 'releases/r20-new/404.html',
    });
    expect(result).toMatchObject({
      status: '404',
      body: '<h1>404</h1>',
      bodyEncoding: 'text',
      headers: {
        via: [{ key: 'Via', value: 'readonly' }],
        'transfer-encoding': [{ key: 'Transfer-Encoding', value: 'chunked' }],
        'content-type': [
          { key: 'Content-Type', value: 'text/html; charset=utf-8' },
        ],
      },
    });
    expect(result.headers).not.toHaveProperty('content-length');
    expect(result.headers).not.toHaveProperty('etag');
  });
  test('HEAD has the same status and headers without a body', async () => {
    const result = await loadHandler(async () => ({
      ContentLength: 3,
      Body: { transformToString: async () => '404' },
    }))(event('404', '/releases/r1-old/foo', 'HEAD'));
    expect(result.body).toBe('');
    expect(result.status).toBe('404');
  });
  test.each([
    ['200', '/releases/r20-new/index.html', 'GET'],
    ['403', '/releases/r20-new/no-access', 'GET'],
    ['404', '/api/posts', 'GET'],
    ['404', '/releases/../foo', 'GET'],
    ['404', '/releases/r20-new/foo', 'POST'],
  ])('preserves %s for %s (%s)', async (status, uri, method) => {
    const send = vi.fn();
    const input = event(status, uri, method);
    expect(await loadHandler(send)(input)).toBe(input.Records[0].cf.response);
    expect(send).not.toHaveBeenCalled();
  });
  test.each(['missing', 'oversized', 'read-failure'])(
    'preserves origin failure when the retained 404 is %s',
    async (failure) => {
      const input = event();
      const result = await loadHandler(async () => {
        if (failure === 'read-failure') throw new Error('denied');
        return {
          ContentLength: failure === 'oversized' ? 1024 * 1024 : 0,
          Body: { transformToString: async () => 'invalid' },
        };
      })(input);
      expect(result).toBe(input.Records[0].cf.response);
    }
  );
});
