/** Upgrade the active immutable release before changing edge routing code. */
import { S3Client } from '@aws-sdk/client-s3';
import {
  DescribeKeyValueStoreCommand,
  GetKeyCommand,
  UpdateKeysCommand,
} from '@aws-sdk/client-cloudfront-keyvaluestore';
import {
  createKeyValueStoreClient,
  isKvsConflict,
  verifyRetainedRelease,
} from './atomicDeploy';
import { createRouteIndex } from './routeIndex';

const [bucket, arn] = process.argv.slice(2);
if (!bucket || !arn)
  throw new Error('Usage: bun prepareRoutes.ts BUCKET KVS_ARN');
const kvs = createKeyValueStoreClient();
const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'ap-northeast-1' });
console.log('Reading active release and verifying its immutable files...');
for (let attempt = 0; attempt < 3; attempt++) {
  const { ETag } = await kvs.send(
    new DescribeKeyValueStoreCommand({ KvsARN: arn })
  );
  let revision: string;
  try {
    const active = await kvs.send(
      new GetKeyCommand({ KvsARN: arn, Key: 'activeRevision' })
    );
    if (!active.Value) throw new Error('Empty active revision');
    revision = active.Value;
  } catch (error) {
    if (error instanceof Error && error.name === 'ResourceNotFoundException')
      break;
    throw error;
  }
  const manifest = await verifyRetainedRelease(s3, bucket, revision, false);
  try {
    await kvs.send(
      new UpdateKeysCommand({
        KvsARN: arn,
        IfMatch: ETag,
        Puts: createRouteIndex(
          revision,
          manifest.files.map((file) => file.path)
        ),
      })
    );
    console.log(`Prepared route index for ${revision}; pointer unchanged`);
    break;
  } catch (error) {
    if (!isKvsConflict(error) || attempt === 2) throw error;
  }
}
