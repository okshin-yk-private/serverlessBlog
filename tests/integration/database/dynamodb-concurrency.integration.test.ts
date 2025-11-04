import { DynamoDBClient, CreateTableCommand, DeleteTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';

/**
 * DynamoDB Concurrency and Data Consistency Integration Tests
 *
 * Task 7.2: データベース統合テストの実装
 * Requirements: R30 (統合テスト), R16 (DynamoDB永続化), R37 (高可用性)
 *
 * このテストスイートは、同時操作とデータ整合性を検証します：
 * - 同時書き込み操作（Concurrent Writes）
 * - 同時読み取り操作（Concurrent Reads）
 * - 更新と削除の競合（Update/Delete Conflicts）
 * - データ整合性の保証（Eventual Consistency）
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

const TABLE_NAME = 'test-concurrency-table';

describe('DynamoDB Concurrency and Data Consistency - Integration Tests', () => {

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

  // 各テスト前にテーブルをクリーンアップ
  beforeEach(async () => {
    // テストケース間のデータをクリーンアップ
    const itemsToDelete = ['concurrent-write-1', 'concurrent-write-2', 'concurrent-write-3', 'concurrent-read-1', 'concurrent-update-1', 'concurrent-delete-1', 'race-condition-1'];

    for (const id of itemsToDelete) {
      try {
        await docClient.send(new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { id },
        }));
      } catch (error) {
        // アイテムが存在しない場合は無視
      }
    }
  });

  describe('Concurrent Writes - 同時書き込み操作', () => {
    it('should handle multiple concurrent PutItem operations', async () => {
      // Arrange
      const items = [
        {
          id: 'concurrent-write-1',
          title: 'Concurrent Post 1',
          contentMarkdown: '# Concurrent 1',
          contentHTML: '<h1>Concurrent 1</h1>',
          category: 'technology',
          tags: [],
          publishStatus: 'published',
          authorId: 'author-1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          imageUrls: [],
        },
        {
          id: 'concurrent-write-2',
          title: 'Concurrent Post 2',
          contentMarkdown: '# Concurrent 2',
          contentHTML: '<h1>Concurrent 2</h1>',
          category: 'life',
          tags: [],
          publishStatus: 'draft',
          authorId: 'author-1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          imageUrls: [],
        },
        {
          id: 'concurrent-write-3',
          title: 'Concurrent Post 3',
          contentMarkdown: '# Concurrent 3',
          contentHTML: '<h1>Concurrent 3</h1>',
          category: 'technology',
          tags: [],
          publishStatus: 'published',
          authorId: 'author-1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          imageUrls: [],
        },
      ];

      // Act - 同時に複数のPutCommandを実行
      await Promise.all(items.map(item =>
        docClient.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: item,
        }))
      ));

      // Assert - すべてのアイテムが正常に書き込まれたことを確認
      const results = await Promise.all(items.map(item =>
        docClient.send(new GetCommand({
          TableName: TABLE_NAME,
          Key: { id: item.id },
        }))
      ));

      expect(results[0].Item?.title).toBe('Concurrent Post 1');
      expect(results[1].Item?.title).toBe('Concurrent Post 2');
      expect(results[2].Item?.title).toBe('Concurrent Post 3');
    });

    it('should handle last-write-wins for concurrent writes to same key', async () => {
      // Arrange
      const postId = 'concurrent-write-1';

      // Act - 同じIDに対して異なる内容を同時に書き込む
      await Promise.all([
        docClient.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            id: postId,
            title: 'Version A',
            contentMarkdown: '# A',
            contentHTML: '<h1>A</h1>',
            category: 'technology',
            tags: [],
            publishStatus: 'published',
            authorId: 'author-1',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            imageUrls: [],
            version: 'A',
          },
        })),
        docClient.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            id: postId,
            title: 'Version B',
            contentMarkdown: '# B',
            contentHTML: '<h1>B</h1>',
            category: 'life',
            tags: [],
            publishStatus: 'draft',
            authorId: 'author-1',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            imageUrls: [],
            version: 'B',
          },
        })),
      ]);

      // Assert - いずれかのバージョンが最終的に保存されている（Last-Write-Wins）
      const result = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: postId },
      }));

      expect(result.Item).toBeDefined();
      expect(['A', 'B']).toContain(result.Item?.version);
    });
  });

  describe('Concurrent Reads - 同時読み取り操作', () => {
    it('should handle multiple concurrent GetItem operations', async () => {
      // Arrange
      const postId = 'concurrent-read-1';
      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          id: postId,
          title: 'Read Test Post',
          contentMarkdown: '# Read',
          contentHTML: '<h1>Read</h1>',
          category: 'technology',
          tags: [],
          publishStatus: 'published',
          authorId: 'author-1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          imageUrls: [],
        },
      }));

      // Act - 同時に複数のGetCommandを実行
      const results = await Promise.all([
        docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { id: postId } })),
        docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { id: postId } })),
        docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { id: postId } })),
        docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { id: postId } })),
        docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { id: postId } })),
      ]);

      // Assert - すべての読み取りが成功し、同じデータを返す
      expect(results.every(result => result.Item?.title === 'Read Test Post')).toBe(true);
      expect(results.every(result => result.Item?.id === postId)).toBe(true);
    });

    it('should handle concurrent reads with non-existent items', async () => {
      // Act - 存在しないアイテムに対して同時に読み取り
      const results = await Promise.all([
        docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { id: 'non-existent-1' } })),
        docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { id: 'non-existent-2' } })),
        docClient.send(new GetCommand({ TableName: TABLE_NAME, Key: { id: 'non-existent-3' } })),
      ]);

      // Assert - すべての読み取りがundefinedを返す
      expect(results.every(result => result.Item === undefined)).toBe(true);
    });
  });

  describe('Update Conflicts - 更新の競合', () => {
    it('should handle concurrent updates to the same item', async () => {
      // Arrange
      const postId = 'concurrent-update-1';
      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          id: postId,
          title: 'Original Title',
          contentMarkdown: '# Original',
          contentHTML: '<h1>Original</h1>',
          category: 'technology',
          tags: [],
          publishStatus: 'draft',
          authorId: 'author-1',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
          imageUrls: [],
        },
      }));

      // Act - 同時に異なるフィールドを更新
      await Promise.all([
        docClient.send(new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { id: postId },
          UpdateExpression: 'SET title = :title',
          ExpressionAttributeValues: { ':title': 'Updated Title A' },
        })),
        docClient.send(new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { id: postId },
          UpdateExpression: 'SET category = :category',
          ExpressionAttributeValues: { ':category': 'life' },
        })),
      ]);

      // Assert - 最終的な状態を確認
      const result = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: postId },
      }));

      expect(result.Item).toBeDefined();
      // 少なくとも一方の更新が反映されている
      expect(result.Item?.title === 'Updated Title A' || result.Item?.category === 'life').toBe(true);
    });

    it('should handle concurrent updates to the same field (last-write-wins)', async () => {
      // Arrange
      const postId = 'concurrent-update-1';
      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          id: postId,
          title: 'Original',
          contentMarkdown: '# Original',
          contentHTML: '<h1>Original</h1>',
          category: 'technology',
          tags: [],
          publishStatus: 'draft',
          authorId: 'author-1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          imageUrls: [],
        },
      }));

      // Act - 同じフィールドを同時に更新
      await Promise.all([
        docClient.send(new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { id: postId },
          UpdateExpression: 'SET title = :title',
          ExpressionAttributeValues: { ':title': 'Title Version A' },
        })),
        docClient.send(new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { id: postId },
          UpdateExpression: 'SET title = :title',
          ExpressionAttributeValues: { ':title': 'Title Version B' },
        })),
      ]);

      // Assert - いずれかのバージョンが最終的に保存されている
      const result = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: postId },
      }));

      expect(result.Item).toBeDefined();
      expect(['Title Version A', 'Title Version B']).toContain(result.Item?.title);
    });
  });

  describe('Update and Delete Race Conditions - 更新と削除の競合', () => {
    it('should handle concurrent update and delete operations', async () => {
      // Arrange
      const postId = 'concurrent-delete-1';
      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          id: postId,
          title: 'To Be Deleted',
          contentMarkdown: '# Delete',
          contentHTML: '<h1>Delete</h1>',
          category: 'technology',
          tags: [],
          publishStatus: 'draft',
          authorId: 'author-1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          imageUrls: [],
        },
      }));

      // Act - 更新と削除を同時に実行
      await Promise.all([
        docClient.send(new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { id: postId },
          UpdateExpression: 'SET title = :title',
          ExpressionAttributeValues: { ':title': 'Updated Title' },
        })),
        docClient.send(new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { id: postId },
        })),
      ]);

      // Assert - アイテムが削除されているか、更新されているか
      const result = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: postId },
      }));

      // DynamoDBの動作により、削除されているか更新されているかのいずれか
      if (result.Item) {
        // 更新が後に実行された場合
        expect(result.Item.title).toBe('Updated Title');
      } else {
        // 削除が後に実行された場合
        expect(result.Item).toBeUndefined();
      }
    });

    it('should handle delete operations on non-existent items', async () => {
      // Act - 存在しないアイテムの削除を同時に実行
      await expect(Promise.all([
        docClient.send(new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { id: 'non-existent-1' },
        })),
        docClient.send(new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { id: 'non-existent-2' },
        })),
      ])).resolves.not.toThrow();

      // Assert - エラーが発生しないことを確認（DynamoDBは存在しないアイテムの削除でエラーを投げない）
    });
  });

  describe('Data Consistency - データ整合性', () => {
    it('should maintain consistency for sequential operations', async () => {
      // Arrange
      const postId = 'race-condition-1';

      // Act - 順次操作を実行
      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          id: postId,
          title: 'Step 1',
          contentMarkdown: '# 1',
          contentHTML: '<h1>1</h1>',
          category: 'technology',
          tags: [],
          publishStatus: 'draft',
          authorId: 'author-1',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          imageUrls: [],
        },
      }));

      await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: postId },
        UpdateExpression: 'SET title = :title',
        ExpressionAttributeValues: { ':title': 'Step 2' },
      }));

      await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: postId },
        UpdateExpression: 'SET title = :title',
        ExpressionAttributeValues: { ':title': 'Step 3' },
      }));

      // Assert - 最終的な状態が正しい
      const result = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: { id: postId },
      }));

      expect(result.Item?.title).toBe('Step 3');
    });

    it('should handle high-concurrency write operations', async () => {
      // Arrange
      const concurrentWrites = 20;
      const postIds = Array.from({ length: concurrentWrites }, (_, i) => `high-concurrency-${i}`);

      // Act - 高並行度の書き込み操作
      await Promise.all(postIds.map(id =>
        docClient.send(new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            id,
            title: `Post ${id}`,
            contentMarkdown: `# ${id}`,
            contentHTML: `<h1>${id}</h1>`,
            category: 'technology',
            tags: [],
            publishStatus: 'published',
            authorId: 'author-1',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            imageUrls: [],
          },
        }))
      ));

      // Assert - すべてのアイテムが正常に書き込まれた
      const results = await Promise.all(postIds.map(id =>
        docClient.send(new GetCommand({
          TableName: TABLE_NAME,
          Key: { id },
        }))
      ));

      expect(results.every(result => result.Item !== undefined)).toBe(true);
      expect(results.length).toBe(concurrentWrites);

      // クリーンアップ
      await Promise.all(postIds.map(id =>
        docClient.send(new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { id },
        }))
      ));
    });
  });
});
