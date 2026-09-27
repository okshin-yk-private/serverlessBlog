import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Issue #683 / #680: scripts/ci/verify-public-contract.sh automates the
// post-deploy checks that used to be done by hand (no internal fields on the
// public API/RSS, article JSON-LD attributed to the site Organization, and a
// strict CSP on both the public and admin surfaces). This suite runs the
// real script against a local Bun.serve stub standing in for the deployed
// site, so a passing run here means the shell + python actually work end to
// end, not just that their source contains the right strings.

const SCRIPT = resolve(
  import.meta.dir,
  '../../scripts/ci/verify-public-contract.sh'
);

const ORG_AUTHOR = { '@type': 'Organization', name: 'bone of my fallacy' };

const STRICT_PUBLIC_CSP_RO =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; " +
  "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'";

const STRICT_ADMIN_CSP_RO =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: https: blob:; font-src 'self' data:; " +
  "connect-src 'self' https://cognito-idp.ap-northeast-1.amazonaws.com " +
  "https://blog-images.s3.ap-northeast-1.amazonaws.com; object-src 'none'; " +
  "base-uri 'self'; frame-ancestors 'none'; form-action 'self'";

const LEGACY_ENFORCED_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; " +
  "style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; " +
  "font-src 'self' data:; connect-src 'self' https://*.amazonaws.com";

function articleHtml(author: unknown = ORG_AUTHOR) {
  const ldJson = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: 'Fixture post',
    author,
  });
  return `<!doctype html><html><head>
    <script type="application/ld+json">${ldJson}</script>
  </head><body>fixture</body></html>`;
}

function rss(articleUrl: string, includeAuthor: boolean) {
  const authorTag = includeAuthor ? '<author>editor@example.com</author>' : '';
  return `<?xml version="1.0"?><rss><channel>
    <item><title>Fixture</title><link>${articleUrl}</link>${authorTag}</item>
  </channel></rss>`;
}

interface Fixture {
  apiList?: unknown;
  apiBySlug?: unknown;
  articleAuthor?: unknown;
  rssIncludesAuthor?: boolean;
  publicCsp?: string;
  publicCspReportOnly?: string;
  adminCsp?: string;
  adminCspReportOnly?: string;
  requireBasicAuth?: boolean;
  rssStatus?: number;
}

function passingFixture(overrides: Partial<Fixture> = {}): Required<Fixture> {
  return {
    apiList: {
      items: [{ id: '1', slug: 'hello-world', title: 'Hello' }],
    },
    apiBySlug: { id: '1', slug: 'hello-world', title: 'Hello' },
    articleAuthor: ORG_AUTHOR,
    rssIncludesAuthor: false,
    publicCsp: LEGACY_ENFORCED_CSP,
    publicCspReportOnly: STRICT_PUBLIC_CSP_RO,
    adminCsp: LEGACY_ENFORCED_CSP,
    adminCspReportOnly: STRICT_ADMIN_CSP_RO,
    requireBasicAuth: false,
    rssStatus: 200,
    ...overrides,
  };
}

function startStub(fixture: Required<Fixture>) {
  let sawAuthorizationOnApi = false;
  let sawAuthorizationOnHtml = false;

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(req) {
      const url = new URL(req.url);
      const auth = req.headers.get('authorization');

      if (fixture.requireBasicAuth && !auth) {
        return new Response('Unauthorized', { status: 401 });
      }

      if (url.pathname === '/api/posts') {
        if (auth) sawAuthorizationOnApi = true;
        return Response.json(fixture.apiList);
      }

      if (url.pathname.startsWith('/api/posts/by-slug/')) {
        if (auth) sawAuthorizationOnApi = true;
        return Response.json(fixture.apiBySlug);
      }

      if (url.pathname === '/rss.xml') {
        if (fixture.rssStatus !== 200) {
          return new Response('Unauthorized', { status: fixture.rssStatus });
        }
        return new Response(
          rss(
            `http://127.0.0.1:${server.port}/posts/hello-world`,
            fixture.rssIncludesAuthor
          ),
          { headers: { 'content-type': 'application/xml' } }
        );
      }

      if (url.pathname === '/posts/hello-world') {
        if (auth) sawAuthorizationOnHtml = true;
        return new Response(articleHtml(fixture.articleAuthor), {
          headers: { 'content-type': 'text/html' },
        });
      }

      if (url.pathname === '/' || url.pathname === '/admin/') {
        if (auth) sawAuthorizationOnHtml = true;
        const isAdmin = url.pathname === '/admin/';
        const headers = new Headers({ 'content-type': 'text/html' });
        headers.append(
          'Content-Security-Policy',
          isAdmin ? fixture.adminCsp : fixture.publicCsp
        );
        headers.append(
          'Content-Security-Policy-Report-Only',
          isAdmin ? fixture.adminCspReportOnly : fixture.publicCspReportOnly
        );
        return new Response('<html></html>', { headers });
      }

      return new Response('Not Found', { status: 404 });
    },
  });

  return {
    server,
    url: `http://127.0.0.1:${server.port}`,
    sawAuthorizationOnApi: () => sawAuthorizationOnApi,
    sawAuthorizationOnHtml: () => sawAuthorizationOnHtml,
  };
}

