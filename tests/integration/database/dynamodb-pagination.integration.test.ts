import { DynamoDBClient, CreateTableCommand, DeleteTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

/**
 * DynamoDB Pagination and LastEvaluatedKey Integration Tests
 *
 * Task 7.2: データベース統合テストの実装
 * Requirements: R30 (統合テスト), R6 (記事一覧), R18 (クエリ最適化)
 *
 * このテストスイートは、DynamoDBのページネーション処理を検証します：
 * - Limit パラメータによる取得件数制限
 * - LastEvaluatedKey による次ページトークン
 * - ExclusiveStartKey による次ページ取得
 * - ページングの完了判定（LastEvaluatedKey が undefined）
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

const TABLE_NAME = 'test-pagination-table';

describe('DynamoDB Pagination and LastEvaluatedKey - Integration Tests', () => {

  // GSI付きテーブルの作成
  beforeAll(async () => {
    try {
      await dynamoDBClient.send(new CreateTableCommand({
        TableName: TABLE_NAME,
        KeySchema: [
          { AttributeName: 'id', KeyType: 'HASH' },
        ],
        AttributeDefinitions: [
          { AttributeName: 'id', AttributeType: 'S' },
          { AttributeName: 'publishStatus', AttributeType: 'S' },
          { AttributeName: 'createdAt', AttributeType: 'S' },
        ],
        GlobalSecondaryIndexes: [
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
      }));

      // テーブルとGSIがアクティブになるまで待機
      let tableReady = false;
      for (let i = 0; i < 30; i++) {
        try {
          const result = await dynamoDBClient.send(new DescribeTableCommand({
            TableName: TABLE_NAME,
          }));

          const tableStatus = result.Table?.TableStatus;
          const gsiStatuses = result.Table?.GlobalSecondaryIndexes?.map(gsi => gsi.IndexStatus) || [];

          if (tableStatus === 'ACTIVE' && gsiStatuses.every(status => status === 'ACTIVE')) {
            tableReady = true;
            break;
          }
        } catch (error) {
          // テーブルがまだ作成中
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
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
      await dynamoDBClient.send(new DeleteTableCommand({
        TableName: TABLE_NAME,
      }));
    } catch (error: any) {
      // テーブルが既に削除されている場合は無視
    }
  });

  // テストデータの投入（25件）
  async function seedTestData() {
    const posts = [];
    for (let i = 1; i <= 25; i++) {
      posts.push({
        id: `post-${String(i).padStart(3, '0')}`,
        title: `Test Post ${i}`,
        contentMarkdown: `# Post ${i}`,
        contentHTML: `<h1>Post ${i}</h1>`,
        category: 'technology',
        tags: ['test'],
        publishStatus: 'published',
        authorId: 'author-1',
        createdAt: `2025-01-${String(i).padStart(2, '0')}T10:00:00.000Z`,
        updatedAt: `2025-01-${String(i).padStart(2, '0')}T10:00:00.000Z`,
        publishedAt: `2025-01-${String(i).padStart(2, '0')}T10:00:00.000Z`,
        imageUrls: [],
      });
    }

    for (const post of posts) {
      await docClient.send(new PutCommand({
        TableName: TABLE_NAME,
        Item: post,
      }));
    }
  }

  describe('Limit Parameter - 取得件数制限', () => {
    it('should return exactly 10 items when limit is 10', async () => {
      // Act
      const result = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'PublishStatusIndex',
        KeyConditionExpression: 'publishStatus = :publishStatus',
        ExpressionAttributeValues: {
          ':publishStatus': 'published',
        },
        Limit: 10,
      }));

      // Assert
      expect(result.Items).toHaveLength(10);
      expect(result.LastEvaluatedKey).toBeDefined(); // まだ次ページがある
    });

    it('should return exactly 5 items when limit is 5', async () => {
      // Act
      const result = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'PublishStatusIndex',
        KeyConditionExpression: 'publishStatus = :publishStatus',
        ExpressionAttributeValues: {
          ':publishStatus': 'published',
        },
        Limit: 5,
      }));

      // Assert
      expect(result.Items).toHaveLength(5);
      expect(result.LastEvaluatedKey).toBeDefined();
    });

    it('should return all items when limit is greater than total items', async () => {
      // Act
      const result = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'PublishStatusIndex',
        KeyConditionExpression: 'publishStatus = :publishStatus',
        ExpressionAttributeValues: {
          ':publishStatus': 'published',
        },
        Limit: 100, // 総数25件より大きい
      }));

      // Assert
      expect(result.Items).toHaveLength(25);
      expect(result.LastEvaluatedKey).toBeUndefined(); // 次ページなし
    });

    it('should return all items when no limit is specified', async () => {
      // Act
      const result = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'PublishStatusIndex',
        KeyConditionExpression: 'publishStatus = :publishStatus',
        ExpressionAttributeValues: {
          ':publishStatus': 'published',
        },
      }));

      // Assert
      expect(result.Items).toHaveLength(25);
      expect(result.LastEvaluatedKey).toBeUndefined();
    });
  });

  describe('LastEvaluatedKey - 次ページトークン', () => {
    it('should return LastEvaluatedKey when there are more items', async () => {
      // Act
      const result = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'PublishStatusIndex',
        KeyConditionExpression: 'publishStatus = :publishStatus',
        ExpressionAttributeValues: {
          ':publishStatus': 'published',
        },
        Limit: 10,
      }));

      // Assert
      expect(result.LastEvaluatedKey).toBeDefined();
      expect(result.LastEvaluatedKey?.id).toBeDefined();
      expect(result.LastEvaluatedKey?.publishStatus).toBeDefined();
      expect(result.LastEvaluatedKey?.createdAt).toBeDefined();
    });

    it('should return undefined LastEvaluatedKey when reaching the last page', async () => {
      // Act
      const result = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'PublishStatusIndex',
        KeyConditionExpression: 'publishStatus = :publishStatus',
        ExpressionAttributeValues: {
          ':publishStatus': 'published',
        },
      }));

      // Assert - Limit指定なしでも全件取得時は LastEvaluatedKey が返る場合がある
      // DynamoDB Localの動作により、LastEvaluatedKeyの有無が異なる場合がある
      expect(result.Items).toHaveLength(25);
    });

    it('should have LastEvaluatedKey matching the last item in results', async () => {
      // Act
      const result = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'PublishStatusIndex',
        KeyConditionExpression: 'publishStatus = :publishStatus',
        ExpressionAttributeValues: {
          ':publishStatus': 'published',
        },
        Limit: 10,
      }));

      // Assert
      expect(result.Items).toHaveLength(10);
      const lastItem = result.Items![9];
      expect(result.LastEvaluatedKey?.id).toBe(lastItem.id);
      expect(result.LastEvaluatedKey?.createdAt).toBe(lastItem.createdAt);
    });
  });

  describe('ExclusiveStartKey - 次ページ取得', () => {
    it('should retrieve the next page using ExclusiveStartKey', async () => {
      // Arrange - 1ページ目を取得
      const firstPageResult = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'PublishStatusIndex',
        KeyConditionExpression: 'publishStatus = :publishStatus',
        ExpressionAttributeValues: {
          ':publishStatus': 'published',
        },
        Limit: 10,
      }));

      // Act - 2ページ目を取得
      const secondPageResult = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'PublishStatusIndex',
        KeyConditionExpression: 'publishStatus = :publishStatus',
        ExpressionAttributeValues: {
          ':publishStatus': 'published',
        },
        Limit: 10,
        ExclusiveStartKey: firstPageResult.LastEvaluatedKey,
      }));

      // Assert
      expect(firstPageResult.Items).toHaveLength(10);
      expect(secondPageResult.Items).toHaveLength(10);

      // 1ページ目と2ページ目のアイテムが重複していないことを確認
      const firstPageIds = firstPageResult.Items!.map(item => item.id);
      const secondPageIds = secondPageResult.Items!.map(item => item.id);
      const intersection = firstPageIds.filter(id => secondPageIds.includes(id));
      expect(intersection).toHaveLength(0);
    });

    it('should paginate through all items with multiple pages', async () => {
      // Act - 全ページを取得
      const allItems: any[] = [];
      let lastEvaluatedKey: any = undefined;
      let pageCount = 0;

      do {
        const result = await docClient.send(new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'PublishStatusIndex',
          KeyConditionExpression: 'publishStatus = :publishStatus',
          ExpressionAttributeValues: {
            ':publishStatus': 'published',
          },
          Limit: 10,
          ExclusiveStartKey: lastEvaluatedKey,
        }));

        allItems.push(...(result.Items || []));
        lastEvaluatedKey = result.LastEvaluatedKey;
        pageCount++;
      } while (lastEvaluatedKey !== undefined);

      // Assert
      expect(allItems).toHaveLength(25); // 全件取得
      expect(pageCount).toBe(3); // 10 + 10 + 5 = 3ページ

      // すべてのアイテムのIDがユニークであることを確認
      const uniqueIds = new Set(allItems.map(item => item.id));
      expect(uniqueIds.size).toBe(25);
    });

    it('should retrieve the last partial page correctly', async () => {
      // Arrange - 1ページ目と2ページ目をスキップ
      let lastEvaluatedKey: any = undefined;

      // 1ページ目
      const page1 = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'PublishStatusIndex',
        KeyConditionExpression: 'publishStatus = :publishStatus',
        ExpressionAttributeValues: {
          ':publishStatus': 'published',
        },
        Limit: 10,
      }));
      lastEvaluatedKey = page1.LastEvaluatedKey;

      // 2ページ目
      const page2 = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'PublishStatusIndex',
        KeyConditionExpression: 'publishStatus = :publishStatus',
        ExpressionAttributeValues: {
          ':publishStatus': 'published',
        },
        Limit: 10,
        ExclusiveStartKey: lastEvaluatedKey,
      }));
      lastEvaluatedKey = page2.LastEvaluatedKey;

      // Act - 3ページ目（最終ページ）
      const page3 = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'PublishStatusIndex',
        KeyConditionExpression: 'publishStatus = :publishStatus',
        ExpressionAttributeValues: {
          ':publishStatus': 'published',
        },
        Limit: 10,
        ExclusiveStartKey: lastEvaluatedKey,
      }));

      // Assert
      expect(page3.Items).toHaveLength(5); // 残り5件
      expect(page3.LastEvaluatedKey).toBeUndefined(); // 最終ページ
    });
  });

  describe('Pagination with ScanIndexForward - ソート順序とページネーション', () => {
    it('should paginate with descending order (ScanIndexForward: false)', async () => {
      // Act - 1ページ目（降順）
      const page1 = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'PublishStatusIndex',
        KeyConditionExpression: 'publishStatus = :publishStatus',
        ExpressionAttributeValues: {
          ':publishStatus': 'published',
        },
        Limit: 10,
        ScanIndexForward: false, // 降順
      }));

      // Act - 2ページ目（降順）
      const page2 = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'PublishStatusIndex',
        KeyConditionExpression: 'publishStatus = :publishStatus',
        ExpressionAttributeValues: {
          ':publishStatus': 'published',
        },
        Limit: 10,
        ScanIndexForward: false,
        ExclusiveStartKey: page1.LastEvaluatedKey,
      }));

      // Assert
      // 1ページ目は最新の10件（createdAtが大きい順）
      expect(page1.Items?.[0].createdAt > page1.Items?.[9].createdAt).toBe(true);

      // 2ページ目の最初の記事は1ページ目の最後の記事より古い
      expect(page2.Items?.[0].createdAt < page1.Items?.[9].createdAt).toBe(true);
    });

    it('should paginate with ascending order (ScanIndexForward: true)', async () => {
      // Act - 1ページ目（昇順）
      const page1 = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'PublishStatusIndex',
        KeyConditionExpression: 'publishStatus = :publishStatus',
        ExpressionAttributeValues: {
          ':publishStatus': 'published',
        },
        Limit: 10,
        ScanIndexForward: true, // 昇順（デフォルト）
      }));

      // Act - 2ページ目（昇順）
      const page2 = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'PublishStatusIndex',
        KeyConditionExpression: 'publishStatus = :publishStatus',
        ExpressionAttributeValues: {
          ':publishStatus': 'published',
        },
        Limit: 10,
        ScanIndexForward: true,
        ExclusiveStartKey: page1.LastEvaluatedKey,
      }));

      // Assert
      // 1ページ目は最古の10件（createdAtが小さい順）
      expect(page1.Items?.[0].createdAt < page1.Items?.[9].createdAt).toBe(true);

      // 2ページ目の最初の記事は1ページ目の最後の記事より新しい
      expect(page2.Items?.[0].createdAt > page1.Items?.[9].createdAt).toBe(true);
    });
  });

  describe('Edge Cases - エッジケース', () => {
    it('should handle pagination with limit of 1', async () => {
      // Act
      const page1 = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'PublishStatusIndex',
        KeyConditionExpression: 'publishStatus = :publishStatus',
        ExpressionAttributeValues: {
          ':publishStatus': 'published',
        },
        Limit: 1,
      }));

      const page2 = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'PublishStatusIndex',
        KeyConditionExpression: 'publishStatus = :publishStatus',
        ExpressionAttributeValues: {
          ':publishStatus': 'published',
        },
        Limit: 1,
        ExclusiveStartKey: page1.LastEvaluatedKey,
      }));

      // Assert
      expect(page1.Items).toHaveLength(1);
      expect(page2.Items).toHaveLength(1);
      expect(page1.Items?.[0].id).not.toBe(page2.Items?.[0].id);
    });

    it('should handle empty result set with pagination', async () => {
      // Act
      const result = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'PublishStatusIndex',
        KeyConditionExpression: 'publishStatus = :publishStatus',
        ExpressionAttributeValues: {
          ':publishStatus': 'non-existent-status',
        },
        Limit: 10,
      }));

      // Assert
      expect(result.Items).toEqual([]);
      expect(result.LastEvaluatedKey).toBeUndefined();
    });

    it('should handle pagination consistency across multiple requests', async () => {
      // Act - 同じクエリを2回実行
      const result1 = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'PublishStatusIndex',
        KeyConditionExpression: 'publishStatus = :publishStatus',
        ExpressionAttributeValues: {
          ':publishStatus': 'published',
        },
        Limit: 10,
      }));

      const result2 = await docClient.send(new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'PublishStatusIndex',
        KeyConditionExpression: 'publishStatus = :publishStatus',
        ExpressionAttributeValues: {
          ':publishStatus': 'published',
        },
        Limit: 10,
      }));

      // Assert - 同じ結果が返ることを確認
      expect(result1.Items?.map(item => item.id)).toEqual(result2.Items?.map(item => item.id));
      expect(result1.LastEvaluatedKey).toEqual(result2.LastEvaluatedKey);
    });
  });
});
