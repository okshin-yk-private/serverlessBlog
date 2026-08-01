import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  DescribeKeyValueStoreCommand,
  GetKeyCommand,
  UpdateKeysCommand,
} from '@aws-sdk/client-cloudfront-keyvaluestore';
import { HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  atomicDeploy,
  calculateDirectorySize,
  DeployErrorCode,
  generateBuildId,
  getCacheControl,
  getContentType,
  getDeploymentKey,
  getRevisionSequence,
  getVersionPrefix,
  isStaleRevision,
  promoteRelease,
  validateDirectorySize,
  validateRevision,
} from './atomicDeploy';

function namedError(name: string): Error {
  const error = new Error(name);
  error.name = name;
  return error;
}

describe('release naming', () => {
  test('generates a valid, sortable release ID', () => {
    const buildId = generateBuildId();
    expect(buildId).toMatch(/^r\d+-[a-z0-9]+$/);
    expect(validateRevision(buildId)).toBe(true);
  });

  test.each(['r1', 'r42-a1b2c3d', 'r1710000000000-local.build'])(
    'accepts safe revision %s',
    (revision) => {
      expect(validateRevision(revision)).toBe(true);
    }
  );

  test.each(['v1', 'r', 'r1/../../root', 'r1-UPPER', 'r1 space'])(
    'rejects unsafe revision %s',
    (revision) => {
      expect(validateRevision(revision)).toBe(false);
    }
  );

  test('maps release content and shared assets to separate prefixes', () => {
    expect(getVersionPrefix('r12-abc')).toBe('releases/r12-abc/');
    expect(getDeploymentKey('index.html', 'r12-abc')).toBe(
      'releases/r12-abc/index.html'
    );
    expect(getDeploymentKey('_astro/app.123.js', 'r12-abc')).toBe(
      '_astro/app.123.js'
    );
  });

  test('compares the monotonic numeric portion', () => {
    expect(getRevisionSequence('r123-abc')).toBe(123);
    expect(isStaleRevision('r122-old', 'r123-new')).toBe(true);
    expect(isStaleRevision('r124-new', 'r123-old')).toBe(false);
    expect(isStaleRevision('r123-same', 'r123-other')).toBe(false);
  });
});

describe('file metadata', () => {
  test('uses revalidation for documents and immutable caching for assets', () => {
    expect(getCacheControl('index.html')).toBe(
      'public,max-age=0,must-revalidate'
    );
    expect(getCacheControl('rss.xml')).toBe('public,max-age=0,must-revalidate');
    expect(getCacheControl('robots.txt')).toBe(
      'public,max-age=0,must-revalidate'
    );
    expect(getCacheControl('_astro/app.hash.js')).toBe(
      'public,max-age=31536000,immutable'
    );
  });

  test('returns MIME types with a safe fallback', () => {
    expect(getContentType('index.html')).toBe('text/html');
    expect(getContentType('app.js')).toBe('application/javascript');
    expect(getContentType('unknown')).toBe('application/octet-stream');
  });

  test('enforces the 50 MiB release limit', () => {
    expect(validateDirectorySize(50 * 1024 * 1024).valid).toBe(true);
    expect(validateDirectorySize(50 * 1024 * 1024 + 1).valid).toBe(false);
  });
});

describe('promoteRelease', () => {
  test('updates activeRevision with the current ETag', async () => {
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof GetKeyCommand) return { Value: 'r10-old' };
      if (command instanceof DescribeKeyValueStoreCommand) {
        return { ETag: 'etag-1' };
      }
      if (command instanceof UpdateKeysCommand) return { ETag: 'etag-2' };
      throw new Error('unexpected command');
    });

    const result = await promoteRelease(
      { send },
      'arn:aws:cloudfront::123:key-value-store/test',
      'r11-new'
    );

    expect(result).toEqual({ previousRevision: 'r10-old', promoted: true });
    const update = send.mock.calls
      .map(([command]) => command)
      .find((command) => command instanceof UpdateKeysCommand);
    expect(update?.input).toMatchObject({
      IfMatch: 'etag-1',
      Puts: [{ Key: 'activeRevision', Value: 'r11-new' }],
    });
  });

  test('rejects an older build before changing the pointer', async () => {
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof DescribeKeyValueStoreCommand) {
        return { ETag: 'etag-newer' };
      }
      if (command instanceof GetKeyCommand) return { Value: 'r12-newer' };
      throw new Error('must not update');
    });

    await expect(
      promoteRelease(
        { send },
        'arn:aws:cloudfront::123:key-value-store/test',
        'r11-stale'
      )
    ).rejects.toMatchObject({ code: DeployErrorCode.STALE_RELEASE });
    expect(send).toHaveBeenCalledTimes(2);
  });

  test('treats promotion of the active release as idempotent', async () => {
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof DescribeKeyValueStoreCommand) {
        return { ETag: 'etag-current' };
      }
      return { Value: 'r12-current' };
    });
    await expect(
      promoteRelease(
        { send },
        'arn:aws:cloudfront::123:key-value-store/test',
        'r12-current'
      )
    ).resolves.toEqual({
      previousRevision: 'r12-current',
      promoted: false,
    });
    expect(send).toHaveBeenCalledTimes(2);
  });

  test('re-reads state and retries an ETag conflict', async () => {
    let updateAttempts = 0;
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof GetKeyCommand) {
        throw namedError('ResourceNotFoundException');
      }
      if (command instanceof DescribeKeyValueStoreCommand) {
        return { ETag: `etag-${updateAttempts + 1}` };
      }
      if (command instanceof UpdateKeysCommand) {
        updateAttempts += 1;
        if (updateAttempts === 1) throw namedError('ConflictException');
        return { ETag: 'etag-final' };
      }
      throw new Error('unexpected command');
    });

    await expect(
      promoteRelease(
        { send },
        'arn:aws:cloudfront::123:key-value-store/test',
        'r1-first'
      )
    ).resolves.toMatchObject({ promoted: true });
    expect(updateAttempts).toBe(2);
  });
});

