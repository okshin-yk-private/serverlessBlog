import { DynamoDBClient, CreateTableCommand, DeleteTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

/**
 * DynamoDB CRUD Operations Integration Tests
 *
 * Task 7.2: データベース統合テストの実装
 * Requirements: R30 (統合テスト), R16 (DynamoDB永続化), R18 (クエリ最適化)
 *
 * このテストスイートは、DynamoDBの基本的なCRUD操作を統合環境で検証します：
 * - PutItem: 記事の作成
 * - GetItem: 記事の取得
 * - UpdateItem: 記事の更新
 * - DeleteItem: 記事の削除
 * - Scan: 全記事の取得（テスト検証用）
 */

// DynamoDBクライアントのセットアップ
const dynamoDBClient = new DynamoDBClient({
  endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
  },
});

const docClient = DynamoDBDocumentClient.from(dynamoDBClient);

const TABLE_NAME = 'test-crud-integration-table';

describe('DynamoDB CRUD Operations - Integration Tests', () => {

  // テーブルの作成
  beforeAll(async () => {
    try {
      await dynamoDBClient.send(new CreateTableCommand({
        TableName: TABLE_NAME,
        KeySchema: [
          { AttributeName: 'id', KeyType: 'HASH' },
        ],
        AttributeDefinitions: [
          { AttributeName: 'id', AttributeType: 'S' },
        ],
        BillingMode: 'PAY_PER_REQUEST',
      }));

      // テーブルがアクティブになるまで待機
      let tableReady = false;
      for (let i = 0; i < 10; i++) {
        try {
          const result = await dynamoDBClient.send(new DescribeTableCommand({
            TableName: TABLE_NAME,
          }));
          if (result.Table?.TableStatus === 'ACTIVE') {
            tableReady = true;
            break;
          }
        } catch (error) {
          // テーブルがまだ作成中
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      if (!tableReady) {
        throw new Error('テーブルの作成がタイムアウトしました');
      }
    } catch (error: any) {
      if (error.name !== 'ResourceInUseException') {
        throw error;
      }
    }
  });

  // テーブルの削除
  afterAll(async () => {
    try {
      await dynamoDBClient.send(new DeleteTableCommand({
        TableName: TABLE_NAME,
      }));
    } catch (error: any) {
      // テーブルが既に削除されている場合は無視
    }
  });

  // 各テスト後にテーブルをクリーンアップ
  afterEach(async () => {
    try {
      const scanResult = await docClient.send(new ScanCommand({
        TableName: TABLE_NAME,
      }));

      if (scanResult.Items && scanResult.Items.length > 0) {
        for (const item of scanResult.Items) {
          await docClient.send(new DeleteCommand({
            TableName: TABLE_NAME,
            Key: { id: item.id },
          }));
        }
      }
    } catch (error) {
      // エラーは無視
    }
  });

  describe('PutItem - 記事の作成', () => {
    it('should create a new blog post item', async () => {
      // Arrange
      const postItem = {
        id: 'test-post-id-1',
        title: 'Test Blog Post',
        contentMarkdown: '# Hello World\n\nThis is a test post.',
        contentHTML: '<h1>Hello World</h1>\n<p>This is a test post.</p>',
        category: 'technology',
        tags: ['test', 'integration'],
        publishStatus: 'published',
        authorId: 'test-author-id',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        publishedAt: new Date().toISOString(),
        imageUrls: ['https://example.com/image1.jpg'],
      };

      // Act
      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: postItem,
      }));

      // Assert
      const result = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: 'test-post-id-1' },
      }));

      expect(result.Item).toBeDefined();
      expect(result.Item?.id).toBe('test-post-id-1');
      expect(result.Item?.title).toBe('Test Blog Post');
      expect(result.Item?.category).toBe('technology');
      expect(result.Item?.publishStatus).toBe('published');
    });

    it('should create a draft blog post item', async () => {
      // Arrange
      const draftItem = {
        id: 'test-draft-id-1',
        title: 'Draft Blog Post',
        contentMarkdown: '# Work in Progress',
        contentHTML: '<h1>Work in Progress</h1>',
        category: 'life',
        tags: ['draft'],
        publishStatus: 'draft',
        authorId: 'test-author-id',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        imageUrls: [],
      };

      // Act
      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: draftItem,
      }));

      // Assert
      const result = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: 'test-draft-id-1' },
      }));

      expect(result.Item).toBeDefined();
      expect(result.Item?.publishStatus).toBe('draft');
      expect(result.Item?.publishedAt).toBeUndefined();
    });

    it('should overwrite existing item with same id', async () => {
      // Arrange
      const originalItem = {
        id: 'test-post-id-2',
        title: 'Original Title',
        contentMarkdown: '# Original',
        contentHTML: '<h1>Original</h1>',
        category: 'technology',
        tags: [],
        publishStatus: 'draft',
        authorId: 'test-author-id',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        imageUrls: [],
      };

      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: originalItem,
      }));

      // Act
      const updatedItem = {
        ...originalItem,
        title: 'Updated Title',
        contentMarkdown: '# Updated',
        contentHTML: '<h1>Updated</h1>',
      };

      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: updatedItem,
      }));

      // Assert
      const result = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: 'test-post-id-2' },
      }));

      expect(result.Item?.title).toBe('Updated Title');
      expect(result.Item?.contentMarkdown).toBe('# Updated');
    });
  });

  describe('GetItem - 記事の取得', () => {
    it('should retrieve an existing blog post by id', async () => {
      // Arrange
      const postItem = {
        id: 'test-get-id-1',
        title: 'Retrievable Post',
        contentMarkdown: '# Content',
        contentHTML: '<h1>Content</h1>',
        category: 'technology',
        tags: ['retrieve'],
        publishStatus: 'published',
        authorId: 'test-author-id',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        publishedAt: new Date().toISOString(),
        imageUrls: [],
      };

      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: postItem,
      }));

      // Act
      const result = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: 'test-get-id-1' },
      }));

      // Assert
      expect(result.Item).toBeDefined();
      expect(result.Item?.id).toBe('test-get-id-1');
      expect(result.Item?.title).toBe('Retrievable Post');
    });

    it('should return undefined for non-existent id', async () => {
      // Act
      const result = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: 'non-existent-id' },
      }));

      // Assert
      expect(result.Item).toBeUndefined();
    });

    it('should retrieve all attributes of a blog post', async () => {
      // Arrange
      const postItem = {
        id: 'test-get-id-2',
        title: 'Full Post',
        contentMarkdown: '# Full Content',
        contentHTML: '<h1>Full Content</h1>',
        category: 'life',
        tags: ['full', 'complete'],
        publishStatus: 'published',
        authorId: 'test-author-id',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-02T00:00:00.000Z',
        publishedAt: '2025-01-02T00:00:00.000Z',
        imageUrls: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg'],
      };

      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: postItem,
      }));

      // Act
      const result = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: 'test-get-id-2' },
      }));

      // Assert
      expect(result.Item).toEqual(postItem);
    });
  });

  describe('UpdateItem - 記事の更新', () => {
    it('should update title and updatedAt fields', async () => {
      // Arrange
      const originalItem = {
        id: 'test-update-id-1',
        title: 'Old Title',
        contentMarkdown: '# Content',
        contentHTML: '<h1>Content</h1>',
        category: 'technology',
        tags: [],
        publishStatus: 'draft',
        authorId: 'test-author-id',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        imageUrls: [],
      };

      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: originalItem,
      }));

      // Act
      const newUpdatedAt = new Date().toISOString();
      await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: 'test-update-id-1' },
        UpdateExpression: 'SET title = :title, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':title': 'New Title',
          ':updatedAt': newUpdatedAt,
        },
      }));

      // Assert
      const result = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: 'test-update-id-1' },
      }));

      expect(result.Item?.title).toBe('New Title');
      expect(result.Item?.updatedAt).toBe(newUpdatedAt);
      expect(result.Item?.createdAt).toBe('2025-01-01T00:00:00.000Z'); // createdAtは変更されない
    });

    it('should transition publishStatus from draft to published', async () => {
      // Arrange
      const draftItem = {
        id: 'test-update-id-2',
        title: 'Draft Post',
        contentMarkdown: '# Draft',
        contentHTML: '<h1>Draft</h1>',
        category: 'technology',
        tags: [],
        publishStatus: 'draft',
        authorId: 'test-author-id',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        imageUrls: [],
      };

      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: draftItem,
      }));

      // Act
      const publishedAt = new Date().toISOString();
      await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: 'test-update-id-2' },
        UpdateExpression: 'SET publishStatus = :publishStatus, publishedAt = :publishedAt, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':publishStatus': 'published',
          ':publishedAt': publishedAt,
          ':updatedAt': publishedAt,
        },
      }));

      // Assert
      const result = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: 'test-update-id-2' },
      }));

      expect(result.Item?.publishStatus).toBe('published');
      expect(result.Item?.publishedAt).toBe(publishedAt);
    });

    it('should update multiple fields simultaneously', async () => {
      // Arrange
      const originalItem = {
        id: 'test-update-id-3',
        title: 'Original',
        contentMarkdown: '# Original',
        contentHTML: '<h1>Original</h1>',
        category: 'technology',
        tags: ['old'],
        publishStatus: 'draft',
        authorId: 'test-author-id',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        imageUrls: [],
      };

      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: originalItem,
      }));

      // Act
      const newUpdatedAt = new Date().toISOString();
      await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: 'test-update-id-3' },
        UpdateExpression: 'SET title = :title, contentMarkdown = :markdown, contentHTML = :html, category = :category, tags = :tags, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':title': 'Updated Title',
          ':markdown': '# Updated',
          ':html': '<h1>Updated</h1>',
          ':category': 'life',
          ':tags': ['new', 'updated'],
          ':updatedAt': newUpdatedAt,
        },
      }));

      // Assert
      const result = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: 'test-update-id-3' },
      }));

      expect(result.Item?.title).toBe('Updated Title');
      expect(result.Item?.contentMarkdown).toBe('# Updated');
      expect(result.Item?.category).toBe('life');
      expect(result.Item?.tags).toEqual(['new', 'updated']);
    });

    it('should handle update on non-existent item (creates new item)', async () => {
      // Act
      await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: 'non-existent-update-id' },
        UpdateExpression: 'SET title = :title',
        ExpressionAttributeValues: {
          ':title': 'Created by Update',
        },
      }));

      // Assert
      const result = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: 'non-existent-update-id' },
      }));

      expect(result.Item).toBeDefined();
      expect(result.Item?.title).toBe('Created by Update');
    });
  });

  describe('DeleteItem - 記事の削除', () => {
    it('should delete an existing blog post', async () => {
      // Arrange
      const postItem = {
        id: 'test-delete-id-1',
        title: 'To Be Deleted',
        contentMarkdown: '# Delete Me',
        contentHTML: '<h1>Delete Me</h1>',
        category: 'technology',
        tags: [],
        publishStatus: 'draft',
        authorId: 'test-author-id',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        imageUrls: [],
      };

      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: postItem,
      }));

      // Act
      await docClient.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { id: 'test-delete-id-1' },
      }));

      // Assert
      const result = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: 'test-delete-id-1' },
      }));

      expect(result.Item).toBeUndefined();
    });

    it('should handle delete on non-existent item (no error)', async () => {
      // Act & Assert - DynamoDBは存在しないアイテムの削除時にエラーを投げない
      await expect(docClient.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { id: 'non-existent-delete-id' },
      }))).resolves.not.toThrow();
    });

    it('should delete item and verify with scan', async () => {
      // Arrange
      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          id: 'test-delete-id-2',
          title: 'Post 1',
          contentMarkdown: '#',
          contentHTML: '<h1></h1>',
          category: 'technology',
          tags: [],
          publishStatus: 'published',
          authorId: 'test-author-id',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          imageUrls: [],
        },
      }));

      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          id: 'test-delete-id-3',
          title: 'Post 2',
          contentMarkdown: '#',
          contentHTML: '<h1></h1>',
          category: 'technology',
          tags: [],
          publishStatus: 'published',
          authorId: 'test-author-id',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          imageUrls: [],
        },
      }));

      // Act
      await docClient.send(new DeleteCommand({
        TableName: TABLE_NAME,
        Key: { id: 'test-delete-id-2' },
      }));

      // Assert
      const scanResult = await docClient.send(new ScanCommand({
        TableName: TABLE_NAME,
      }));

      expect(scanResult.Items).toHaveLength(1);
      expect(scanResult.Items?.[0].id).toBe('test-delete-id-3');
    });
  });

  describe('Scan - 全記事の取得', () => {
    it('should scan all items in the table', async () => {
      // Arrange
      const items = [
        {
          id: 'scan-id-1',
          title: 'Post 1',
          contentMarkdown: '# 1',
          contentHTML: '<h1>1</h1>',
          category: 'technology',
          tags: [],
          publishStatus: 'published',
          authorId: 'test-author-id',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
          imageUrls: [],
        },
        {
          id: 'scan-id-2',
          title: 'Post 2',
          contentMarkdown: '# 2',
          contentHTML: '<h1>2</h1>',
          category: 'life',
          tags: [],
          publishStatus: 'draft',
          authorId: 'test-author-id',
          createdAt: '2025-01-02T00:00:00.000Z',
          updatedAt: '2025-01-02T00:00:00.000Z',
          imageUrls: [],
        },
        {
          id: 'scan-id-3',
          title: 'Post 3',
          contentMarkdown: '# 3',
          contentHTML: '<h1>3</h1>',
          category: 'technology',
          tags: [],
          publishStatus: 'published',
          authorId: 'test-author-id',
          createdAt: '2025-01-03T00:00:00.000Z',
          updatedAt: '2025-01-03T00:00:00.000Z',
          imageUrls: [],
        },
      ];

      for (const item of items) {
        await docClient.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: item,
        }));
      }

      // Act
      const result = await docClient.send(new ScanCommand({
        TableName: TABLE_NAME,
      }));

      // Assert
      expect(result.Items).toHaveLength(3);
      expect(result.Items?.map(item => item.id)).toContain('scan-id-1');
      expect(result.Items?.map(item => item.id)).toContain('scan-id-2');
      expect(result.Items?.map(item => item.id)).toContain('scan-id-3');
    });

    it('should return empty array for empty table', async () => {
      // Act
      const result = await docClient.send(new ScanCommand({
        TableName: TABLE_NAME,
      }));

      // Assert
      expect(result.Items).toEqual([]);
    });
  });
});
