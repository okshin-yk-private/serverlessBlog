import { createServer } from 'node:http';
import {
  readFile,
  readdir,
  realpath,
  stat,
  mkdir,
  writeFile,
} from 'node:fs/promises';
import { resolve, relative, sep, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
};

// Serve only files inside the build directory, including after symlink resolution.
export async function startStaticSite(directory) {
  const root = await realpath(directory);
  const pages = [];
  async function visit(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const file = resolve(folder, entry.name);
      if (entry.isDirectory()) await visit(file);
      if (
        entry.isFile() &&
        entry.name.endsWith('.html') &&
        entry.name !== '404.html'
      ) {
        pages.push(
          '/' +
            relative(root, file)
              .split(sep)
              .map(encodeURIComponent)
              .join('/')
              .replace(/index\.html$/, '')
        );
      }
    }
  }
  await visit(root);
  if (!pages.length)
    throw new Error('Build contains no HTML pages; run the Astro build first.');
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(
        new URL(request.url, 'http://localhost').pathname
      );
      let file = resolve(root, '.' + pathname);
      if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
      file = await realpath(file);
      if (!file.startsWith(root + sep))
        throw new Error('Outside build directory');
      const body = await readFile(file);
      response.writeHead(200, {
        'Content-Type':
          contentTypes[extname(file)] ?? 'application/octet-stream',
      });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end('Not found');
    }
  });
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', accept);
  });
  return {
    urls: pages
      .sort()
      .map((page) => `http://127.0.0.1:${server.address().port}${page}`),
    close: () =>
      new Promise((accept, reject) =>
        server.close((error) => (error ? reject(error) : accept()))
      ),
  };
}

export async function collect({
  dist = './dist',
  output = './lighthouse-results',
} = {}) {
  const site = await startStaticSite(dist);
  let chrome;
  try {
    const { default: lighthouse } = await import('lighthouse');
    const { launch } = await import('chrome-launcher');
    chrome = await launch({
      chromeFlags: ['--headless'],
      chromePath: process.env.CHROME_PATH,
    });
    await mkdir(output, { recursive: true });
    for (const [index, url] of site.urls.entries()) {
      const result = await lighthouse(url, {
        port: chrome.port,
        output: ['html', 'json'],
        logLevel: 'error',
      });
      if (!result || result.lhr.runtimeError)
        throw new Error(
          `Lighthouse failed for ${url}: ${result?.lhr.runtimeError?.code ?? 'no report'}`
        );
      for (const [formatIndex, format] of ['html', 'json'].entries()) {
        await writeFile(
          resolve(output, `${index + 1}.${format}`),
          result.report[formatIndex]
        );
      }
      console.log(`Collected ${new URL(url).pathname}`);
    }
    console.log(
      `Saved ${site.urls.length} HTML/JSON report pairs to ${resolve(output)}`
    );
  } finally {
    try {
      await chrome?.kill();
    } finally {
      await site.close();
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const { values } = parseArgs({
    options: { dist: { type: 'string' }, output: { type: 'string' } },
  });
  await collect(values);
}
