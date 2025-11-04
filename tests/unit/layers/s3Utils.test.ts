// AWS SDKモックを有効化（__mocks__ディレクトリの手動モックを使用）
jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/s3-request-presigner');

// ユーティリティをインポート
import { generatePresignedUrl, getS3Client } from '../../../layers/common/nodejs/utils/s3Utils';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// getSignedUrlをモック関数としてキャスト
const mockGetSignedUrl = getSignedUrl as jest.MockedFunction<typeof getSignedUrl>;

describe('s3Utils', () => {
  beforeEach(() => {
    mockGetSignedUrl.mockClear();
    mockGetSignedUrl.mockResolvedValue('https://example.com/presigned-url');
  });

  describe('getS3Client', () => {
    test('should create S3 client', () => {
      const client = getS3Client();
      expect(client).toBeDefined();
    });
  });

  describe('generatePresignedUrl', () => {
    test('should generate presigned URL for GetObject', async () => {
      mockGetSignedUrl.mockResolvedValueOnce('https://example.com/presigned-url-custom');
      const bucket = 'test-bucket';
      const key = 'test-key.jpg';
      const expiresIn = 3600;

      const url = await generatePresignedUrl(bucket, key, expiresIn);

      expect(url).toBeDefined();
      expect(typeof url).toBe('string');
      expect(mockGetSignedUrl).toHaveBeenCalled();
    });

    test('should use default expiration if not provided', async () => {
      const bucket = 'test-bucket';
      const key = 'test-key.jpg';

      const url = await generatePresignedUrl(bucket, key);

      expect(url).toBeDefined();
      expect(typeof url).toBe('string');
      expect(mockGetSignedUrl).toHaveBeenCalled();
    });

    test('should handle errors gracefully', async () => {
      const bucket = '';
      const key = '';

      await expect(generatePresignedUrl(bucket, key)).rejects.toThrow();
    });
  });
});
