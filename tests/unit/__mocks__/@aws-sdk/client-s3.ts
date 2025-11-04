/**
 * Manual mock for @aws-sdk/client-s3
 * This mock is automatically used by Jest for all imports of @aws-sdk/client-s3
 */

export class S3Client {
  constructor(config?: any) {}
  send = jest.fn().mockResolvedValue({});
}

export class PutObjectCommand {
  constructor(public input: any) {}
}

export class GetObjectCommand {
  constructor(public input: any) {}
}

export class DeleteObjectCommand {
  constructor(public input: any) {}
}

export class DeleteObjectsCommand {
  constructor(public input: any) {}
}