describe('atomicDeploy', () => {
  const testDir = path.join(import.meta.dirname, '__test_atomic_dist__');

  afterEach(async () => {
    await fs.promises.rm(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  async function createDist(): Promise<void> {
    await fs.promises.mkdir(path.join(testDir, '_astro'), {
      recursive: true,
    });
    await fs.promises.mkdir(path.join(testDir, 'posts', 'hello'), {
      recursive: true,
    });
    await fs.promises.writeFile(path.join(testDir, 'index.html'), 'home');
    await fs.promises.writeFile(
      path.join(testDir, '_astro', 'app.hash.js'),
      'asset'
    );
    await fs.promises.writeFile(
      path.join(testDir, 'posts', 'hello', 'index.html'),
      'post'
    );
  }

  test('uploads a complete release, verifies it, then promotes once', async () => {
    await createDist();
    const objects = new Map<string, number>();
    const commandNames: string[] = [];
    const s3Send = vi.fn(async (command: unknown) => {
      commandNames.push(command?.constructor.name ?? 'unknown');
      if (command instanceof HeadObjectCommand) {
        const size = objects.get(command.input.Key!);
        if (size === undefined) throw namedError('NotFound');
        return { ContentLength: size };
      }
      if (command instanceof PutObjectCommand) {
        objects.set(
          command.input.Key!,
          (command.input.Body as Uint8Array).byteLength
        );
        return {};
      }
      throw new Error('unexpected S3 command');
    });
    const kvsSend = vi.fn(async (command: unknown) => {
      commandNames.push(command?.constructor.name ?? 'unknown');
      if (command instanceof GetKeyCommand) {
        throw namedError('ResourceNotFoundException');
      }
      if (command instanceof DescribeKeyValueStoreCommand) {
        return { ETag: 'etag-1' };
      }
      if (command instanceof UpdateKeysCommand) return { ETag: 'etag-2' };
      throw new Error('unexpected KVS command');
    });

    const result = await atomicDeploy({
      bucketName: 'site-bucket',
      keyValueStoreArn: 'arn:aws:cloudfront::123:key-value-store/test',
      distPath: testDir,
      region: 'ap-northeast-1',
      revision: 'r21-abcdef0',
      clients: { s3: { send: s3Send }, kvs: { send: kvsSend } },
    });

    expect(result).toMatchObject({
      success: true,
      buildId: 'r21-abcdef0',
      versionPrefix: 'releases/r21-abcdef0/',
      filesUploaded: 3,
      promoted: true,
    });
    expect([...objects.keys()]).toEqual([
      '_astro/app.hash.js',
      'releases/r21-abcdef0/index.html',
      'releases/r21-abcdef0/posts/hello/index.html',
    ]);
    expect(commandNames.at(-1)).toBe('UpdateKeysCommand');
  });

  test('never promotes when an upload fails', async () => {
    await createDist();
    const kvsSend = vi.fn();
    const result = await atomicDeploy({
      bucketName: 'site-bucket',
      keyValueStoreArn: 'arn:aws:cloudfront::123:key-value-store/test',
      distPath: testDir,
      region: 'ap-northeast-1',
      revision: 'r22-broken',
      clients: {
        s3: {
          send: vi.fn(async (command: unknown) => {
            if (command instanceof HeadObjectCommand) {
              throw namedError('NotFound');
            }
            throw new Error('S3 unavailable');
          }),
        },
        kvs: { send: kvsSend },
      },
    });

    expect(result).toMatchObject({
      success: false,
      error: { code: DeployErrorCode.RELEASE_UPLOAD_FAILED },
    });
    expect(kvsSend).not.toHaveBeenCalled();
  });

  test('fails closed for invalid revisions', async () => {
    await createDist();
    const send = vi.fn();
    const result = await atomicDeploy({
      bucketName: 'site-bucket',
      keyValueStoreArn: 'arn:aws:cloudfront::123:key-value-store/test',
      distPath: testDir,
      region: 'ap-northeast-1',
      revision: '../root',
      clients: { s3: { send }, kvs: { send } },
    });
    expect(result.error?.code).toBe(DeployErrorCode.INVALID_REVISION);
    expect(send).not.toHaveBeenCalled();
  });

  test('reports a missing distribution path', async () => {
    const send = vi.fn();
    const result = await atomicDeploy({
      bucketName: 'site-bucket',
      keyValueStoreArn: 'arn:aws:cloudfront::123:key-value-store/test',
      distPath: testDir,
      region: 'ap-northeast-1',
      revision: 'r23-missing',
      clients: { s3: { send }, kvs: { send } },
    });
    expect(result.error?.code).toBe(DeployErrorCode.DIST_PATH_NOT_FOUND);
  });

  test('calculates nested directory size', async () => {
    await createDist();
    await expect(calculateDirectorySize(testDir)).resolves.toBe(13);
  });
});
