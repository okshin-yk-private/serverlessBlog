/**
 * Manual mock for @aws-sdk/s3-request-presigner
 * This mock is automatically used by Jest for all imports of @aws-sdk/s3-request-presigner
 */

export const getSignedUrl = jest
  .fn()
  .mockResolvedValue('https://example.com/presigned-url');
