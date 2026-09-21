import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  DescribeKeyValueStoreCommand,
  GetKeyCommand,
  UpdateKeysCommand,
} from '@aws-sdk/client-cloudfront-keyvaluestore';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  atomicDeploy,
  digest,
  MANIFEST_PATH,
  RELEASE_PLAN_PATH,
  REQUIRED_FILES,
  rollbackRelease,
  verifyRetainedRelease,
  calculateDirectorySize,
  createKeyValueStoreClient,
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
    expect(isStaleRevision('r123-same', 'r123-other')).toBe(true);
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
      Puts: [
        { Key: 'activeRevision', Value: 'r11-new' },
        { Key: 'highestPromotedRevision', Value: 'r11-new' },
      ],
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
    expect(send).toHaveBeenCalledTimes(3);
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
    expect(send).toHaveBeenCalledTimes(3);
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

describe('CloudFront KVS client', () => {
  test('signs KVS requests with the explicitly configured JS SigV4A signer', async () => {
    const client = createKeyValueStoreClient();
    let authorization: string | undefined;
    const requestHandler = {
      handle: vi.fn(async (request: { headers: Record<string, string> }) => {
        authorization = request.headers.authorization;
        return {
          response: {
            statusCode: 200,
            headers: { 'content-type': 'application/json' },
            body: new TextEncoder().encode('{}'),
          },
        };
      }),
    };

    client.config.credentials = async () => ({
      accessKeyId: 'AKIDEXAMPLE',
      secretAccessKey: 'test-secret',
    });
    client.config.requestHandler =
      requestHandler as unknown as typeof client.config.requestHandler;

    await client.send(
      new DescribeKeyValueStoreCommand({
        KvsARN: 'arn:aws:cloudfront::123456789012:key-value-store/test',
      })
    );

    expect(authorization).toMatch(/^AWS4-ECDSA-P256-SHA256 /);
    expect(requestHandler.handle).toHaveBeenCalledOnce();
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
    for (const file of REQUIRED_FILES) {
      await fs.promises.mkdir(path.dirname(path.join(testDir, file)), {
        recursive: true,
      });
      await fs.promises.writeFile(path.join(testDir, file), 'home');
    }
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
    const objects = new Map<
      string,
      { ContentLength: number; ChecksumSHA256?: string }
    >();
    const commandNames: string[] = [];
    const s3Send = vi.fn(async (command: unknown) => {
      commandNames.push(command?.constructor.name ?? 'unknown');
      if (command instanceof HeadObjectCommand) {
        const size = objects.get(command.input.Key!);
        if (size === undefined) throw namedError('NotFound');
        return size;
      }
      if (command instanceof PutObjectCommand) {
        objects.set(command.input.Key!, {
          ContentLength: (command.input.Body as Uint8Array).byteLength,
          ChecksumSHA256: command.input.ChecksumSHA256,
        });
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
      filesUploaded: REQUIRED_FILES.length + 2,
      promoted: true,
    });
    expect([...objects.keys()].sort()).toEqual(
      [
        '_astro/app.hash.js',
        ...REQUIRED_FILES.map((file) => `releases/r21-abcdef0/${file}`),
        'releases/r21-abcdef0/posts/hello/index.html',
        `releases/r21-abcdef0/${MANIFEST_PATH}`,
        `releases/r21-abcdef0/${RELEASE_PLAN_PATH}`,
      ].sort()
    );
    expect(commandNames.at(-1)).toBe('UpdateKeysCommand');
  });

  test('bounds parallel work and verifies every asset before documents and promotion', async () => {
    await createDist();
    for (let i = 0; i < 12; i++) {
      await fs.promises.writeFile(
        path.join(testDir, '_astro', `font-${i}.woff2`),
        'x'
      );
    }
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let active = 0;
    let peak = 0;
    const objects = new Map<
      string,
      { ContentLength: number; ChecksumSHA256?: string }
    >();
    const verified = new Set<string>();
    const s3Send = vi.fn(async (command: unknown) => {
      if (!(
        command instanceof HeadObjectCommand ||
        command instanceof PutObjectCommand
      ))
        throw new Error('unexpected command');
      const key = command.input.Key!;
      if (!key.startsWith('_astro/') && !key.endsWith(RELEASE_PLAN_PATH))
        expect(
          [...verified].filter((k) => k.startsWith('_astro/'))
        ).toHaveLength(13);
      active++;
      peak = Math.max(peak, active);
      try {
        if (!key.endsWith(RELEASE_PLAN_PATH)) await gate;
        if (command instanceof PutObjectCommand) {
          expect(command.input.IfNoneMatch).toBe('*');
          objects.set(key, {
            ContentLength: (command.input.Body as Uint8Array).byteLength,
            ChecksumSHA256: command.input.ChecksumSHA256,
          });
          return {};
        }
        const size = objects.get(key);
        if (size === undefined) throw namedError('NotFound');
        verified.add(key);
        return size;
      } finally {
        active--;
      }
    });
    const kvsSend = vi.fn(async (command: unknown) => {
      expect(verified.size).toBe(13 + REQUIRED_FILES.length + 3);
      expect(active).toBe(0);
      if (command instanceof DescribeKeyValueStoreCommand)
        return { ETag: 'etag' };
      if (command instanceof GetKeyCommand) return { Value: 'r1-old' };
      return {};
    });
    const pending = atomicDeploy({
      bucketName: 'site',
      keyValueStoreArn: 'store',
      distPath: testDir,
      region: 'ap-northeast-1',
      revision: 'r2-new',
      clients: { s3: { send: s3Send }, kvs: { send: kvsSend } },
    });
    await vi.waitFor(() => expect(active).toBe(8));
    expect(kvsSend).not.toHaveBeenCalled();
    release();
    expect((await pending).success).toBe(true);
    expect(peak).toBe(8);
  });

  test('stops scheduling after failure and drains in-flight requests before returning', async () => {
    await createDist();
    for (let i = 0; i < 12; i++)
      await fs.promises.writeFile(
        path.join(testDir, '_astro', `font-${i}.woff2`),
        'x'
      );
    let fail!: () => void;
    let drain!: () => void;
    const failGate = new Promise<void>((resolve) => {
      fail = resolve;
    });
    const drainGate = new Promise<void>((resolve) => {
      drain = resolve;
    });
    let started = 0;
    let returned = false;
    let failureObserved = false;
    const kvsSend = vi.fn();
    let planMetadata:
      { ContentLength: number; ChecksumSHA256?: string } | undefined;
    const send = vi.fn(async (command: unknown) => {
      if (
        (command instanceof HeadObjectCommand ||
          command instanceof PutObjectCommand) &&
        command.input.Key?.endsWith(RELEASE_PLAN_PATH)
      ) {
        if (command instanceof PutObjectCommand) {
          planMetadata = {
            ContentLength: (command.input.Body as Uint8Array).length,
            ChecksumSHA256: command.input.ChecksumSHA256,
          };
          return {};
        }
        if (!planMetadata) throw namedError('NotFound');
        return planMetadata;
      }
      const index = started++;
      if (index === 0) {
        await failGate;
        failureObserved = true;
        throw new Error('upload unavailable');
      }
      await drainGate;
      return { ContentLength: 999 };
    });
    const pending = atomicDeploy({
      bucketName: 'site',
      keyValueStoreArn: 'store',
      distPath: testDir,
      region: 'ap-northeast-1',
      revision: 'r2-new',
      clients: { s3: { send }, kvs: { send: kvsSend } },
    }).then((result) => {
      returned = true;
      return result;
    });
    await vi.waitFor(() => expect(started).toBe(8));
    fail();
    await vi.waitFor(() => expect(failureObserved).toBe(true));
    expect(returned).toBe(false);
    expect(started).toBe(8);
    drain();
    expect((await pending).success).toBe(false);
    expect(started).toBe(8);
    expect(kvsSend).not.toHaveBeenCalled();
  });

  test.each(['conflict', 'verification'] as const)(
    'never promotes after %s failure',
    async (failure) => {
      await createDist();
      const kvsSend = vi.fn();
      let heads = 0;
      const result = await atomicDeploy({
        bucketName: 'site',
        keyValueStoreArn: 'store',
        distPath: testDir,
        region: 'ap-northeast-1',
        revision: 'r2-new',
        clients: {
          s3: {
            send: vi.fn(async (command: unknown) => {
              if (command instanceof HeadObjectCommand) {
                if (failure === 'verification' && heads++ === 0)
                  throw namedError('NotFound');
                return { ContentLength: 999 };
              }
              return {};
            }),
          },
          kvs: { send: kvsSend },
        },
      });
      expect(result.error?.code).toBe(
        failure === 'conflict'
          ? DeployErrorCode.RELEASE_CONFLICT
          : DeployErrorCode.RELEASE_VERIFICATION_FAILED
      );
      expect(kvsSend).not.toHaveBeenCalled();
    }
  );

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
    await expect(calculateDirectorySize(testDir)).resolves.toBe(
      4 * REQUIRED_FILES.length + 9
    );
  });
});

