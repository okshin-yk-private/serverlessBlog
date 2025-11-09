import {
  DynamoDBClient,
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

/**
 * DynamoDB GSI Query Patterns Integration Tests
 *
 * Task 7.2: データベース統合テストの実装
 * Requirements: R30 (統合テスト), R17 (GSI設計), R18 (クエリ最適化)
 *
 * このテストスイートは、Global Secondary Indexes (GSI) のクエリパターンを検証します：
 * - CategoryIndex: カテゴリ別記事一覧取得（category + createdAt）
 * - PublishStatusIndex: 公開/下書き記事一覧取得（publishStatus + createdAt）
 * - クエリ最適化: Scan操作を避けたQuery操作の使用
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

const TABLE_NAME = 'test-gsi-queries-table';

describe('DynamoDB GSI Query Patterns - Integration Tests', () => {
  // GSI付きテーブルの作成
  beforeAll(async () => {
    try {
      await dynamoDBClient.send(
        new CreateTableCommand({
          TableName: TABLE_NAME,
          KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
          AttributeDefinitions: [
            { AttributeName: 'id', AttributeType: 'S' },
            { AttributeName: 'category', AttributeType: 'S' },
            { AttributeName: 'createdAt', AttributeType: 'S' },
            { AttributeName: 'publishStatus', AttributeType: 'S' },
          ],
          GlobalSecondaryIndexes: [
            {
              IndexName: 'CategoryIndex',
              KeySchema: [
                { AttributeName: 'category', KeyType: 'HASH' },
                { AttributeName: 'createdAt', KeyType: 'RANGE' },
              ],
              Projection: {
                ProjectionType: 'ALL',
              },
            },
            {
              IndexName: 'PublishStatusIndex',
              KeySchema: [
                { AttributeName: 'publishStatus', KeyType: 'HASH' },
                { AttributeName: 'createdAt', KeyType: 'RANGE' },
              ],
              Projection: {
                ProjectionType: 'ALL',
              },
            },
          ],
          BillingMode: 'PAY_PER_REQUEST',
        })
      );

      // テーブルとGSIがアクティブになるまで待機
      let tableReady = false;
      for (let i = 0; i < 30; i++) {
        try {
          const result = await dynamoDBClient.send(
            new DescribeTableCommand({
              TableName: TABLE_NAME,
            })
          );

          const tableStatus = result.Table?.TableStatus;
          const gsiStatuses =
            result.Table?.GlobalSecondaryIndexes?.map(
              (gsi) => gsi.IndexStatus
            ) || [];

          if (
            tableStatus === 'ACTIVE' &&
            gsiStatuses.every((status) => status === 'ACTIVE')
          ) {
            tableReady = true;
            break;
          }
        } catch (error) {
          // テーブルがまだ作成中
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      if (!tableReady) {
        throw new Error('テーブルまたはGSIの作成がタイムアウトしました');
      }

      // テストデータの投入
      await seedTestData();
    } catch (error: any) {
      if (error.name !== 'ResourceInUseException') {
        throw error;
      }
    }
  });

  // テーブルの削除
  afterAll(async () => {
    try {
      await dynamoDBClient.send(
        new DeleteTableCommand({
          TableName: TABLE_NAME,
        })
      );
    } catch (error: any) {
      // テーブルが既に削除されている場合は無視
    }
  });

  // テストデータの投入
  async function seedTestData() {
    const posts = [
      {
        id: 'post-1',
        title: 'Technology Post 1',
        contentMarkdown: '# Tech 1',
        contentHTML: '<h1>Tech 1</h1>',
        category: 'technology',
        tags: ['tech'],
        publishStatus: 'published',
        authorId: 'author-1',
        createdAt: '2025-01-01T10:00:00.000Z',
        updatedAt: '2025-01-01T10:00:00.000Z',
        publishedAt: '2025-01-01T10:00:00.000Z',
        imageUrls: [],
      },
      {
        id: 'post-2',
        title: 'Technology Post 2',
        contentMarkdown: '# Tech 2',
        contentHTML: '<h1>Tech 2</h1>',
        category: 'technology',
        tags: ['tech'],
        publishStatus: 'published',
        authorId: 'author-1',
        createdAt: '2025-01-02T10:00:00.000Z',
        updatedAt: '2025-01-02T10:00:00.000Z',
        publishedAt: '2025-01-02T10:00:00.000Z',
        imageUrls: [],
      },
      {
        id: 'post-3',
        title: 'Technology Draft',
        contentMarkdown: '# Tech Draft',
        contentHTML: '<h1>Tech Draft</h1>',
        category: 'technology',
        tags: ['tech', 'draft'],
        publishStatus: 'draft',
        authorId: 'author-1',
        createdAt: '2025-01-03T10:00:00.000Z',
        updatedAt: '2025-01-03T10:00:00.000Z',
        imageUrls: [],
      },
      {
        id: 'post-4',
        title: 'Life Post 1',
        contentMarkdown: '# Life 1',
        contentHTML: '<h1>Life 1</h1>',
        category: 'life',
        tags: ['life'],
        publishStatus: 'published',
        authorId: 'author-1',
        createdAt: '2025-01-04T10:00:00.000Z',
        updatedAt: '2025-01-04T10:00:00.000Z',
        publishedAt: '2025-01-04T10:00:00.000Z',
        imageUrls: [],
      },
      {
        id: 'post-5',
        title: 'Life Post 2',
        contentMarkdown: '# Life 2',
        contentHTML: '<h1>Life 2</h1>',
        category: 'life',
        tags: ['life'],
        publishStatus: 'published',
        authorId: 'author-1',
        createdAt: '2025-01-05T10:00:00.000Z',
        updatedAt: '2025-01-05T10:00:00.000Z',
        publishedAt: '2025-01-05T10:00:00.000Z',
        imageUrls: [],
      },
      {
        id: 'post-6',
        title: 'Life Draft',
        contentMarkdown: '# Life Draft',
        contentHTML: '<h1>Life Draft</h1>',
        category: 'life',
        tags: ['life', 'draft'],
        publishStatus: 'draft',
        authorId: 'author-1',
        createdAt: '2025-01-06T10:00:00.000Z',
        updatedAt: '2025-01-06T10:00:00.000Z',
        imageUrls: [],
      },
    ];

    for (const post of posts) {
      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: post,
        })
      );
    }
  }

  describe('CategoryIndex - カテゴリ別記事一覧', () => {
    it('should query posts by technology category', async () => {
      // Act
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'CategoryIndex',
          KeyConditionExpression: 'category = :category',
          ExpressionAttributeValues: {
            ':category': 'technology',
          },
        })
      );

      // Assert
      expect(result.Items).toHaveLength(3);
      expect(
        result.Items?.every((item) => item.category === 'technology')
      ).toBe(true);
    });

    it('should query posts by life category', async () => {
      // Act
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'CategoryIndex',
          KeyConditionExpression: 'category = :category',
          ExpressionAttributeValues: {
            ':category': 'life',
          },
        })
      );

      // Assert
      expect(result.Items).toHaveLength(3);
      expect(result.Items?.every((item) => item.category === 'life')).toBe(
        true
      );
    });

    it('should return posts sorted by createdAt ascending (default)', async () => {
      // Act
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'CategoryIndex',
          KeyConditionExpression: 'category = :category',
          ExpressionAttributeValues: {
            ':category': 'technology',
          },
        })
      );

      // Assert
      expect(result.Items).toHaveLength(3);
      expect(result.Items?.[0].createdAt).toBe('2025-01-01T10:00:00.000Z');
      expect(result.Items?.[1].createdAt).toBe('2025-01-02T10:00:00.000Z');
      expect(result.Items?.[2].createdAt).toBe('2025-01-03T10:00:00.000Z');
    });

    it('should return posts sorted by createdAt descending (ScanIndexForward: false)', async () => {
      // Act
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'CategoryIndex',
          KeyConditionExpression: 'category = :category',
          ExpressionAttributeValues: {
            ':category': 'technology',
          },
          ScanIndexForward: false, // 降順ソート
        })
      );

      // Assert
      expect(result.Items).toHaveLength(3);
      expect(result.Items?.[0].createdAt).toBe('2025-01-03T10:00:00.000Z');
      expect(result.Items?.[1].createdAt).toBe('2025-01-02T10:00:00.000Z');
      expect(result.Items?.[2].createdAt).toBe('2025-01-01T10:00:00.000Z');
    });

    it('should filter posts by createdAt range (after specific date)', async () => {
      // Act
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'CategoryIndex',
          KeyConditionExpression:
            'category = :category AND createdAt > :createdAt',
          ExpressionAttributeValues: {
            ':category': 'technology',
            ':createdAt': '2025-01-01T10:00:00.000Z',
          },
        })
      );

      // Assert
      expect(result.Items).toHaveLength(2);
      expect(
        result.Items?.every(
          (item) => item.createdAt > '2025-01-01T10:00:00.000Z'
        )
      ).toBe(true);
    });

    it('should filter posts by createdAt range (between dates)', async () => {
      // Act
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'CategoryIndex',
          KeyConditionExpression:
            'category = :category AND createdAt BETWEEN :startDate AND :endDate',
          ExpressionAttributeValues: {
            ':category': 'technology',
            ':startDate': '2025-01-01T00:00:00.000Z',
            ':endDate': '2025-01-02T23:59:59.999Z',
          },
        })
      );

      // Assert
      expect(result.Items).toHaveLength(2);
      expect(result.Items?.map((item) => item.id)).toContain('post-1');
      expect(result.Items?.map((item) => item.id)).toContain('post-2');
    });

    it('should return empty array for non-existent category', async () => {
      // Act
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'CategoryIndex',
          KeyConditionExpression: 'category = :category',
          ExpressionAttributeValues: {
            ':category': 'non-existent-category',
          },
        })
      );

      // Assert
      expect(result.Items).toEqual([]);
    });
  });

  describe('PublishStatusIndex - 公開/下書き記事一覧', () => {
    it('should query published posts', async () => {
      // Act
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'PublishStatusIndex',
          KeyConditionExpression: 'publishStatus = :publishStatus',
          ExpressionAttributeValues: {
            ':publishStatus': 'published',
          },
        })
      );

      // Assert
      expect(result.Items).toHaveLength(4);
      expect(
        result.Items?.every((item) => item.publishStatus === 'published')
      ).toBe(true);
    });

    it('should query draft posts', async () => {
      // Act
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'PublishStatusIndex',
          KeyConditionExpression: 'publishStatus = :publishStatus',
          ExpressionAttributeValues: {
            ':publishStatus': 'draft',
          },
        })
      );

      // Assert
      expect(result.Items).toHaveLength(2);
      expect(
        result.Items?.every((item) => item.publishStatus === 'draft')
      ).toBe(true);
    });

    it('should return published posts sorted by createdAt descending', async () => {
      // Act
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'PublishStatusIndex',
          KeyConditionExpression: 'publishStatus = :publishStatus',
          ExpressionAttributeValues: {
            ':publishStatus': 'published',
          },
          ScanIndexForward: false, // 降順ソート
        })
      );

      // Assert
      expect(result.Items).toHaveLength(4);
      expect(result.Items?.[0].createdAt).toBe('2025-01-05T10:00:00.000Z');
      expect(result.Items?.[1].createdAt).toBe('2025-01-04T10:00:00.000Z');
      expect(result.Items?.[2].createdAt).toBe('2025-01-02T10:00:00.000Z');
      expect(result.Items?.[3].createdAt).toBe('2025-01-01T10:00:00.000Z');
    });

    it('should filter published posts by createdAt range', async () => {
      // Act
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'PublishStatusIndex',
          KeyConditionExpression:
            'publishStatus = :publishStatus AND createdAt >= :createdAt',
          ExpressionAttributeValues: {
            ':publishStatus': 'published',
            ':createdAt': '2025-01-04T00:00:00.000Z',
          },
        })
      );

      // Assert
      expect(result.Items).toHaveLength(2);
      expect(result.Items?.map((item) => item.id)).toContain('post-4');
      expect(result.Items?.map((item) => item.id)).toContain('post-5');
    });
  });

  describe('Combined Queries - GSI + FilterExpression', () => {
    it('should query technology category with published status filter', async () => {
      // Act
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'CategoryIndex',
          KeyConditionExpression: 'category = :category',
          FilterExpression: 'publishStatus = :publishStatus',
          ExpressionAttributeValues: {
            ':category': 'technology',
            ':publishStatus': 'published',
          },
        })
      );

      // Assert
      expect(result.Items).toHaveLength(2);
      expect(
        result.Items?.every(
          (item) =>
            item.category === 'technology' && item.publishStatus === 'published'
        )
      ).toBe(true);
    });

    it('should query published posts with life category filter', async () => {
      // Act
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'PublishStatusIndex',
          KeyConditionExpression: 'publishStatus = :publishStatus',
          FilterExpression: 'category = :category',
          ExpressionAttributeValues: {
            ':publishStatus': 'published',
            ':category': 'life',
          },
        })
      );

      // Assert
      expect(result.Items).toHaveLength(2);
      expect(
        result.Items?.every(
          (item) =>
            item.publishStatus === 'published' && item.category === 'life'
        )
      ).toBe(true);
    });

    it('should query with tag filter using contains', async () => {
      // Act
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'CategoryIndex',
          KeyConditionExpression: 'category = :category',
          FilterExpression: 'contains(tags, :tag)',
          ExpressionAttributeValues: {
            ':category': 'technology',
            ':tag': 'draft',
          },
        })
      );

      // Assert
      expect(result.Items).toHaveLength(1);
      expect(result.Items?.[0].id).toBe('post-3');
    });
  });

  describe('Query Optimization - Avoiding Scan', () => {
    it('should use Query instead of Scan for better performance', async () => {
      // Act
      const queryResult = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'CategoryIndex',
          KeyConditionExpression: 'category = :category',
          ExpressionAttributeValues: {
            ':category': 'technology',
          },
        })
      );

      // Assert
      // QueryはScanよりも効率的であり、パーティションキーで直接検索する
      expect(queryResult.Items).toBeDefined();
      expect(queryResult.Items!.length).toBeGreaterThan(0);
      // ScannedCountとCountが一致することを確認（フィルタリングなし）
      expect(queryResult.ScannedCount).toBe(queryResult.Count);
    });

    it('should measure query efficiency with ScannedCount vs Count', async () => {
      // Act
      const result = await docClient.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'PublishStatusIndex',
          KeyConditionExpression: 'publishStatus = :publishStatus',
          FilterExpression: 'category = :category',
          ExpressionAttributeValues: {
            ':publishStatus': 'published',
            ':category': 'technology',
          },
        })
      );

      // Assert
      // ScannedCountはFilterExpression適用前の件数
      expect(result.ScannedCount).toBe(4); // published記事は4件
      // Countはフィルタ後の件数
      expect(result.Count).toBe(2); // technology + published は2件
    });
  });
});
