/**
 * Manual mock for @aws-sdk/lib-dynamodb
 * This mock is automatically used by Jest for all imports of @aws-sdk/lib-dynamodb
 */

const mockSend = jest.fn().mockResolvedValue({});

export const DynamoDBDocumentClient = {
  from: jest.fn(() => ({
    send: mockSend,
  })),
};

export class PutCommand {
  constructor(public input: any) {}
}

export class GetCommand {
  constructor(public input: any) {}
}

export class UpdateCommand {
  constructor(public input: any) {}
}

export class DeleteCommand {
  constructor(public input: any) {}
}

export class QueryCommand {
  constructor(public input: any) {}
}

export class ScanCommand {
  constructor(public input: any) {}
}

// Export mockSend for test access
export { mockSend };
