/**
 * Atomic deployment for the public Astro site.
 *
 * A release is uploaded completely before the single activeRevision pointer in
 * CloudFront KeyValueStore is changed. Hashed Astro assets stay at /_astro so
 * both the old and new release remain usable while the KVS update propagates.
 */
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  CloudFrontKeyValueStoreClient,
  DescribeKeyValueStoreCommand,
  GetKeyCommand,
  UpdateKeysCommand,
} from '@aws-sdk/client-cloudfront-keyvaluestore';
import { SignatureV4a } from '@aws-sdk/signature-v4a';
import * as fs from 'node:fs';
import { createHash } from 'node:crypto';
import * as path from 'node:path';
import { lookup as mimeLookup } from 'mime-types';
import {
  validateSiteUrl,
  verifyPublicRelease,
  type PublicVerificationConfig,
} from './publicVerification';

const MAX_SIZE_BYTES = 50 * 1024 * 1024;
const ACTIVE_REVISION_KEY = 'activeRevision';
const HIGH_WATER_REVISION_KEY = 'highestPromotedRevision';
export const MANIFEST_PATH = 'release-manifest.json';
export const RELEASE_PLAN_PATH = 'release-plan.json';
export const REQUIRED_FILES = [
  'index.html',
  '404.html',
  'about/index.html',
  'rss.xml',
  'robots.txt',
  'sitemap-index.xml',
  'sitemap-0.xml',
] as const;
const MAX_PROMOTION_ATTEMPTS = 3;
const UPLOAD_CONCURRENCY = 8;
const RELEASE_PATTERN = /^r\d+(?:-[a-z0-9][a-z0-9._-]*)?$/;

export enum DeployErrorCode {
  SIZE_EXCEEDED = 'SIZE_EXCEEDED',
  DIST_PATH_NOT_FOUND = 'DIST_PATH_NOT_FOUND',
  INVALID_REVISION = 'INVALID_REVISION',
  RELEASE_UPLOAD_FAILED = 'RELEASE_UPLOAD_FAILED',
  RELEASE_VERIFICATION_FAILED = 'RELEASE_VERIFICATION_FAILED',
  RELEASE_CONFLICT = 'RELEASE_CONFLICT',
  STALE_RELEASE = 'STALE_RELEASE',
  KVS_PROMOTION_FAILED = 'KVS_PROMOTION_FAILED',
  ROLLBACK_CONFLICT = 'ROLLBACK_CONFLICT',
  PUBLIC_VERIFICATION_FAILED = 'PUBLIC_VERIFICATION_FAILED',
}

export class DeployError extends Error {
  constructor(
    public readonly code: DeployErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'DeployError';
  }
}

export interface CommandClient {
  send(command: object): Promise<unknown>;
}

/**
 * CloudFront KVS requires SigV4A. Pass the JavaScript signer directly instead
 * of relying on the SDK's process-global registration container: package
 * managers may install multiple @smithy/signature-v4 module instances.
 */
export function createKeyValueStoreClient(): CloudFrontKeyValueStoreClient {
  return new CloudFrontKeyValueStoreClient({
    region: 'us-east-1',
    signerConstructor: SignatureV4a,
  });
}

export interface AtomicDeployConfig {
  bucketName: string;
  keyValueStoreArn: string;
  distPath: string;
  region: string;
  /** Release name with an epoch-seconds sequence shared by all deployers. */
  revision?: string;
  dryRun?: boolean;
  publicVerification?: PublicVerificationConfig;
  /** Test seam. Production callers must not set this. */
  clients?: {
    s3: CommandClient;
    kvs: CommandClient;
  };
}

export interface AtomicDeployResult {
  success: boolean;
  buildId: string;
  versionPrefix?: string;
  filesUploaded?: number;
  totalSizeBytes?: number;
  previousRevision?: string;
  promoted?: boolean;
  durationMs: number;
  error?: {
    code: DeployErrorCode;
    message: string;
  };
}

