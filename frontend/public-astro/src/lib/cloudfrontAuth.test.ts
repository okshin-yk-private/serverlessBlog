import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const cdn = readFileSync(
  new URL('../../../../terraform/modules/cdn/main.tf', import.meta.url),
  'utf8'
);
const template = readFileSync(
  new URL(
    '../../../../terraform/modules/cdn/functions/viewer-guard.js.tftpl',
    import.meta.url
  ),
  'utf8'
);
const basic = 'Basic ' + Buffer.from("reviewer:pass'word").toString('base64');
const token = 'test-session-token';
function handler(
  name: string,
  enabled = true,
  getRevision: () => Promise<string> = async () => 'r123-test'
) {
  const resource = cdn.split(
    `resource "aws_cloudfront_function" "${name}" {`
  )[1];
  let code = resource.split(/code\s*= <<-EOF\n/)[1].split('\nEOF')[0];
  const guard = template
    .replace('${enabled}', String(enabled))
    .replace('${basic_auth}', JSON.stringify(basic))
    .replace('${session_token}', JSON.stringify(token));
  code = code.replace('${local.viewer_guard}', guard);
  // Terraform jsonencode/base64encode/sha256 produce these values; the actual JS
  // handler body is executed, not a duplicated model of its authorization logic.
  code = code.replace(
    /authorization.value === .*\) \{/,
    'authorization.value === ' + JSON.stringify(basic) + ') {'
  );
  code = code.replace(
    /\$\{jsonencode\(sha256\("dev-cookie:.*?"\)\)\}/g,
    JSON.stringify(token)
  );
  code = code.replace("import cf from 'cloudfront';", '');
  return runInNewContext(code + '\nhandler', {
    cf: { kvs: () => ({ get: getRevision }) },
  });
}
function request(uri: string, authorization?: string, cookie?: string) {
  return {
    uri,
    method: 'GET',
    querystring: { q: { value: 'search' } },
    headers: authorization ? { authorization: { value: authorization } } : {},
    cookies: cookie ? { '__Host-dev-access': { value: cookie } } : {},
  };
}

describe('deployed CloudFront environment access control', () => {
  it.each([
    'api_path',
    'image_path',
    'public_ssg',
    'public_combined',
    'admin_combined',
  ])(
    '%s rejects missing, wrong, and forged Bearer credentials',
    async (name) => {
      for (const authorization of [undefined, 'Basic wrong', 'Bearer forged']) {
        expect(
          (
            await handler(name)({
              request: request('/api/posts', authorization),
            })
          ).statusCode
        ).toBe(401);
      }
      expect(
        (
          await handler(name)({
            request: request('/api/posts', undefined, 'forged'),
          })
        ).statusCode
      ).toBe(401);
    }
  );
  it('allows Basic build fetch and strips its credential before API forwarding', () => {
    const result = handler('api_path')({
      request: request('/api/posts', basic),
    });
    expect(result.uri).toBe('/posts');
    expect(result.headers.authorization).toBeUndefined();
    expect(result.querystring.q.value).toBe('search');
  });
  it('preserves Cognito Bearer only after validating the environment session', () => {
    const result = handler('api_path')({
      request: request('/api/admin/posts', 'Bearer cognito', token),
    });
    expect(result.uri).toBe('/admin/posts');
    expect(result.headers.authorization.value).toBe('Bearer cognito');
    expect(result.cookies['__Host-dev-access']).toBeUndefined();
  });
  it('issues a host-only secure HttpOnly cookie after Basic login without redirects', () => {
    const result = handler('dev_session')({
      request: request('/admin/', basic),
      response: { statusCode: 200 },
    });
    expect(result.statusCode).toBe(200);
    expect(result.cookies['__Host-dev-access']).toEqual({
      value: token,
      attributes: 'Path=/; Secure; HttpOnly; SameSite=Strict',
    });
    expect(
      handler('dev_session')({
        request: request('/admin/', 'Bearer forged'),
        response: { statusCode: 200 },
      }).cookies
    ).toBeUndefined();
  });
  it('keeps production API public and preserves Authorization', () => {
    const result = handler(
      'api_path',
      false
    )({ request: request('/api/posts', 'Bearer token') });
    expect(result.uri).toBe('/posts');
    expect(result.headers.authorization.value).toBe('Bearer token');
  });
  it('preserves upstream active-release routing after authentication', async () => {
    const result = await handler('public_combined')({
      request: request('/posts/example', basic),
    });
    expect(result.uri).toBe('/releases/r123-test/posts/example/index.html');
    expect(
      (
        await handler(
          'public_ssg',
          false
        )({ request: request('/releases/r122/old.html') })
      ).statusCode
    ).toBe(404);
  });
  it.each(['public_ssg', 'public_combined'])(
    '%s checks environment access before reading the release pointer',
    async (name) => {
      let reads = 0;
      const result = await handler(name, true, async () => {
        reads++;
        throw new Error('KVS unavailable');
      })({ request: request('/posts/example') });
      expect(result.statusCode).toBe(401);
      expect(reads).toBe(0);
    }
  );
  it.each(['public_ssg', 'public_combined'])(
    '%s fails closed after authentication when the release pointer is unavailable or invalid',
    async (name) => {
      for (const getRevision of [
        async () => '',
        async () => '../legacy',
        async () => {
          throw new Error('KVS unavailable');
        },
      ]) {
        const result = await handler(
          name,
          true,
          getRevision
        )({
          request: request('/posts/example', basic),
        });
        expect(result.statusCode).toBe(503);
        expect(result.headers['cache-control'].value).toBe('no-store');
        expect(result.uri).toBeUndefined();
      }
    }
  );
  it('requires an origin key for every API method, including direct public reads', () => {
    const api = readFileSync(
      new URL('../../../../terraform/modules/api/main.tf', import.meta.url),
      'utf8'
    );
    const methods = [
      ...api.matchAll(/resource "aws_api_gateway_method" "([^"]+)" \{([^}]+)/g),
    ];
    expect(methods.length).toBeGreaterThan(20);
    for (const [, name, body] of methods)
      expect(body, name).toMatch(/api_key_required\s*= var.require_origin_key/);
    expect(cdn).toContain('name  = "x-api-key"');
    expect(cdn).toContain('value = var.api_origin_key');
  });
});
