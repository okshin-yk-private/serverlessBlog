import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';

/**
 * Create DynamoDB document client
 * @returns DynamoDBDocumentClient instance
 */
export function getDynamoDBClient(): DynamoDBDocumentClient {
  const client = new DynamoDBClient({
    region: process.env.AWS_REGION || 'ap-northeast-1',
  });

  return DynamoDBDocumentClient.from(client, {
    marshallOptions: {
      removeUndefinedValues: true,
    },
  });
}

/**
 * Put item to DynamoDB table
 * @param tableName - DynamoDB table name
 * @param item - Item to put
 * @returns Put command output
 */
export async function putItem(tableName: string, item: Record<string, any>) {
  if (!tableName || !item) {
    throw new Error('Table name and item are required');
  }

  const client = getDynamoDBClient();
  const command = new PutCommand({
    TableName: tableName,
    Item: item,
  });

  return await client.send(command);
}

/**
 * Get item from DynamoDB table
 * @param tableName - DynamoDB table name
 * @param key - Item key
 * @returns Item or null if not found
 */
export async function getItem(
  tableName: string,
  key: Record<string, any>
): Promise<Record<string, any> | null> {
  const client = getDynamoDBClient();
  const command = new GetCommand({
    TableName: tableName,
    Key: key,
  });

  const result = await client.send(command);
  return result.Item || null;
}

/**
 * Query items from DynamoDB table
 * @param tableName - DynamoDB table name
 * @param keyConditionExpression - Key condition expression
 * @param expressionAttributeValues - Expression attribute values
 * @param indexName - Optional index name
 * @returns Array of items
 */
export async function queryItems(
  tableName: string,
  keyConditionExpression: string,
  expressionAttributeValues: Record<string, any>,
  indexName?: string
): Promise<Record<string, any>[]> {
  const client = getDynamoDBClient();
  const command = new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: keyConditionExpression,
    ExpressionAttributeValues: expressionAttributeValues,
    IndexName: indexName,
  });

  const result = await client.send(command);
  return result.Items || [];
}

/**
 * Delete item from DynamoDB table
 * @param tableName - DynamoDB table name
 * @param key - Item key
 * @returns Delete command output
 */
export async function deleteItem(tableName: string, key: Record<string, any>) {
  if (!tableName || !key) {
    throw new Error('Table name and key are required');
  }

  const client = getDynamoDBClient();
  const command = new DeleteCommand({
    TableName: tableName,
    Key: key,
  });

  return await client.send(command);
}