export interface SizeValidationResult {
  valid: boolean;
  sizeBytes: number;
  error?: string;
}

interface FileEntry {
  localPath?: string;
  body?: Buffer;
  relativePath: string;
  sizeBytes: number;
  sha256: string;
}

export function generateBuildId(): string {
  // Epoch seconds, not milliseconds: every deployer sharing the release KVS
  // (CodeBuild, GitHub Actions, local-deploy.sh) sequences revisions in
  // seconds, and a millisecond value would permanently outrank them.
  const timestamp = Math.floor(Date.now() / 1000);
  const random = Math.random().toString(36).substring(2, 8);
  return `r${timestamp}-${random}`;
}

export function validateRevision(revision: string): boolean {
  return (
    RELEASE_PATTERN.test(revision) &&
    revision.length <= 128 &&
    getRevisionSequence(revision) !== undefined
  );
}

export function getVersionPrefix(revision: string): string {
  return `releases/${revision}/`;
}

export function getDeploymentKey(
  relativePath: string,
  revision: string
): string {
  return relativePath.startsWith('_astro/')
    ? relativePath
    : `${getVersionPrefix(revision)}${relativePath}`;
}

export function getRevisionSequence(revision: string): number | undefined {
  const match = revision.match(/^r(\d+)(?:-|$)/);
  if (!match) return undefined;
  const sequence = Number(match[1]);
  return Number.isSafeInteger(sequence) ? sequence : undefined;
}

export function isStaleRevision(candidate: string, current?: string): boolean {
  if (!current || candidate === current) return false;
  const candidateSequence = getRevisionSequence(candidate);
  const currentSequence = getRevisionSequence(current);
  return (
    candidateSequence !== undefined &&
    currentSequence !== undefined &&
    candidateSequence <= currentSequence
  );
}

export async function calculateDirectorySize(dirPath: string): Promise<number> {
  try {
    const stats = await fs.promises.stat(dirPath);
    if (!stats.isDirectory()) return stats.size;

    let totalSize = 0;
    for (const entry of await fs.promises.readdir(dirPath, {
      withFileTypes: true,
    })) {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        totalSize += await calculateDirectorySize(entryPath);
      } else if (entry.isFile()) {
        totalSize += (await fs.promises.stat(entryPath)).size;
      }
    }
    return totalSize;
  } catch {
    return 0;
  }
}

export function validateDirectorySize(sizeBytes: number): SizeValidationResult {
  if (sizeBytes <= MAX_SIZE_BYTES) return { valid: true, sizeBytes };
  return {
    valid: false,
    sizeBytes,
    error: `Directory size (${(sizeBytes / 1024 / 1024).toFixed(1)} MB) exceeds maximum allowed size of 50 MB`,
  };
}

export function getCacheControl(filename: string): string {
  if (
    filename.endsWith('.html') ||
    filename.endsWith('.xml') ||
    filename === 'robots.txt' ||
    filename === MANIFEST_PATH
  ) {
    return 'public,max-age=0,must-revalidate';
  }
  return 'public,max-age=31536000,immutable';
}

export function getContentType(filename: string): string {
  return mimeLookup(filename) || 'application/octet-stream';
}

async function listFiles(dirPath: string, basePath = ''): Promise<FileEntry[]> {
  const files: FileEntry[] = [];
  for (const entry of await fs.promises.readdir(dirPath, {
    withFileTypes: true,
  })) {
    const localPath = path.join(dirPath, entry.name);
    const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await listFiles(localPath, relativePath)));
    } else if (entry.isFile()) {
      const body = await fs.promises.readFile(localPath);
      files.push({
        localPath,
        relativePath,
        sizeBytes: body.length,
        sha256: digest(body),
      });
    } else {
      throw new DeployError(
        DeployErrorCode.RELEASE_VERIFICATION_FAILED,
        `Unsupported distribution entry: ${relativePath}`
      );
    }
  }
  return files;
}

