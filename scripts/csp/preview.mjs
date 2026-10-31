import process from 'node:process';
import { URL } from 'node:url';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';

// Read the proposed Terraform policies so browser checks cannot drift from them.
const source = readFileSync('terraform/modules/cdn/main.tf', 'utf8');
function policy(surface) {
  const match = source.match(
    new RegExp(`csp_report_only_${surface} = "([^"\\n]+)"`)
  );
  if (!match) throw new Error(`Missing Terraform CSP: ${surface}`);
  return match[1]
    .replaceAll('${var.aws_region}', 'ap-northeast-1')
    .replaceAll(
      '${var.image_bucket_regional_domain_name}',
      'fixture-images.s3.ap-northeast-1.amazonaws.com'
    );
}
const policies = { public: policy('public'), admin: policy('admin') };
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};
const roots = {
  public: resolve('frontend/public-astro/dist'),
  admin: resolve('frontend/admin/dist-csp-test'),
};
// Bind loopback only. No proxy, AWS calls, credentials or dynamic backend.
const server = createServer((req, res) => {
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, 'http://localhost').pathname
    );
    const admin =
      pathname.startsWith('/admin/') || pathname === '/mockServiceWorker.js';
    const surface = admin ? 'admin' : 'public';
    const root = roots[surface];
    const relative =
      pathname === '/mockServiceWorker.js'
        ? 'mockServiceWorker.js'
        : admin
          ? pathname.slice('/admin/'.length)
          : pathname.slice(1);
    let path = resolve(root, relative);
    if (path !== root && !path.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    // Read directly rather than checking a path and then reopening it (TOCTOU).
    let body;
    try {
      body = readFileSync(path);
    } catch (error) {
      if (error.code === 'EISDIR') path = resolve(path, 'index.html');
      else if (error.code === 'ENOENT' && admin && !extname(path)) {
        path = resolve(root, 'index.html');
      } else throw error;
      body = readFileSync(path);
    }
    res.writeHead(200, {
      'Content-Type': types[extname(path)] || 'application/octet-stream',
      'Content-Security-Policy': policies[surface],
      'Cache-Control': 'no-store',
      'Service-Worker-Allowed': '/',
    });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});
server.listen(4317, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => server.close());
