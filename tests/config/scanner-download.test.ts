import { expect, test } from 'bun:test';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const workflow = readFileSync(
  '.github/workflows/dependency-update-security.yml',
  'utf8'
);
// Exercise the actual download commands, substituting only their input URLs.
const commands = workflow.match(/^\s*curl .*$/gm)!.map((line) => line.trim());

test('scanner archive and checksum downloads recover from HTTP 504', async () => {
  expect(commands).toHaveLength(2);
  for (const command of commands) {
    let requests = 0;
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch() {
        requests++;
        return requests === 1
          ? new Response('Gateway Timeout', { status: 504 })
          : new Response('verified-download-input');
      },
    });
    const cwd = mkdtempSync(join(tmpdir(), 'scanner-download-'));
    try {
      const child = Bun.spawn(['bash', '-euo', 'pipefail', '-c', command], {
        cwd,
        env: {
          ...process.env,
          url: `http://127.0.0.1:${server.port}`,
          archive: 'download.txt',
          checksums: 'download.txt',
        },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      expect(await child.exited).toBe(0);
      expect(requests).toBe(2);
      expect(readFileSync(join(cwd, 'download.txt'), 'utf8')).toBe(
        'verified-download-input'
      );
    } finally {
      server.stop(true);
      rmSync(cwd, { recursive: true, force: true });
    }
  }
}, 20000);

test('scanner download failures remain fatal and retries are bounded', async () => {
  for (const command of commands) {
    expect(command).toContain('--retry 4');
    expect(command).toContain('--retry-max-time 120');
    expect(command).toContain('--connect-timeout 15');
    expect(command).toContain('--max-time 60');
    const server = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: () => new Response('Not Found', { status: 404 }),
    });
    const cwd = mkdtempSync(join(tmpdir(), 'scanner-download-'));
    try {
      const child = Bun.spawn(['bash', '-euo', 'pipefail', '-c', command], {
        cwd,
        env: {
          ...process.env,
          url: `http://127.0.0.1:${server.port}`,
          archive: 'download.txt',
          checksums: 'download.txt',
        },
        stdout: 'pipe',
        stderr: 'pipe',
      });
      expect(await child.exited).toBe(22);
    } finally {
      server.stop(true);
      rmSync(cwd, { recursive: true, force: true });
    }
  }
});

test('persistent HTTP 504 stops after the retry limit', async () => {
  let requests = 0;
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch() {
      requests++;
      return new Response('Gateway Timeout', { status: 504 });
    },
  });
  const cwd = mkdtempSync(join(tmpdir(), 'scanner-download-'));
  try {
    const child = Bun.spawn(['bash', '-euo', 'pipefail', '-c', commands[0]], {
      cwd,
      env: {
        ...process.env,
        url: `http://127.0.0.1:${server.port}`,
        archive: 'download.txt',
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    expect(await child.exited).toBe(22);
    expect(requests).toBe(5);
  } finally {
    server.stop(true);
    rmSync(cwd, { recursive: true, force: true });
  }
}, 20000);