function isNotFound(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'NotFound' ||
      error.name === 'NoSuchKey' ||
      error.name === 'ResourceNotFoundException')
  );
}

export function digest(body: Uint8Array): string {
  return createHash('sha256').update(body).digest('base64');
}

export interface ReleaseManifest {
  schemaVersion: 1;
  revision: string;
  files: { path: string; sizeBytes: number; sha256: string }[];
}

function validateRequiredFiles(
  files: { relativePath: string; sizeBytes: number }[]
): void {
  for (const required of REQUIRED_FILES) {
    if (
      !files.some(
        (file) => file.relativePath === required && file.sizeBytes > 0
      )
    ) {
      throw new DeployError(
        DeployErrorCode.RELEASE_VERIFICATION_FAILED,
        `Missing or empty required file: ${required}`
      );
    }
  }
  if (
    files.find((file) => file.relativePath === '404.html')!.sizeBytes >
    900 * 1024
  ) {
    throw new DeployError(
      DeployErrorCode.RELEASE_VERIFICATION_FAILED,
      '404.html exceeds the Lambda@Edge response budget (900 KiB plus headers)'
    );
  }
}

function createManifest(revision: string, files: FileEntry[]): FileEntry {
  validateRequiredFiles(files);
  if (
    files.some((file) =>
      [MANIFEST_PATH, RELEASE_PLAN_PATH].includes(file.relativePath)
    )
  ) {
    throw new DeployError(
      DeployErrorCode.RELEASE_CONFLICT,
      `Release metadata paths are reserved for deployment`
    );
  }
  const manifest: ReleaseManifest = {
    schemaVersion: 1,
    revision,
    files: files
      .map((file) => ({
        path: file.relativePath,
        sizeBytes: file.sizeBytes,
        sha256: file.sha256,
      }))
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
  };
  const body = Buffer.from(JSON.stringify(manifest) + '\n');
  return {
    relativePath: MANIFEST_PATH,
    body,
    sizeBytes: body.length,
    sha256: digest(body),
  };
}

async function verifyObject(
  client: CommandClient,
  bucketName: string,
  key: string,
  expected: { sizeBytes: number; sha256: string }
): Promise<'missing' | 'match' | 'mismatch'> {
  try {
    const response = (await client.send(
      new HeadObjectCommand({
        Bucket: bucketName,
        Key: key,
        ChecksumMode: 'ENABLED',
      })
    )) as { ContentLength?: number; ChecksumSHA256?: string; ETag?: string };
    if (response.ContentLength !== expected.sizeBytes) return 'mismatch';
    if (response.ChecksumSHA256) {
      return response.ChecksumSHA256 === expected.sha256 ? 'match' : 'mismatch';
    }
    // Legacy deployments did not persist SHA-256. Verify their bytes without
    // overwriting an immutable object. ETag is a concurrency guard, not a hash.
    const object = (await client.send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
        IfMatch: response.ETag,
      })
    )) as { Body?: { transformToByteArray(): Promise<Uint8Array> } };
    if (!object.Body) return 'mismatch';
    const body = await object.Body.transformToByteArray();
    return body.length === expected.sizeBytes &&
      digest(body) === expected.sha256
      ? 'match'
      : 'mismatch';
  } catch (error) {
    if (isNotFound(error)) return 'missing';
    throw error;
  }
}

