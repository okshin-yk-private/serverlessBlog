/** Build isolated, deterministic 0/1/20-post fixtures without replacing normal dist. */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { createMockApiServer, mockPosts, stopServer } from './mock-api-server';

const server = createMockApiServer(0);
if (!server.listening) await once(server, 'listening');
const address = server.address();
if (!address || typeof address === 'string') throw new Error('No fixture port');
const template = { ...mockPosts[0], imageUrls: [] };
try {
  for (const count of [0, 1, 20]) {
    mockPosts.splice(
      0,
      mockPosts.length,
      ...Array.from({ length: count }, (_, index) => ({
        ...template,
        id: `state-${index}`,
        title:
          index === 0
            ? 'オデュッセイアを観て今後のAI社会への向き合い方を考える・長い日本語タイトルの表示を検証する記録'
            : `記事 ${index}`,
        category: index % 2 ? '日常' : '技術',
        tags: ['AI', '長いタグ'.repeat(20)],
        publishedAt: index === 19 ? undefined : '2024-01-01T15:00:00Z',
        contentHtml:
          '<h2>本文の見出し</h2><p>長いURL https://example.com/' +
          'long'.repeat(80) +
          '</p><blockquote>引用文です。</blockquote><pre><code>' +
          'code '.repeat(100) +
          '</code></pre><table><thead><tr><th>項目</th><th>内容</th></tr></thead><tbody><tr><td>長い表</td><td>' +
          '連続した文字列'.repeat(30) +
          '</td></tr></tbody></table>',
      }))
    );
    const child = spawn(
      'bun',
      [
        'run',
        'astro',
        'build',
        '--outDir',
        resolve(`../../test-results-publication-fixtures/${count}`),
      ],
      {
        cwd: resolve(import.meta.dirname, '..'),
        env: {
          ...process.env,
          API_URL: `http://127.0.0.1:${address.port}`,
          SITE_URL: 'https://example.com',
        },
        stdio: 'inherit',
      }
    );
    const [code] = await once(child, 'exit');
    if (code !== 0) throw new Error(`Fixture ${count} failed: ${code}`);
  }
} finally {
  await stopServer(server);
}
