/**
 * ユニークIDを生成するデフォルト関数
 */
let idCounter = 0;
function generateDefaultId(): string {
  return `test-post-${Date.now()}-${++idCounter}`;
}

/**
 * ブログ記事の完全な型定義
 */
export interface MockPost {
  id: string;
  title: string;
  contentMarkdown: string;
  contentHtml: string;
  category: string;
  tags: string[];
  publishStatus: 'draft' | 'published';
  authorId?: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  imageUrls: string[];
}

/**
 * 記事作成用の入力データ型
 */
export interface MockPostData {
  title: string;
  contentMarkdown: string;
  category: string;
  tags?: string[];
  publishStatus: 'draft' | 'published';
  authorId?: string;
  imageUrls?: string[];
}

/**
 * 完全なブログ記事オブジェクトを生成するファクトリ関数
 *
 * @param overrides - オーバーライドするプロパティ
 * @returns モック記事オブジェクト
 *
 * @example
 * // デフォルト値で生成
 * const post = createMockPost();
 *
 * // カスタム値でオーバーライド
 * const post = createMockPost({ title: 'Custom Title', publishStatus: 'published' });
 */
export function createMockPost(overrides: Partial<MockPost> = {}): MockPost {
  const now = new Date().toISOString();
  const publishStatus = overrides.publishStatus || 'draft';

  const defaultPost: MockPost = {
    id: generateDefaultId(),
    title: 'Test Blog Post',
    contentMarkdown: '# Test Heading\n\nThis is a **test** blog post content.',
    contentHtml: '<h1>Test Heading</h1>\n<p>This is a <strong>test</strong> blog post content.</p>',
    category: 'Technology',
    tags: ['test', 'blog'],
    publishStatus,
    authorId: 'test-author-001',
    createdAt: now,
    updatedAt: now,
    publishedAt: publishStatus === 'published' ? now : undefined,
    imageUrls: [],
  };

  return {
    ...defaultPost,
    ...overrides,
    // publishStatusが変更された場合、publishedAtを適切に設定
    publishedAt: overrides.publishStatus === 'published' && !overrides.publishedAt
      ? now
      : overrides.publishedAt || defaultPost.publishedAt,
  };
}

/**
 * 記事作成用の入力データを生成するファクトリ関数
 * （サーバー側で生成されるフィールドを含まない）
 *
 * @param overrides - オーバーライドするプロパティ
 * @returns モック記事入力データ
 *
 * @example
 * const postData = createMockPostData();
 * const postData = createMockPostData({ title: 'My Post' });
 */
export function createMockPostData(overrides: Partial<MockPostData> = {}): MockPostData {
  const defaultData: MockPostData = {
    title: 'Test Blog Post',
    contentMarkdown: '# Test Heading\n\nThis is a **test** blog post content.',
    category: 'Technology',
    tags: ['test', 'blog'],
    publishStatus: 'draft',
    authorId: 'test-author-001',
    imageUrls: [],
  };

  return {
    ...defaultData,
    ...overrides,
  };
}
