import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Create S3 client
 * @returns S3Client instance
 */
export function getS3Client(): S3Client {
  return new S3Client({
    region: process.env.AWS_REGION || 'ap-northeast-1',
  });
}

/**
 * Generate presigned URL for S3 object
 * @param bucket - S3 bucket name
 * @param key - S3 object key
 * @param expiresIn - URL expiration time in seconds (default: 3600)
 * @returns Presigned URL
 */
export async function generatePresignedUrl(
  bucket: string,
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  if (!bucket || !key) {
    throw new Error('Bucket and key are required');
  }

  const client = getS3Client();
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  const url = await getSignedUrl(client, command, { expiresIn });
  return url;
}
