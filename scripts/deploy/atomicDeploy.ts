/**
 * Atomic deployment for the public Astro site.
 *
 * A release is uploaded completely before the single activeRevision pointer in
 * CloudFront KeyValueStore is changed. Hashed Astro assets stay at /_astro so
 * both the old and new release remain usable while the KVS update propagates.
 */
import {
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
import * as path from 'node:path';
import { lookup as mimeLookup } from 'mime-types';

const MAX_SIZE_BYTES = 50 * 1024 * 1024;
const ACTIVE_REVISION_KEY = 'activeRevision';
const MAX_PROMOTION_ATTEMPTS = 3;
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

interface CommandClient {
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
  /** Monotonic release name. CodeBuild uses r{CODEBUILD_BUILD_NUMBER}-{sha}. */
  revision?: string;
  dryRun?: boolean;
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
  localPath: string;
  relativePath: string;
  sizeBytes: number;
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
  return RELEASE_PATTERN.test(revision) && revision.length <= 128;
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
    candidateSequence < currentSequence
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
    filename === 'robots.txt'
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
      files.push({
        localPath,
        relativePath,
        sizeBytes: (await fs.promises.stat(localPath)).size,
      });
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

async function headObjectSize(
  client: CommandClient,
  bucketName: string,
  key: string
): Promise<number | undefined> {
  try {
    const response = (await client.send(
      new HeadObjectCommand({ Bucket: bucketName, Key: key })
    )) as { ContentLength?: number };
    return response.ContentLength;
  } catch (error) {
    if (isNotFound(error)) return undefined;
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
  const orderedFiles = [
    ...files.filter((file) => file.relativePath.startsWith('_astro/')),
    ...files.filter((file) => !file.relativePath.startsWith('_astro/')),
  ];

  for (const file of orderedFiles) {
    const key = getDeploymentKey(file.relativePath, revision);
    if (dryRun) {
      console.log(
        `[DRY-RUN] Would upload and verify ${file.relativePath} -> s3://${config.bucketName}/${key}`
      );
      continue;
    }

    const existingSize = await headObjectSize(client, config.bucketName, key);
    if (existingSize !== undefined) {
      if (existingSize === file.sizeBytes) continue;
      throw new DeployError(
        DeployErrorCode.RELEASE_CONFLICT,
        `Existing object has different size: s3://${config.bucketName}/${key}`
      );
    }

    await client.send(
      new PutObjectCommand({
        Bucket: config.bucketName,
        Key: key,
        Body: await fs.promises.readFile(file.localPath),
        CacheControl: getCacheControl(file.relativePath),
        ContentType: getContentType(file.relativePath),
        IfNoneMatch: '*',
      })
    );

    const uploadedSize = await headObjectSize(client, config.bucketName, key);
    if (uploadedSize !== file.sizeBytes) {
      throw new DeployError(
        DeployErrorCode.RELEASE_VERIFICATION_FAILED,
        `Uploaded object verification failed: s3://${config.bucketName}/${key}`
      );
    }
  }
}

async function getActiveRevision(
  client: CommandClient,
  keyValueStoreArn: string
): Promise<string | undefined> {
  try {
    const response = (await client.send(
      new GetKeyCommand({
        KvsARN: keyValueStoreArn,
        Key: ACTIVE_REVISION_KEY,
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
    previousRevision = await getActiveRevision(client, keyValueStoreArn);
    if (isStaleRevision(revision, previousRevision)) {
      throw new DeployError(
        DeployErrorCode.STALE_RELEASE,
        `Refusing to replace newer active release ${previousRevision} with ${revision}`
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
          Puts: [{ Key: ACTIVE_REVISION_KEY, Value: revision }],
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
    console.log(
      `Uploading ${files.length} files to ${getVersionPrefix(revision)} (shared assets remain under _astro/)`
    );
    try {
      await uploadAndVerifyFiles(clients.s3, config, revision, files, dryRun);
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
      promotion = await promoteRelease(
        clients.kvs,
        config.keyValueStoreArn,
        revision,
        dryRun
      );
    } catch (error) {
      if (error instanceof DeployError) throw error;
      throw new DeployError(
        DeployErrorCode.KVS_PROMOTION_FAILED,
        `KVS promotion failed: ${error instanceof Error ? error.message : String(error)}`
      );
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