function mockStore() {
  const objects = new Map<string, Buffer>();
  const checksums = new Map<string, string>();
  const keys = new Map<string, string>();
  let etag = 0;
  const s3 = {
    send: vi.fn(async (command: unknown) => {
      if (command instanceof PutObjectCommand) {
        const key = command.input.Key!;
        if (objects.has(key)) throw namedError('PreconditionFailed');
        const body = Buffer.from(command.input.Body as Uint8Array);
        expect(command.input.ChecksumSHA256).toBe(digest(body));
        objects.set(key, body);
        checksums.set(key, command.input.ChecksumSHA256!);
        return {};
      }
      if (
        command instanceof HeadObjectCommand ||
        command instanceof GetObjectCommand
      ) {
        const key = command.input.Key!;
        const body = objects.get(key);
        if (!body) throw namedError('NotFound');
        if (command instanceof HeadObjectCommand) {
          expect(command.input.ChecksumMode).toBe('ENABLED');
          return {
            ContentLength: body.length,
            ChecksumSHA256: checksums.get(key),
            ETag: 'object-etag',
          };
        }
        return { Body: { transformToByteArray: async () => body } };
      }
      throw new Error('unexpected S3 command');
    }),
  };
  const kvs = {
    send: vi.fn(async (command: unknown) => {
      if (command instanceof DescribeKeyValueStoreCommand)
        return { ETag: String(etag) };
      if (command instanceof GetKeyCommand) {
        const value = keys.get(command.input.Key!);
        if (!value) throw namedError('ResourceNotFoundException');
        return { Value: value };
      }
      if (command instanceof UpdateKeysCommand) {
        if (command.input.IfMatch !== String(etag))
          throw namedError('ConflictException');
        etag++;
        for (const put of command.input.Puts ?? [])
          keys.set(put.Key!, put.Value!);
        return {};
      }
      throw new Error('unexpected KVS command');
    }),
  };
  return { objects, checksums, keys, s3, kvs };
}