async function uploadAndVerifyFiles(
  client: CommandClient,
  config: AtomicDeployConfig,
  revision: string,
  files: FileEntry[],
  dryRun: boolean
): Promise<void> {
  // Assets first: old and new HTML can safely coexist during KVS propagation.
  const uploadFile = async (file: FileEntry): Promise<void> => {
    const key = getDeploymentKey(file.relativePath, revision);
    if (dryRun) {
      console.log(
        `[DRY-RUN] Would upload and verify ${file.relativePath} -> s3://${config.bucketName}/${key}`
      );
      return;
    }

    const existing = await verifyObject(client, config.bucketName, key, file);
    if (existing !== 'missing') {
      if (existing === 'match') return;
      throw new DeployError(
        DeployErrorCode.RELEASE_CONFLICT,
        `Existing object has different content: s3://${config.bucketName}/${key}`
      );
    }

    const body = file.body ?? (await fs.promises.readFile(file.localPath!));
    if (body.length !== file.sizeBytes || digest(body) !== file.sha256) {
      throw new DeployError(
        DeployErrorCode.RELEASE_VERIFICATION_FAILED,
        `Distribution changed during deployment: ${file.relativePath}`
      );
    }
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucketName,
          Key: key,
          Body: body,
          ChecksumSHA256: file.sha256,
          CacheControl: getCacheControl(file.relativePath),
          ContentType: getContentType(file.relativePath),
          IfNoneMatch: '*',
        })
      );
    } catch (error) {
      // A concurrent release may upload the same shared asset. Accept only
      // identical bytes after the conditional write loses that race.
      if (!(error instanceof Error) || error.name !== 'PreconditionFailed')
        throw error;
    }
    const uploaded = await verifyObject(client, config.bucketName, key, file);
    if (uploaded !== 'match') {
      throw new DeployError(
        DeployErrorCode.RELEASE_VERIFICATION_FAILED,
        `Uploaded object verification failed: s3://${config.bucketName}/${key}`
      );
    }
  };

  // Keep the asset barrier and bound both requests and in-memory file bodies.
  // On failure, stop taking new files and drain all in-flight workers before
  // returning. A caller must never promote while verification is outstanding.
  for (const group of [
    files.filter((file) => file.relativePath.startsWith('_astro/')),
    files.filter((file) => !file.relativePath.startsWith('_astro/')),
  ]) {
    let next = 0;
    let failed = false;
    let failure: unknown;
    const worker = async (): Promise<void> => {
      while (!failed && next < group.length) {
        const file = group[next++];
        try {
          await uploadFile(file);
        } catch (error) {
          if (!failed) failure = error;
          failed = true;
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(UPLOAD_CONCURRENCY, group.length) }, worker)
    );
    if (failed) throw failure;
  }
}

async function timedDeploymentPhase<T>(
  phase: 'upload-and-verify' | 'promote',
  revision: string,
  operation: () => Promise<T>
): Promise<T> {
  const startedAt = Date.now();
  let succeeded = false;
  try {
    const result = await operation();
    succeeded = true;
    return result;
  } finally {
    console.log(
      JSON.stringify({
        event: 'site-deploy-phase',
        phase,
        revision,
        durationMs: Date.now() - startedAt,
        status: succeeded ? 'succeeded' : 'failed',
      })
    );
  }
}

async function getRevisionKey(
  client: CommandClient,
  keyValueStoreArn: string,
  key: string = ACTIVE_REVISION_KEY
): Promise<string | undefined> {
  try {
    const response = (await client.send(
      new GetKeyCommand({
        KvsARN: keyValueStoreArn,
        Key: key,
      })
    )) as { Value?: string };
    return response.Value;
  } catch (error) {
    if (isNotFound(error)) return undefined;
    throw error;
  }
}

