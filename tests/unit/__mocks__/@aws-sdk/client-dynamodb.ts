/**
 * Manual mock for @aws-sdk/client-dynamodb
 * This mock is automatically used by Jest for all imports of @aws-sdk/client-dynamodb
 */

export class DynamoDBClient {
  constructor(config?: any) {}
  send = jest.fn().mockResolvedValue({});
}