describe('release integrity and recovery', () => {
  const distPath = path.join(import.meta.dirname, '__test_integrity_dist__');
  const config = {
    bucketName: 'site',
    keyValueStoreArn: 'store',
    region: 'ap-northeast-1',
    distPath,
    revision: 'r20-new',
  };
  afterEach(async () => {
    await fs.promises.rm(distPath, { recursive: true, force: true });
    vi.restoreAllMocks();
  });
  async function prepare() {
    for (const file of [...REQUIRED_FILES, '_astro/app.hash.js']) {
      await fs.promises.mkdir(path.dirname(path.join(distPath, file)), {
        recursive: true,
      });
      await fs.promises.writeFile(path.join(distPath, file), 'data');
    }
    return mockStore();
  }

  test.each(REQUIRED_FILES)(
    'rejects missing required file %s before AWS calls',
    async (file) => {
      const clients = await prepare();
      await fs.promises.unlink(path.join(distPath, file));
      expect((await atomicDeploy({ ...config, clients })).error?.code).toBe(
        DeployErrorCode.RELEASE_VERIFICATION_FAILED
      );
      expect(clients.s3.send).not.toHaveBeenCalled();
      expect(clients.kvs.send).not.toHaveBeenCalled();
    }
  );

  test.each([true, false])(
    'rejects same-size corruption (native checksum: %s)',
    async (native) => {
      const clients = await prepare();
      clients.objects.set('_astro/app.hash.js', Buffer.from('evil'));
      if (native)
        clients.checksums.set(
          '_astro/app.hash.js',
          digest(Buffer.from('evil'))
        );
      expect((await atomicDeploy({ ...config, clients })).error?.code).toBe(
        DeployErrorCode.RELEASE_CONFLICT
      );
      expect(clients.kvs.send).not.toHaveBeenCalled();
    }
  );

  test('verifies legacy bytes without overwriting and writes manifest last', async () => {
    const clients = await prepare();
    clients.objects.set('_astro/app.hash.js', Buffer.from('data'));
    expect((await atomicDeploy({ ...config, clients })).success).toBe(true);
    const puts = clients.s3.send.mock.calls
      .map(([command]) => command)
      .filter((c) => c instanceof PutObjectCommand);
    expect(puts.some((c) => c.input.Key === '_astro/app.hash.js')).toBe(false);
    expect(puts.at(-1)?.input.Key).toBe(
      'releases/r20-new/release-manifest.json'
    );
    const manifest = await verifyRetainedRelease(clients.s3, 'site', 'r20-new');
    expect(manifest.files).toHaveLength(REQUIRED_FILES.length + 1);
    expect((await atomicDeploy({ ...config, clients })).promoted).toBe(false);
  });

  test('rejects changed file lists under the same revision', async () => {
    const clients = await prepare();
    expect((await atomicDeploy({ ...config, clients })).success).toBe(true);
    clients.kvs.send.mockClear();
    await fs.promises.writeFile(path.join(distPath, 'extra.txt'), 'new');
    expect((await atomicDeploy({ ...config, clients })).error?.code).toBe(
      DeployErrorCode.RELEASE_CONFLICT
    );
    expect(clients.kvs.send).not.toHaveBeenCalled();
    expect(clients.objects.has('releases/r20-new/extra.txt')).toBe(false);
  });

  test('rejects a reserved manifest and unsupported symlinks', async () => {
    const clients = await prepare();
    await fs.promises.writeFile(path.join(distPath, MANIFEST_PATH), '{}');
    expect((await atomicDeploy({ ...config, clients })).error?.code).toBe(
      DeployErrorCode.RELEASE_CONFLICT
    );
    await fs.promises.unlink(path.join(distPath, MANIFEST_PATH));
    await fs.promises.symlink('index.html', path.join(distPath, 'alias.html'));
    expect((await atomicDeploy({ ...config, clients })).error?.code).toBe(
      DeployErrorCode.RELEASE_VERIFICATION_FAILED
    );
    expect(clients.kvs.send).not.toHaveBeenCalled();
  });

  test('rollback preserves the high-water mark and rejects delayed builds', async () => {
    const clients = await prepare();
    await atomicDeploy({ ...config, clients, revision: 'r10-old' });
    await atomicDeploy({ ...config, clients });
    await rollbackRelease({
      ...config,
      clients,
      revision: 'r10-old',
      expectedActiveRevision: 'r20-new',
    });
    expect(clients.keys.get('activeRevision')).toBe('r10-old');
    expect(clients.keys.get('highestPromotedRevision')).toBe('r20-new');
    for (const revision of ['r15-delayed', 'r20-new', 'r20-other']) {
      await expect(
        promoteRelease(clients.kvs, 'store', revision)
      ).rejects.toMatchObject({ code: DeployErrorCode.STALE_RELEASE });
    }
    await expect(
      promoteRelease(clients.kvs, 'store', 'r21-next')
    ).resolves.toMatchObject({ promoted: true });
  });

  test('rollback never replaces a newer active revision', async () => {
    const clients = await prepare();
    await atomicDeploy({ ...config, clients, revision: 'r10-old' });
    clients.keys.set('activeRevision', 'r30-concurrent');
    await expect(
      rollbackRelease({
        ...config,
        clients,
        revision: 'r10-old',
        expectedActiveRevision: 'r20-new',
      })
    ).rejects.toMatchObject({ code: DeployErrorCode.ROLLBACK_CONFLICT });
    expect(clients.keys.get('activeRevision')).toBe('r30-concurrent');
  });

  test('rollback rejects a corrupt retained object and malformed manifest', async () => {
    const clients = await prepare();
    await atomicDeploy({ ...config, clients, revision: 'r10-old' });
    clients.keys.set('activeRevision', 'r20-new');
    clients.objects.set('releases/r10-old/index.html', Buffer.from('x'));
    const rollback = {
      ...config,
      clients,
      revision: 'r10-old',
      expectedActiveRevision: 'r20-new',
    };
    await expect(rollbackRelease(rollback)).rejects.toMatchObject({
      code: DeployErrorCode.RELEASE_VERIFICATION_FAILED,
    });
    clients.objects.set(
      'releases/r10-old/release-manifest.json',
      Buffer.from('{bad')
    );
    await expect(rollbackRelease(rollback)).rejects.toMatchObject({
      code: DeployErrorCode.RELEASE_VERIFICATION_FAILED,
    });
    expect(clients.keys.get('activeRevision')).toBe('r20-new');
  });

  test('rejects a 404 page exceeding the edge response budget before AWS writes', async () => {
    const clients = await prepare();
    await fs.promises.writeFile(
      path.join(distPath, '404.html'),
      Buffer.alloc(900 * 1024 + 1)
    );
    expect((await atomicDeploy({ ...config, clients })).error?.code).toBe(
      DeployErrorCode.RELEASE_VERIFICATION_FAILED
    );
    expect(clients.s3.send).not.toHaveBeenCalled();
  });

  test('public verification failure leaves a concurrent publisher untouched', async () => {
    const clients = await prepare();
    const result = await atomicDeploy({
      ...config,
      clients,
      publicVerification: {
        siteUrl: 'https://site.test',
        timeoutMs: 1,
        retryDelayMs: 0,
        fetch: vi.fn(async () => {
          clients.keys.set('activeRevision', 'r30-concurrent');
          return new Response('unavailable', { status: 503 });
        }),
      },
    });
    expect(result).toMatchObject({
      success: false,
      promoted: true,
      error: { code: DeployErrorCode.PUBLIC_VERIFICATION_FAILED },
    });
    expect(clients.keys.get('activeRevision')).toBe('r30-concurrent');
  });

  test('accepts a concurrent identical conditional upload after verifying bytes', async () => {
    const clients = await prepare();
    const original = clients.s3.send.getMockImplementation()!;
    let raced = false;
    clients.s3.send.mockImplementation(async (command) => {
      if (command instanceof PutObjectCommand && !raced) {
        raced = true;
        await original(command);
        throw namedError('PreconditionFailed');
      }
      return original(command);
    });
    expect((await atomicDeploy({ ...config, clients })).success).toBe(true);
    expect(raced).toBe(true);
  });

  test('rejects same-size checksum mismatch after upload', async () => {
    const clients = await prepare();
    const original = clients.s3.send.getMockImplementation()!;
    clients.s3.send.mockImplementation(async (command) => {
      const result = await original(command);
      if (command instanceof PutObjectCommand) {
        clients.checksums.set(
          command.input.Key!,
          digest(Buffer.from('corrupt'))
        );
      }
      return result;
    });
    expect((await atomicDeploy({ ...config, clients })).error?.code).toBe(
      DeployErrorCode.RELEASE_VERIFICATION_FAILED
    );
    expect(clients.kvs.send).not.toHaveBeenCalled();
  });

  test('rechecks the active revision after a rollback ETag conflict', async () => {
    const clients = await prepare();
    await atomicDeploy({ ...config, clients, revision: 'r10-old' });
    clients.keys.set('activeRevision', 'r20-new');
    const original = clients.kvs.send.getMockImplementation()!;
    clients.kvs.send.mockImplementation(async (command) => {
      if (command instanceof UpdateKeysCommand) {
        clients.keys.set('activeRevision', 'r30-concurrent');
        throw namedError('ConflictException');
      }
      return original(command);
    });
    await expect(
      rollbackRelease({
        ...config,
        clients,
        revision: 'r10-old',
        expectedActiveRevision: 'r20-new',
      })
    ).rejects.toMatchObject({ code: DeployErrorCode.ROLLBACK_CONFLICT });
    expect(clients.keys.get('activeRevision')).toBe('r30-concurrent');
  });

  test('dry runs validate locally and do not mutate AWS', async () => {
    const clients = await prepare();
    expect(
      (await atomicDeploy({ ...config, clients, dryRun: true })).success
    ).toBe(true);
    expect(clients.s3.send).not.toHaveBeenCalled();
    expect(clients.keys.size).toBe(0);
    await atomicDeploy({ ...config, clients, revision: 'r10-old' });
    clients.keys.set('activeRevision', 'r20-new');
    await rollbackRelease({
      ...config,
      clients,
      revision: 'r10-old',
      expectedActiveRevision: 'r20-new',
      dryRun: true,
    });
    expect(clients.keys.get('activeRevision')).toBe('r20-new');
  });
});