async function runScript(siteUrl: string, basicAuth?: string) {
  const env: Record<string, string> = { ...process.env } as Record<
    string,
    string
  >;
  if (basicAuth) env.BASIC_AUTH = basicAuth;
  else delete env.BASIC_AUTH;

  // Bun.spawnSync would block this process's event loop while curl waits for
  // a response from the Bun.serve stub running in that same process (a
  // deadlock), so this must be the async Bun.spawn + awaited exit instead.
  const child = Bun.spawn(['bash', SCRIPT, siteUrl], {
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, status] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { status, stdout, stderr };
}

describe('scripts/ci/verify-public-contract.sh', () => {
  test('passes against a clean fixture site', async () => {
    const stub = startStub(passingFixture());
    try {
      const result = await runScript(stub.url);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('✓ Public contract verification passed');
      expect(result.status).toBe(0);
    } finally {
      stub.server.stop(true);
    }
  });

  test('empty post list passes with a warning and skips per-item checks', async () => {
    const stub = startStub(passingFixture({ apiList: { items: [] } }));
    try {
      const result = await runScript(stub.url);
      expect(result.stdout).toContain('⚠️');
      expect(result.stdout).toContain('✓ Public contract verification passed');
      expect(result.status).toBe(0);
    } finally {
      stub.server.stop(true);
    }
  });

  test('fails when the post list leaks authorId', async () => {
    const stub = startStub(
      passingFixture({
        apiList: {
          items: [{ id: '1', slug: 'hello-world', authorId: 'abc123' }],
        },
      })
    );
    try {
      const result = await runScript(stub.url);
      expect(result.stdout).toContain('❌');
      expect(result.stdout).toContain('authorId');
      expect(result.status).toBe(1);
    } finally {
      stub.server.stop(true);
    }
  });

  test('fails when the by-slug object leaks contentMarkdown', async () => {
    const stub = startStub(
      passingFixture({
        apiBySlug: {
          id: '1',
          slug: 'hello-world',
          contentMarkdown: '# secret source',
        },
      })
    );
    try {
      const result = await runScript(stub.url);
      expect(result.stdout).toContain('❌');
      expect(result.stdout).toContain('contentMarkdown');
      expect(result.status).toBe(1);
    } finally {
      stub.server.stop(true);
    }
  });

  test('fails when the JSON-LD author is a UUID-bearing Person', async () => {
    const stub = startStub(
      passingFixture({
        articleAuthor: {
          '@type': 'Person',
          name: 'a1b2c3d4-e5f6-47a8-89ab-0123456789ab',
        },
      })
    );
    try {
      const result = await runScript(stub.url);
      expect(result.stdout).toContain('❌');
      expect(result.status).toBe(1);
    } finally {
      stub.server.stop(true);
    }
  });

  test('fails when the RSS feed still has a per-item <author>', async () => {
    const stub = startStub(passingFixture({ rssIncludesAuthor: true }));
    try {
      const result = await runScript(stub.url);
      expect(result.stdout).toContain(
        '❌ rss.xml contains a per-item <author>'
      );
      expect(result.status).toBe(1);
    } finally {
      stub.server.stop(true);
    }
  });

  test('fails when the only strict script-src still allows unsafe-inline', async () => {
    const stub = startStub(
      passingFixture({
        publicCspReportOnly: STRICT_PUBLIC_CSP_RO.replace(
          "script-src 'self';",
          "script-src 'self' 'unsafe-inline';"
        ),
      })
    );
    try {
      const result = await runScript(stub.url);
      expect(result.stdout).toContain(
        "❌ public: no header has script-src 'self'"
      );
      expect(result.status).toBe(1);
    } finally {
      stub.server.stop(true);
    }
  });

  test('fails when the admin connect-src has a wildcard amazonaws.com host', async () => {
    const stub = startStub(
      passingFixture({
        adminCspReportOnly: STRICT_ADMIN_CSP_RO.replace(
          /connect-src[^;]*/,
          "connect-src 'self' https://*.amazonaws.com"
        ),
      })
    );
    try {
      const result = await runScript(stub.url);
      expect(result.stdout).toContain(
        '❌ admin: no header has a connect-src limited to'
      );
      expect(result.status).toBe(1);
    } finally {
      stub.server.stop(true);
    }
  });

  test('fails when a page has no strict CSP at all', async () => {
    const stub = startStub(
      passingFixture({ publicCsp: '', publicCspReportOnly: '' })
    );
    try {
      const result = await runScript(stub.url);
      expect(result.stdout).toContain('❌ public:');
      expect(result.status).toBe(1);
    } finally {
      stub.server.stop(true);
    }
  });

  test('sends BASIC_AUTH when set and never echoes it', async () => {
    const stub = startStub(passingFixture({ requireBasicAuth: true }));
    try {
      const result = await runScript(stub.url, 'ci-user:s3cr3t-pass');
      expect(result.status).toBe(0);
      expect(stub.sawAuthorizationOnApi()).toBe(true);
      expect(stub.sawAuthorizationOnHtml()).toBe(true);
      expect(result.stdout).not.toContain('s3cr3t-pass');
      expect(result.stdout).not.toContain('ci-user');
      expect(result.stderr).not.toContain('s3cr3t-pass');
    } finally {
      stub.server.stop(true);
    }
  });

  test('fails when a content page is not HTTP 200 instead of parsing the error body', async () => {
    // A basic-auth 401 page contains no <author> and no articles; parsing it
    // as the feed would pass the RSS and JSON-LD checks vacuously.
    const stub = startStub(passingFixture({ rssStatus: 401 }));
    try {
      const result = await runScript(stub.url);
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('GET /rss.xml → HTTP 401');
      expect(result.stdout).not.toContain('✓ rss.xml');
    } finally {
      stub.server.stop(true);
    }
  });

  test('fails closed when BASIC_AUTH is required but not provided', async () => {
    // The script's --retry-all-errors retries the 401 responses this
    // fixture returns (3 retries, 5s apart), so this legitimately takes
    // longer than bun's default 5s per-test timeout.
    const stub = startStub(passingFixture({ requireBasicAuth: true }));
    try {
      const result = await runScript(stub.url);
      expect(result.status).toBe(1);
    } finally {
      stub.server.stop(true);
    }
  }, 20000);
});

describe('site organization name stays in sync with site.ts', () => {
  test('the hardcoded EXPECTED_SITE_ORG_NAME matches SITE_NAME', async () => {
    const siteTs = readFileSync(
      resolve(import.meta.dir, '../../frontend/public-astro/src/lib/site.ts'),
      'utf8'
    );
    const match = siteTs.match(/SITE_NAME\s*=\s*'([^']+)'/);
    expect(match).not.toBeNull();

    const pySource = readFileSync(
      resolve(import.meta.dir, '../../scripts/ci/verify_public_contract.py'),
      'utf8'
    );
    const pyMatch = pySource.match(/EXPECTED_SITE_ORG_NAME\s*=\s*"([^"]+)"/);
    expect(pyMatch).not.toBeNull();

    expect(pyMatch![1]).toBe(match![1]);
  });
});

