import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import {
  DynamoDBClient,
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';

// テスト用のDynamoDBクライアント
const dynamoDBClient = new DynamoDBClient({
  endpoint: process.env.DYNAMODB_ENDPOINT || 'http://localhost:8000',
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
  },
});

const docClient = DynamoDBDocumentClient.from(dynamoDBClient);

const TABLE_NAME = 'test-list-posts-table';

// ハンドラーインポート前に環境変数を設定
process.env.TABLE_NAME = TABLE_NAME;

// Powertools Loggerのモック（ログ出力を抑制）
jest.mock('@aws-lambda-powertools/logger', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    addContext: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

// Powertools Tracerのモック
jest.mock('@aws-lambda-powertools/tracer', () => ({
  Tracer: jest.fn().mockImplementation(() => ({
    captureAWSv3Client: jest.fn((client) => client),
  })),
}));

// Powertools Metricsのモック
jest.mock('@aws-lambda-powertools/metrics', () => ({
  Metrics: jest.fn().mockImplementation(() => ({
    addMetadata: jest.fn(),
    addMetric: jest.fn(),
  })),
  MetricUnit: {
    Count: 'Count',
  },
}));

// ハンドラーをインポート（モックの後）
import {
  handler,
  resetDynamoDBClient,
} from '../../../functions/posts/listPosts/handler';

describe('listPosts Lambda Handler - Integration Tests', () => {
  const mockContext = {} as Context;

  const testPosts = [
    {
      postId: 'post-1',
      userId: 'user-1',
      publishStatus: 'published',
      createdAt: '2025-01-15T10:00:00Z',
      updatedAt: '2025-01-15T10:00:00Z',
      title: '公開記事1',
      category: 'tech',
      contentMarkdown: '# マークダウン1',
      contentHtml: '<h1>HTML1</h1>',
    },
    {
      postId: 'post-2',
      userId: 'user-1',
      publishStatus: 'published',
      createdAt: '2025-01-14T10:00:00Z',
      updatedAt: '2025-01-14T10:00:00Z',
      title: '公開記事2',
      category: 'life',
      contentMarkdown: '# マークダウン2',
      contentHtml: '<h1>HTML2</h1>',
    },
    {
      postId: 'post-3',
      userId: 'user-2',
      publishStatus: 'published',
      createdAt: '2025-01-13T10:00:00Z',
      updatedAt: '2025-01-13T10:00:00Z',
      title: '公開記事3',
      category: 'tech',
      contentMarkdown: '# マークダウン3',
      contentHtml: '<h1>HTML3</h1>',
    },
    {
      postId: 'post-4',
      userId: 'user-1',
      publishStatus: 'draft',
      createdAt: '2025-01-12T10:00:00Z',
      updatedAt: '2025-01-12T10:00:00Z',
      title: '下書き記事',
      category: 'tech',
      contentMarkdown: '# マークダウン4',
      contentHtml: '<h1>HTML4</h1>',
    },
  ];

  // テーブル作成
  beforeAll(async () => {
    try {
      await dynamoDBClient.send(
        new CreateTableCommand({
          TableName: TABLE_NAME,
          KeySchema: [
            { AttributeName: 'postId', KeyType: 'HASH' },
            { AttributeName: 'userId', KeyType: 'RANGE' },
          ],
          AttributeDefinitions: [
            { AttributeName: 'postId', AttributeType: 'S' },
            { AttributeName: 'userId', AttributeType: 'S' },
            { AttributeName: 'publishStatus', AttributeType: 'S' },
            { AttributeName: 'category', AttributeType: 'S' },
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
          ],
          BillingMode: 'PAY_PER_REQUEST',
        })
      );

      // テーブルが作成されるまで待機
      let tableReady = false;
      for (let i = 0; i < 10; i++) {
        try {
          const result = await dynamoDBClient.send(
            new DescribeTableCommand({
              TableName: TABLE_NAME,
            })
          );
          if (result.Table?.TableStatus === 'ACTIVE') {
            tableReady = true;
            break;
          }
        } catch (error) {
          // テーブルがまだ作成中
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      if (!tableReady) {
        throw new Error('テーブルの作成がタイムアウトしました');
      }
    } catch (error: any) {
      if (error.name !== 'ResourceInUseException') {
        throw error;
      }
      // テーブルが既に存在する場合は無視
    }

    // テストデータの投入
    for (const post of testPosts) {
      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: post,
        })
      );
    }
  });

  // テーブル削除
  afterAll(async () => {
    try {
      await dynamoDBClient.send(
        new DeleteTableCommand({
          TableName: TABLE_NAME,
        })
      );
    } catch (error: any) {
      // エラーは無視（テーブルが存在しない場合など）
    }
  });

  beforeEach(() => {
    resetDynamoDBClient();
    // 環境変数を各テストで設定
    process.env.TABLE_NAME = TABLE_NAME;
  });

  describe('正常系 - 公開記事一覧取得', () => {
    it('デフォルトのlimit(10件)で公開記事のみを取得できる', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        queryStringParameters: null,
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.items).toHaveLength(3); // 公開記事のみ3件
      expect(body.count).toBe(3);

      // 新しい順（createdAtの降順）
      expect(body.items[0].postId).toBe('post-1');
      expect(body.items[1].postId).toBe('post-2');
      expect(body.items[2].postId).toBe('post-3');

      // 下書き記事は含まれない
      expect(
        body.items.find((item: any) => item.postId === 'post-4')
      ).toBeUndefined();

      // nextTokenは存在しない（全件取得済み）
      expect(body.nextToken).toBeUndefined();
    });

    it('contentMarkdownが除外されている', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        queryStringParameters: null,
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);

      // 全てのアイテムでcontentMarkdownが存在しない
      body.items.forEach((item: any) => {
        expect(item.contentMarkdown).toBeUndefined();
        expect(item.contentHtml).toBeDefined(); // contentHtmlは存在する
      });
    });

    it('カスタムlimit(2件)で取得できる', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        queryStringParameters: {
          limit: '2',
        },
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.items).toHaveLength(2);
      expect(body.count).toBe(2);
      expect(body.items[0].postId).toBe('post-1');
      expect(body.items[1].postId).toBe('post-2');

      // nextTokenが存在する（まだ取得していないデータがある）
      expect(body.nextToken).toBeDefined();
    });

    it('nextTokenを使用してページネーションできる', async () => {
      // Arrange - 最初のページ取得
      const firstPageEvent: Partial<APIGatewayProxyEvent> = {
        queryStringParameters: {
          limit: '2',
        },
      };

      // Act - 1ページ目
      const firstPageResult = await handler(
        firstPageEvent as APIGatewayProxyEvent,
        mockContext
      );

      // Assert - 1ページ目
      expect(firstPageResult.statusCode).toBe(200);
      const firstPageBody = JSON.parse(firstPageResult.body);
      expect(firstPageBody.items).toHaveLength(2);
      expect(firstPageBody.nextToken).toBeDefined();

      // Arrange - 2ページ目取得
      const secondPageEvent: Partial<APIGatewayProxyEvent> = {
        queryStringParameters: {
          limit: '2',
          nextToken: firstPageBody.nextToken,
        },
      };

      // Act - 2ページ目
      const secondPageResult = await handler(
        secondPageEvent as APIGatewayProxyEvent,
        mockContext
      );

      // Assert - 2ページ目
      expect(secondPageResult.statusCode).toBe(200);
      const secondPageBody = JSON.parse(secondPageResult.body);
      expect(secondPageBody.items).toHaveLength(1); // 残り1件
      expect(secondPageBody.items[0].postId).toBe('post-3');
      expect(secondPageBody.nextToken).toBeUndefined(); // もうデータがない
    });
  });

  describe('異常系 - バリデーション', () => {
    it('limitが範囲外(101)の場合はデフォルト値(10)を使用する', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        queryStringParameters: {
          limit: '101', // MAX_LIMIT(100)を超える
        },
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      // デフォルト値で全件取得
      expect(body.items).toHaveLength(3);
    });

    it('limitが範囲外(0)の場合はデフォルト値(10)を使用する', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        queryStringParameters: {
          limit: '0', // MIN_LIMIT(1)未満
        },
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      // デフォルト値で全件取得
      expect(body.items).toHaveLength(3);
    });

    it('無効なnextTokenの場合は無視して最初から取得する', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        queryStringParameters: {
          nextToken: 'invalid-token', // 無効なBase64文字列
        },
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      // 無視されて最初から取得
      expect(body.items).toHaveLength(3);
      expect(body.items[0].postId).toBe('post-1');
    });
  });

  describe('カテゴリフィルタ機能', () => {
    it('categoryパラメータで特定カテゴリの公開記事のみを取得できる', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        queryStringParameters: {
          category: 'tech',
        },
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.items).toHaveLength(2); // techカテゴリの公開記事は2件
      expect(body.count).toBe(2);

      // 全てtechカテゴリ
      body.items.forEach((item: any) => {
        expect(item.category).toBe('tech');
      });

      // 新しい順（createdAtの降順）
      expect(body.items[0].postId).toBe('post-1');
      expect(body.items[1].postId).toBe('post-3');

      // 下書き記事（post-4）は含まれない
      expect(
        body.items.find((item: any) => item.postId === 'post-4')
      ).toBeUndefined();
    });

    it('categoryパラメータで別のカテゴリの記事を取得できる', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        queryStringParameters: {
          category: 'life',
        },
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.items).toHaveLength(1); // lifeカテゴリは1件
      expect(body.count).toBe(1);
      expect(body.items[0].postId).toBe('post-2');
      expect(body.items[0].category).toBe('life');
    });

    it('存在しないカテゴリの場合は空の配列を返す', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        queryStringParameters: {
          category: 'non-existent-category',
        },
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.items).toHaveLength(0);
      expect(body.count).toBe(0);
      expect(body.nextToken).toBeUndefined();
    });

    it('カテゴリフィルタとlimitを組み合わせて使用できる', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        queryStringParameters: {
          category: 'tech',
          limit: '1',
        },
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.items).toHaveLength(1);
      expect(body.items[0].postId).toBe('post-1');
      expect(body.items[0].category).toBe('tech');
      // 次のページが存在する
      expect(body.nextToken).toBeDefined();
    });

    it('カテゴリフィルタ結果でもcontentMarkdownが除外されている', async () => {
      // Arrange
      const event: Partial<APIGatewayProxyEvent> = {
        queryStringParameters: {
          category: 'tech',
        },
      };

      // Act
      const result = await handler(event as APIGatewayProxyEvent, mockContext);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);

      // 全てのアイテムでcontentMarkdownが存在しない
      body.items.forEach((item: any) => {
        expect(item.contentMarkdown).toBeUndefined();
        expect(item.contentHtml).toBeDefined();
      });
    });
  });
});