export async function promoteRelease(
  client: CommandClient,
  keyValueStoreArn: string,
  revision: string,
  dryRun = false
): Promise<{ previousRevision?: string; promoted: boolean }> {
  let previousRevision: string | undefined;

  for (let attempt = 1; attempt <= MAX_PROMOTION_ATTEMPTS; attempt += 1) {
    // Capture the ETag before reading the pointer. Any concurrent promotion
    // after this point makes IfMatch fail, including one that happens between
    // the pointer read and our update.
    const description = dryRun
      ? undefined
      : ((await client.send(
          new DescribeKeyValueStoreCommand({ KvsARN: keyValueStoreArn })
        )) as { ETag?: string });
    previousRevision = await getRevisionKey(client, keyValueStoreArn);
    const highWater = await getRevisionKey(
      client,
      keyValueStoreArn,
      HIGH_WATER_REVISION_KEY
    );
    if (
      !validateRevision(revision) ||
      (previousRevision && !validateRevision(previousRevision)) ||
      (highWater && !validateRevision(highWater))
    ) {
      throw new DeployError(
        DeployErrorCode.INVALID_REVISION,
        'Invalid KVS release state or candidate'
      );
    }
    if (
      isStaleRevision(revision, previousRevision) ||
      isStaleRevision(revision, highWater) ||
      (highWater === revision && previousRevision !== revision)
    ) {
      throw new DeployError(
        DeployErrorCode.STALE_RELEASE,
        `Refusing out-of-order release ${revision} (active=${previousRevision ?? 'unset'}, highest=${highWater ?? 'unset'})`
      );
    }
    if (previousRevision === revision) {
      return { previousRevision, promoted: false };
    }
    if (dryRun) {
      console.log(
        `[DRY-RUN] Would update ${ACTIVE_REVISION_KEY}: ${previousRevision ?? '(unset)'} -> ${revision}`
      );
      return { previousRevision, promoted: true };
    }

    if (!description?.ETag) {
      throw new DeployError(
        DeployErrorCode.KVS_PROMOTION_FAILED,
        'CloudFront KeyValueStore did not return an ETag'
      );
    }

    try {
      await client.send(
        new UpdateKeysCommand({
          KvsARN: keyValueStoreArn,
          IfMatch: description.ETag,
          Puts: [
            { Key: ACTIVE_REVISION_KEY, Value: revision },
            { Key: HIGH_WATER_REVISION_KEY, Value: revision },
          ],
        })
      );
      return { previousRevision, promoted: true };
    } catch (error) {
      if (!(error instanceof Error) || error.name !== 'ConflictException') {
        throw error;
      }
      if (attempt === MAX_PROMOTION_ATTEMPTS) throw error;
    }
  }

  throw new DeployError(
    DeployErrorCode.KVS_PROMOTION_FAILED,
    'CloudFront KeyValueStore promotion retries were exhausted'
  );
}

