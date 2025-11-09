// AWS SDKモックを有効化（__mocks__ディレクトリの手動モックを使用）
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/lib-dynamodb');

// ユーティリティをインポート
import {
  getDynamoDBClient,
  putItem,
  getItem,
  queryItems,
  deleteItem,
} from '../../../layers/common/nodejs/utils/dynamodbUtils';

// DynamoDBDocumentClientのsendメソッドのモックを取得
const getMockSend = () => {
  const client = getDynamoDBClient();
  return client.send as jest.Mock;
};

describe('dynamodbUtils', () => {
  const tableName = 'test-table';
  let mockSend: jest.Mock;

  beforeEach(() => {
    mockSend = getMockSend();
    mockSend.mockClear();
    mockSend.mockResolvedValue({});
  });

  describe('getDynamoDBClient', () => {
    test('should create DynamoDB document client', () => {
      const client = getDynamoDBClient();
      expect(client).toBeDefined();
    });
  });

  describe('putItem', () => {
    test('should put item to DynamoDB', async () => {
      mockSend.mockResolvedValueOnce({});
      const item = { id: '123', title: 'Test Post', content: 'Test content' };

      const result = await putItem(tableName, item);

      expect(result).toBeDefined();
      expect(mockSend).toHaveBeenCalled();
    });

    test('should handle errors', async () => {
      await expect(putItem('', {})).rejects.toThrow();
    });
  });

  describe('getItem', () => {
    test('should get item from DynamoDB', async () => {
      mockSend.mockResolvedValueOnce({
        Item: { id: '123', title: 'Test Post' },
      });
      const key = { id: '123' };

      const result = await getItem(tableName, key);

      expect(result).toBeDefined();
      expect(result).toEqual({ id: '123', title: 'Test Post' });
    });

    test('should return null for non-existent item', async () => {
      mockSend.mockResolvedValueOnce({});
      const key = { id: 'non-existent' };

      const result = await getItem(tableName, key);

      expect(result).toBeNull();
    });
  });

  describe('queryItems', () => {
    test('should query items with partition key', async () => {
      mockSend.mockResolvedValueOnce({
        Items: [{ id: '123', category: 'tech' }],
      });
      const keyConditionExpression = 'category = :category';
      const expressionAttributeValues = { ':category': 'tech' };

      const result = await queryItems(
        tableName,
        keyConditionExpression,
        expressionAttributeValues
      );

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(1);
    });

    test('should return empty array if no items found', async () => {
      mockSend.mockResolvedValueOnce({});
      const keyConditionExpression = 'category = :category';
      const expressionAttributeValues = { ':category': 'non-existent' };

      const result = await queryItems(
        tableName,
        keyConditionExpression,
        expressionAttributeValues
      );

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });

  describe('deleteItem', () => {
    test('should delete item from DynamoDB', async () => {
      mockSend.mockResolvedValueOnce({});
      const key = { id: '123' };

      const result = await deleteItem(tableName, key);

      expect(result).toBeDefined();
      expect(mockSend).toHaveBeenCalled();
    });

    test('should handle errors', async () => {
      await expect(deleteItem('', {})).rejects.toThrow();
    });
  });
});
