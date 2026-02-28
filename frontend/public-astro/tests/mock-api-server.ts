/**
 * テスト用モックAPIサーバー
 *
 * ビルドテスト時に使用するモックAPIサーバー
 * Node.js の http モジュールを使用（Vitest互換）
 */

import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from 'http';

export interface MockPost {
  id: string;
  title: string;
  contentHtml: string;
  category: string;
  tags: string[];
  publishStatus: 'draft' | 'published';
  authorId: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  imageUrls?: string[];
}

/**
 * テスト用の記事データ
 */
export const mockPosts: MockPost[] = [
  {
    id: 'post-1',
    title: 'テスト記事1',
    contentHtml: '<p>これはテスト記事1の本文です。</p>',
    category: 'tech',
    tags: ['test', 'astro'],
    publishStatus: 'published',
    authorId: 'author-1',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    publishedAt: '2024-01-01T00:00:00Z',
    imageUrls: ['https://example.com/images/test1.jpg'],
  },
  {
    id: 'post-2',
    title: '日本語タイトルの記事',
    contentHtml: '<p>日本語コンテンツのテストです。</p>',
    category: 'blog',
    tags: ['日本語', 'テスト'],
    publishStatus: 'published',
    authorId: 'author-1',
    createdAt: '2024-01-02T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
    publishedAt: '2024-01-02T00:00:00Z',
  },
  {
    id: 'post-3',
    title: 'Draft Post (Should not appear)',
    contentHtml: '<p>This is a draft post.</p>',
    category: 'draft',
    tags: ['draft'],
    publishStatus: 'draft',
    authorId: 'author-1',
    createdAt: '2024-01-03T00:00:00Z',
    updatedAt: '2024-01-03T00:00:00Z',
  },
];

/**
 * レスポンスを送信
 */
function sendJson(
  res: ServerResponse,
  statusCode: number,
  data: unknown
): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

/**
 * モックAPIサーバーを起動
 */
export function createMockApiServer(port: number = 3456): Server {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`);

    // Handle OPTIONS for CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    // GET /posts - 記事一覧
    if (url.pathname === '/posts' && req.method === 'GET') {
      const publishStatus = url.searchParams.get('publishStatus');

      let filteredPosts = mockPosts;
      if (publishStatus) {
        filteredPosts = mockPosts.filter(
          (p) => p.publishStatus === publishStatus
        );
      }

      sendJson(res, 200, {
        items: filteredPosts,
        count: filteredPosts.length,
      });
      return;
    }

    // GET /posts/:id - 記事詳細
    const postMatch = url.pathname.match(/^\/posts\/([^/]+)$/);
    if (postMatch && req.method === 'GET') {
      const postId = postMatch[1];
      const post = mockPosts.find((p) => p.id === postId);

      if (post) {
        sendJson(res, 200, post);
        return;
      }

      sendJson(res, 404, { error: 'Not Found' });
      return;
    }

    // 404 for other routes
    sendJson(res, 404, { error: 'Not Found' });
  });

  server.listen(port, () => {
    console.log(`Mock API server running at http://localhost:${port}`);
  });

  return server;
}

/**
 * サーバーを停止（Promise版）
 */
export function stopServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// CLI で直接実行した場合
if (import.meta.main) {
  const port = parseInt(process.env.PORT || '3456', 10);
  createMockApiServer(port);
}
