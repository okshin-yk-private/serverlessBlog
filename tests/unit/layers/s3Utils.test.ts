import { generatePresignedUrl, getS3Client } from '../../../layers/common/nodejs/utils/s3Utils';

// Mock AWS SDK
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://example.com/presigned-url'),
}));

describe('s3Utils', () => {
  describe('getS3Client', () => {
    test('should create S3 client', () => {
      const client = getS3Client();
      expect(client).toBeDefined();
    });
  });

  describe('generatePresignedUrl', () => {
    test('should generate presigned URL for GetObject', async () => {
      const bucket = 'test-bucket';
      const key = 'test-key.jpg';
      const expiresIn = 3600;

      const url = await generatePresignedUrl(bucket, key, expiresIn);

      expect(url).toBeDefined();
      expect(typeof url).toBe('string');
    });

    test('should use default expiration if not provided', async () => {
      const bucket = 'test-bucket';
      const key = 'test-key.jpg';

      const url = await generatePresignedUrl(bucket, key);

      expect(url).toBeDefined();
      expect(typeof url).toBe('string');
    });

    test('should handle errors gracefully', async () => {
      const bucket = '';
      const key = '';

      await expect(generatePresignedUrl(bucket, key)).rejects.toThrow();
    });
  });
});