describe('deploy.yml calls verify-public-contract.sh from both post-deploy jobs', () => {
  const workflow = readFileSync(
    resolve(import.meta.dir, '../../.github/workflows/deploy.yml'),
    'utf8'
  );

  function jobBlock(jobKey: string): string {
    // Jobs are top-level keys under `jobs:`, so the next line at that same
    // 2-space indent (another `  <name>:`) or EOF ends this job's block.
    const start = workflow.indexOf(`\n  ${jobKey}:\n`);
    expect(start).toBeGreaterThan(-1);
    const rest = workflow.slice(start + 1);
    const nextJob = rest.slice(1).search(/\n {2}\S/);
    return nextJob === -1 ? rest : rest.slice(0, nextJob + 1);
  }

  test('DEV post-deploy job runs the script against BASE_URL with Basic Auth', () => {
    const job = jobBlock('post-deploy-e2e-dev');
    expect(job).toContain(
      'bash scripts/ci/verify-public-contract.sh "$BASE_URL"'
    );
    expect(job).toContain('BASE_URL: ${{ steps.config.outputs.base_url }}');
    expect(job).toMatch(
      /BASIC_AUTH: .*steps\.config\.outputs\.basic_user.*steps\.config\.outputs\.basic_pass/
    );
  });

  test('PRD smoke job checks out the repo and runs the script against SITE_URL', () => {
    const job = jobBlock('post-deploy-smoke-prd');
    expect(job).toContain('uses: actions/checkout@');
    expect(job).toContain('persist-credentials: false');
    expect(job).toContain(
      'bash scripts/ci/verify-public-contract.sh "$SITE_URL"'
    );
  });

  test('scripts/ci/verify-public-contract.sh is a deploy trigger path', () => {
    const pathsBlock = workflow.slice(
      workflow.indexOf('    paths:'),
      workflow.indexOf('  workflow_dispatch:')
    );
    expect(pathsBlock).toContain("'scripts/ci/verify-public-contract.sh'");
    expect(pathsBlock).toContain("'scripts/ci/verify_public_contract.py'");
  });
});