export async function atomicDeploy(
  config: AtomicDeployConfig
): Promise<AtomicDeployResult> {
  const startTime = Date.now();
  const revision = config.revision ?? generateBuildId();
  const dryRun = config.dryRun ?? false;
  const clients =
    config.clients ??
    ({
      s3: new S3Client({ region: config.region }) as unknown as CommandClient,
      // CloudFront KVS is a global data-plane API exposed through us-east-1.
      kvs: createKeyValueStoreClient() as unknown as CommandClient,
    } satisfies AtomicDeployConfig['clients']);

  try {
    if (config.publicVerification)
      validateSiteUrl(config.publicVerification.siteUrl);
    if (!validateRevision(revision)) {
      throw new DeployError(
        DeployErrorCode.INVALID_REVISION,
        `Invalid release revision: ${revision}`
      );
    }
    if (!fs.existsSync(config.distPath)) {
      throw new DeployError(
        DeployErrorCode.DIST_PATH_NOT_FOUND,
        `Distribution path not found: ${config.distPath}`
      );
    }

    console.log('Validating distribution size...');
    const totalSize = await calculateDirectorySize(config.distPath);
    const sizeValidation = validateDirectorySize(totalSize);
    if (!sizeValidation.valid) {
      throw new DeployError(
        DeployErrorCode.SIZE_EXCEEDED,
        sizeValidation.error!
      );
    }

    const files = await listFiles(config.distPath);
    const manifest = createManifest(revision, files);
    console.log(
      `Uploading ${files.length} files to ${getVersionPrefix(revision)} (shared assets remain under _astro/)`
    );
    try {
      await timedDeploymentPhase('upload-and-verify', revision, async () => {
        // Claim the revision with its complete immutable file list before writing
        // content. Concurrent publishers cannot add different files to this prefix.
        await uploadAndVerifyFiles(
          clients.s3,
          config,
          revision,
          [{ ...manifest, relativePath: RELEASE_PLAN_PATH }],
          dryRun
        );
        await uploadAndVerifyFiles(clients.s3, config, revision, files, dryRun);
        // Persist the immutable completion record only after every entry verifies.
        await uploadAndVerifyFiles(
          clients.s3,
          config,
          revision,
          [manifest],
          dryRun
        );
      });
    } catch (error) {
      if (error instanceof DeployError) throw error;
      throw new DeployError(
        DeployErrorCode.RELEASE_UPLOAD_FAILED,
        `Release upload failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    console.log(`Promoting release ${revision} through CloudFront KVS...`);
    let promotion: { previousRevision?: string; promoted: boolean };
    try {
      promotion = await timedDeploymentPhase('promote', revision, () =>
        promoteRelease(clients.kvs, config.keyValueStoreArn, revision, dryRun)
      );
    } catch (error) {
      if (error instanceof DeployError) throw error;
      throw new DeployError(
        DeployErrorCode.KVS_PROMOTION_FAILED,
        `KVS promotion failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (config.publicVerification && !dryRun) {
      try {
        await verifyPublicRelease(
          config.publicVerification,
          JSON.parse(manifest.body!.toString('utf8'))
        );
      } catch {
        return {
          success: false,
          buildId: revision,
          previousRevision: promotion.previousRevision,
          promoted: promotion.promoted,
          durationMs: Date.now() - startTime,
          error: {
            code: DeployErrorCode.PUBLIC_VERIFICATION_FAILED,
            message:
              'Public verification failed after pointer promotion; inspect activeRevision before guarded rollback',
          },
        };
      }
    }

    return {
      success: true,
      buildId: revision,
      versionPrefix: getVersionPrefix(revision),
      filesUploaded: files.length,
      totalSizeBytes: totalSize,
      previousRevision: promotion.previousRevision,
      promoted: promotion.promoted,
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    const deployError =
      error instanceof DeployError
        ? error
        : new DeployError(
            DeployErrorCode.RELEASE_UPLOAD_FAILED,
            error instanceof Error ? error.message : String(error)
          );
    return {
      success: false,
      buildId: revision,
      durationMs: Date.now() - startTime,
      error: { code: deployError.code, message: deployError.message },
    };
  }
}

/** Verify a retained release before changing the pointer; never re-upload it. */
export async function verifyRetainedRelease(
  client: CommandClient,
  bucketName: string,
  revision: string
): Promise<ReleaseManifest> {
  if (!validateRevision(revision)) {
    throw new DeployError(
      DeployErrorCode.INVALID_REVISION,
      'Invalid rollback revision'
    );
  }
  const response = (await client.send(
    new GetObjectCommand({
      Bucket: bucketName,
      Key: getDeploymentKey(MANIFEST_PATH, revision),
    })
  )) as { Body?: { transformToByteArray(): Promise<Uint8Array> } };
  if (!response.Body) {
    throw new DeployError(
      DeployErrorCode.RELEASE_VERIFICATION_FAILED,
      'Missing release manifest'
    );
  }
  const body = await response.Body.transformToByteArray();
  let manifest: ReleaseManifest;
  try {
    manifest = JSON.parse(Buffer.from(body).toString('utf8'));
    if (
      manifest.schemaVersion !== 1 ||
      manifest.revision !== revision ||
      !Array.isArray(manifest.files) ||
      manifest.files.length === 0
    )
      throw new Error();
    const seen = new Set<string>();
    let total = 0;
    for (const file of manifest.files) {
      if (
        typeof file.path !== 'string' ||
        [MANIFEST_PATH, RELEASE_PLAN_PATH].includes(file.path) ||
        file.path.startsWith('/') ||
        file.path.includes('\\') ||
        file.path
          .split('/')
          .some((part) => !part || part === '.' || part === '..') ||
        seen.has(file.path) ||
        !Number.isSafeInteger(file.sizeBytes) ||
        file.sizeBytes < 0 ||
        typeof file.sha256 !== 'string' ||
        !/^[A-Za-z0-9+/]{43}=$/.test(file.sha256)
      )
        throw new Error();
      seen.add(file.path);
      total += file.sizeBytes;
    }
    if (!validateDirectorySize(total).valid) throw new Error();
    validateRequiredFiles(
      manifest.files.map((file) => ({ ...file, relativePath: file.path }))
    );
  } catch {
    throw new DeployError(
      DeployErrorCode.RELEASE_VERIFICATION_FAILED,
      'Invalid release manifest'
    );
  }
  // Sequential verification keeps recovery requests bounded and easy to audit.
  for (const file of manifest.files) {
    if (
      (await verifyObject(
        client,
        bucketName,
        getDeploymentKey(file.path, revision),
        file
      )) !== 'match'
    ) {
      throw new DeployError(
        DeployErrorCode.RELEASE_VERIFICATION_FAILED,
        `Retained release verification failed: ${file.path}`
      );
    }
  }
  return manifest;
}

export interface RollbackConfig {
  bucketName: string;
  keyValueStoreArn: string;
  region: string;
  revision: string;
  expectedActiveRevision: string;
  dryRun?: boolean;
  clients?: AtomicDeployConfig['clients'];
  publicVerification?: PublicVerificationConfig;
}

/** Explicit recovery operation. A newer publisher must never be rolled back. */
export async function rollbackRelease(config: RollbackConfig): Promise<void> {
  if (
    !validateRevision(config.expectedActiveRevision) ||
    !validateRevision(config.revision) ||
    getRevisionSequence(config.revision)! >=
      getRevisionSequence(config.expectedActiveRevision)!
  ) {
    throw new DeployError(
      DeployErrorCode.INVALID_REVISION,
      'Rollback requires an older target and a valid expected active revision'
    );
  }
  if (config.publicVerification)
    validateSiteUrl(config.publicVerification.siteUrl);
  const clients = config.clients ?? {
    s3: new S3Client({ region: config.region }),
    kvs: createKeyValueStoreClient(),
  };
  const manifest = await verifyRetainedRelease(
    clients.s3,
    config.bucketName,
    config.revision
  );
  for (let attempt = 1; attempt <= MAX_PROMOTION_ATTEMPTS; attempt++) {
    const description = (await clients.kvs.send(
      new DescribeKeyValueStoreCommand({
        KvsARN: config.keyValueStoreArn,
      })
    )) as { ETag?: string };
    const active = await getRevisionKey(clients.kvs, config.keyValueStoreArn);
    const highWater = await getRevisionKey(
      clients.kvs,
      config.keyValueStoreArn,
      HIGH_WATER_REVISION_KEY
    );
    if (active !== config.expectedActiveRevision) {
      throw new DeployError(
        DeployErrorCode.ROLLBACK_CONFLICT,
        'Active revision changed; refusing rollback'
      );
    }
    if ((highWater && !validateRevision(highWater)) || !description.ETag) {
      throw new DeployError(
        DeployErrorCode.KVS_PROMOTION_FAILED,
        'Invalid KVS rollback state'
      );
    }
    if (config.dryRun) return;
    try {
      await clients.kvs.send(
        new UpdateKeysCommand({
          KvsARN: config.keyValueStoreArn,
          IfMatch: description.ETag,
          Puts: [
            { Key: ACTIVE_REVISION_KEY, Value: config.revision },
            // Preserve ordering even when rolling back a pre-manifest publisher.
            {
              Key: HIGH_WATER_REVISION_KEY,
              Value:
                highWater &&
                getRevisionSequence(highWater)! > getRevisionSequence(active)!
                  ? highWater
                  : active,
            },
          ],
        })
      );
      if (config.publicVerification)
        await verifyPublicRelease(config.publicVerification, manifest);
      return;
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.name !== 'ConflictException' ||
        attempt === MAX_PROMOTION_ATTEMPTS
      )
        throw error;
    }
  }
}
